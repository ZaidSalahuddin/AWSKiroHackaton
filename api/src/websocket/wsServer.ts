/**
 * WebSocket server — attaches to an existing Node.js http.Server.
 *
 * Protocol (JSON messages):
 *
 *   Client → Server:
 *     { type: 'subscribe',   channel: string }
 *     { type: 'unsubscribe', channel: string }
 *
 *   Server → Client:
 *     { type: 'update',  channel: string, data: unknown }
 *     { type: 'replay',  channel: string, data: unknown }   ← on reconnect
 *     { type: 'error',   message: string }
 *
 * Reconnect replay:
 *   On subscribe the server immediately sends the last known state for that
 *   channel (stored in Redis under `ws:state:{channel}`).
 */

import type { WebSocket as WsWebSocket, WebSocketServer as WsWebSocketServer } from 'ws';
import type { Server as HttpServer } from 'http';
import { redis } from '../cache/redis';
import { getRankedItems } from '../services/ratingService';
import { getTrendingFeed } from '../services/trendingFeedService';
import { Channels } from './channels';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  channel: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

/** Map from channel name → set of subscribed WebSocket clients */
const subscriptions = new Map<string, Set<WsWebSocket>>();

/** Map from WebSocket client → set of subscribed channels */
const clientChannels = new Map<WsWebSocket, Set<string>>();

let wss: WsWebSocketServer | null = null;

// ─── Redis state helpers ──────────────────────────────────────────────────────

const STATE_TTL = 300; // 5 minutes

async function saveChannelState(channel: string, data: unknown): Promise<void> {
  await redis.setEx(`ws:state:${channel}`, STATE_TTL, JSON.stringify(data));
}

async function loadChannelState(channel: string): Promise<unknown | null> {
  const raw = await redis.get(`ws:state:${channel}`);
  return raw ? JSON.parse(raw) : null;
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

function broadcast(channel: string, type: 'update' | 'replay', data: unknown): void {
  const clients = subscriptions.get(channel);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ type, channel, data });
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(payload);
    }
  }
}

export async function pushToChannel(channel: string, data: unknown): Promise<void> {
  await saveChannelState(channel, data);
  broadcast(channel, 'update', data);
}

// ─── Subscription management ──────────────────────────────────────────────────

function subscribe(ws: WsWebSocket, channel: string): void {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel)!.add(ws);

  if (!clientChannels.has(ws)) {
    clientChannels.set(ws, new Set());
  }
  clientChannels.get(ws)!.add(channel);
}

function unsubscribe(ws: WsWebSocket, channel: string): void {
  subscriptions.get(channel)?.delete(ws);
  clientChannels.get(ws)?.delete(channel);
}

function removeClient(ws: WsWebSocket): void {
  const channels = clientChannels.get(ws);
  if (channels) {
    for (const ch of channels) {
      subscriptions.get(ch)?.delete(ws);
    }
  }
  clientChannels.delete(ws);
}

// ─── Replay on subscribe ──────────────────────────────────────────────────────

async function replayState(ws: WsWebSocket, channel: string): Promise<void> {
  const state = await loadChannelState(channel);
  if (state !== null && ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify({ type: 'replay', channel, data: state }));
  }
}

// ─── Periodic push jobs ───────────────────────────────────────────────────────

/** Fetch all distinct dining hall IDs that have active subscribers */
async function getSubscribedHallIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const channel of subscriptions.keys()) {
    if (channel.startsWith('rankings:') && (subscriptions.get(channel)?.size ?? 0) > 0) {
      ids.push(channel.slice('rankings:'.length));
    }
  }
  return ids;
}

/** Push ranked items for every subscribed dining hall (every 30 s) */
async function pushRankingUpdates(): Promise<void> {
  const hallIds = await getSubscribedHallIds();
  for (const hallId of hallIds) {
    try {
      const items = await getRankedItems(hallId);
      await pushToChannel(Channels.rankings(hallId), { items });
    } catch (err) {
      console.error(`[WS] rankings push failed for hall ${hallId}:`, err);
    }
  }
}

/** Push trending feed to all subscribers (every 60 s) */
async function pushTrendingUpdate(): Promise<void> {
  const channel = Channels.trending();
  if ((subscriptions.get(channel)?.size ?? 0) === 0) return;
  try {
    const feed = await getTrendingFeed();
    await pushToChannel(channel, feed);
  } catch (err) {
    console.error('[WS] trending push failed:', err);
  }
}

// ─── Server initialisation ────────────────────────────────────────────────────

export function initWebSocketServer(httpServer: HttpServer): WsWebSocketServer {
  // Lazy-require ws so the module can be imported in tests without side-effects
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebSocketServer, WebSocket: WS } = require('ws') as typeof import('ws');

  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WsWebSocket) => {
    ws.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid_json' }));
        return;
      }

      if (msg.type === 'subscribe') {
        subscribe(ws, msg.channel);
        await replayState(ws, msg.channel);
      } else if (msg.type === 'unsubscribe') {
        unsubscribe(ws, msg.channel);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'unknown_message_type' }));
      }
    });

    ws.on('close', () => removeClient(ws));
    ws.on('error', () => removeClient(ws));
  });

  // Rankings: push every 30 seconds
  setInterval(() => {
    pushRankingUpdates().catch((err) =>
      console.error('[WS] rankings interval error:', err),
    );
  }, 30_000);

  // Trending: push every 60 seconds
  setInterval(() => {
    pushTrendingUpdate().catch((err) =>
      console.error('[WS] trending interval error:', err),
    );
  }, 60_000);

  console.log('[WS] WebSocket server initialised');
  return wss;
}

export { wss };
