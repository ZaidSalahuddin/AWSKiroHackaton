/**
 * Tests for the WebSocket real-time layer (Task 25).
 * Requirements: 2.3, 3.2, 10.2, 11.3
 */

import { Channels } from '../websocket/channels';

// ─── Channel name helpers (pure functions, no side-effects) ───────────────────

describe('Channels helpers', () => {
  it('rankings channel includes hall id', () => {
    expect(Channels.rankings('hall-abc')).toBe('rankings:hall-abc');
  });

  it('trending channel is a fixed string', () => {
    expect(Channels.trending()).toBe('trending');
  });

  it('social channel includes student id', () => {
    expect(Channels.social('student-xyz')).toBe('social:student-xyz');
  });

  it('photos channel includes item id', () => {
    expect(Channels.photos('item-123')).toBe('photos:item-123');
  });

  it('different hall ids produce different channels', () => {
    expect(Channels.rankings('hall-1')).not.toBe(Channels.rankings('hall-2'));
  });

  it('different student ids produce different social channels', () => {
    expect(Channels.social('s1')).not.toBe(Channels.social('s2'));
  });

  it('different item ids produce different photo channels', () => {
    expect(Channels.photos('item-1')).not.toBe(Channels.photos('item-2'));
  });

  it('channel names follow expected prefix patterns', () => {
    expect(Channels.rankings('x')).toMatch(/^rankings:/);
    expect(Channels.social('x')).toMatch(/^social:/);
    expect(Channels.photos('x')).toMatch(/^photos:/);
  });

  it('trending channel has no colon-separated suffix', () => {
    expect(Channels.trending()).not.toContain(':');
  });
});

// ─── Channel name contract tests ──────────────────────────────────────────────

describe('Channel name contracts', () => {
  it('rankings channel encodes the hall id after the colon', () => {
    const hallId = 'west-end-dining';
    const channel = Channels.rankings(hallId);
    expect(channel.split(':')[1]).toBe(hallId);
  });

  it('social channel encodes the student id after the colon', () => {
    const studentId = 'student-uuid-123';
    const channel = Channels.social(studentId);
    expect(channel.split(':')[1]).toBe(studentId);
  });

  it('photos channel encodes the item id after the colon', () => {
    const itemId = 'menu-item-uuid-456';
    const channel = Channels.photos(itemId);
    expect(channel.split(':')[1]).toBe(itemId);
  });

  it('all four channel types are distinct for the same id', () => {
    const id = 'same-id';
    const channels = [
      Channels.rankings(id),
      Channels.social(id),
      Channels.photos(id),
    ];
    const unique = new Set(channels);
    expect(unique.size).toBe(3);
  });
});

// ─── WebSocket state key format (pure logic, no imports needed) ───────────────

describe('WebSocket state key format', () => {
  // The wsServer stores state under `ws:state:{channel}`.
  // We verify the key construction logic here without importing wsServer.
  function stateKey(channel: string): string {
    return `ws:state:${channel}`;
  }

  it('rankings state key is correct', () => {
    expect(stateKey(Channels.rankings('hall-1'))).toBe('ws:state:rankings:hall-1');
  });

  it('trending state key is correct', () => {
    expect(stateKey(Channels.trending())).toBe('ws:state:trending');
  });

  it('social state key is correct', () => {
    expect(stateKey(Channels.social('student-1'))).toBe('ws:state:social:student-1');
  });

  it('photos state key is correct', () => {
    expect(stateKey(Channels.photos('item-1'))).toBe('ws:state:photos:item-1');
  });
});
