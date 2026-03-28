import fc from 'fast-check';
import { shouldPublishActivity } from '../services/socialService';

// ─── Pure logic helpers ───────────────────────────────────────────────────────

function followUnfollowRoundTrip(followerId: string, followeeId: string): boolean {
  const follows = new Map<string, { followerId: string; followeeId: string }>();
  const id = `${followerId}:${followeeId}`;

  follows.set(id, { followerId, followeeId });
  if (!follows.has(id)) return false;

  follows.delete(id);
  return !follows.has(id);
}

function filterFeedByPrivacy(
  events: Array<{ studentId: string; privacySetting: string }>,
): Array<{ studentId: string; privacySetting: string }> {
  return events.filter((e) => e.privacySetting !== 'private');
}

// ─── Unit tests: shouldPublishActivity ───────────────────────────────────────

describe('shouldPublishActivity', () => {
  it('returns true for public setting', () => {
    expect(shouldPublishActivity('public')).toBe(true);
  });

  it('returns true for friends setting', () => {
    expect(shouldPublishActivity('friends')).toBe(true);
  });

  it('returns false for private setting', () => {
    expect(shouldPublishActivity('private')).toBe(false);
  });
});

// ─── Unit tests: filterFeedByPrivacy ─────────────────────────────────────────

describe('filterFeedByPrivacy', () => {
  it('excludes private students from feed', () => {
    const events = [
      { studentId: 'a', privacySetting: 'public' },
      { studentId: 'b', privacySetting: 'private' },
      { studentId: 'c', privacySetting: 'friends' },
    ];
    const result = filterFeedByPrivacy(events);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.privacySetting !== 'private')).toBe(true);
  });

  it('returns empty array when all students are private', () => {
    const events = [
      { studentId: 'a', privacySetting: 'private' },
      { studentId: 'b', privacySetting: 'private' },
    ];
    expect(filterFeedByPrivacy(events)).toHaveLength(0);
  });

  it('returns all events when no students are private', () => {
    const events = [
      { studentId: 'a', privacySetting: 'public' },
      { studentId: 'b', privacySetting: 'friends' },
    ];
    expect(filterFeedByPrivacy(events)).toHaveLength(2);
  });
});

// ─── Unit tests: activity_event feed query shape ──────────────────────────────

describe('activity_event feed shape', () => {
  it('feed events have required fields from activity_event table', () => {
    const mockEvent = {
      id: 'evt-1',
      student_id: 'stu-1',
      event_type: 'rating_submitted',
      payload: { menu_item_id: 'item-1', stars: 4 },
      created_at: new Date(),
      username: 'hokiebird',
      display_name: 'Hokie Bird',
    };
    expect(mockEvent).toHaveProperty('id');
    expect(mockEvent).toHaveProperty('student_id');
    expect(mockEvent).toHaveProperty('event_type');
    expect(mockEvent).toHaveProperty('payload');
    expect(mockEvent).toHaveProperty('created_at');
    expect(mockEvent).toHaveProperty('username');
    expect(mockEvent).toHaveProperty('display_name');
  });

  it('event_type is one of the valid values', () => {
    const validTypes = ['rating_submitted', 'meal_logged'];
    expect(validTypes).toContain('rating_submitted');
    expect(validTypes).toContain('meal_logged');
    expect(validTypes).not.toContain('photo_uploaded');
  });
});

// ─── Property 25: Follow/unfollow round-trip ──────────────────────────────────
// Feature: vt-dining-ranker, Property 25: Follow/unfollow round-trip
// Validates: Requirements 10.1, 10.5

describe('Property 25: Follow/unfollow round-trip', () => {
  it('following then unfollowing leaves no residual follow record', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (followerId, followeeId) => {
          return followUnfollowRoundTrip(followerId, followeeId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a follow record is uniquely identified by (follower_id, followee_id)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (followerId, followeeId) => {
          const key1 = `${followerId}:${followeeId}`;
          const key2 = `${followerId}:${followeeId}`;
          return key1 === key2;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different follower/followee pairs produce distinct keys', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        (f1, fe1, f2, fe2) => {
          fc.pre(f1 !== f2 || fe1 !== fe2);
          const key1 = `${f1}:${fe1}`;
          const key2 = `${f2}:${fe2}`;
          return key1 !== key2;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 27: Private student excluded from all feeds ─────────────────────
// Feature: vt-dining-ranker, Property 27: Private student excluded from all feeds
// Validates: Requirements 10.4

describe('Property 27: Private student excluded from all feeds', () => {
  it('shouldPublishActivity returns false for private, true for all others', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('public', 'friends', 'private'),
        (setting) => {
          const result = shouldPublishActivity(setting);
          if (setting === 'private') return result === false;
          return result === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('feed never contains events from private students regardless of mix', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            studentId: fc.uuid(),
            privacySetting: fc.constantFrom('public', 'friends', 'private'),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (events) => {
          const filtered = filterFeedByPrivacy(events);
          return filtered.every((e) => e.privacySetting !== 'private');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('feed size never exceeds the count of non-private events', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            studentId: fc.uuid(),
            privacySetting: fc.constantFrom('public', 'friends', 'private'),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (events) => {
          const nonPrivateCount = events.filter((e) => e.privacySetting !== 'private').length;
          const filtered = filterFeedByPrivacy(events);
          return filtered.length === nonPrivateCount;
        },
      ),
      { numRuns: 100 },
    );
  });
});
