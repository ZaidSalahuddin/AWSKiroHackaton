import { WsClientMessage, WsServerMessage } from '../types';

type MessageHandler = (msg: WsServerMessage) => void;

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

class VTDiningWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private subscribedChannels: Set<string> = new Set();
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.intentionallyClosed = false;
    this._open();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(channel: string): void {
    this.subscribedChannels.add(channel);
    this._send({ type: 'subscribe', channel });
  }

  unsubscribe(channel: string): void {
    this.subscribedChannels.delete(channel);
    this._send({ type: 'unsubscribe', channel });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private _open(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      // Re-subscribe to all channels after reconnect (server replays last state)
      for (const channel of this.subscribedChannels) {
        this._send({ type: 'subscribe', channel });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsServerMessage = JSON.parse(event.data as string);
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      if (!this.intentionallyClosed) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * BACKOFF_MULTIPLIER,
        MAX_RECONNECT_DELAY_MS,
      );
      this._open();
    }, this.reconnectDelay);
  }

  private _send(msg: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

const WS_URL = (process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000') + '/ws';

export const wsClient = new VTDiningWebSocketClient(WS_URL);
export default wsClient;
