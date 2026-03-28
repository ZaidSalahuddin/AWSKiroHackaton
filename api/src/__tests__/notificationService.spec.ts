/**
 * Tests for notificationService — payload builders and dispatcher.
 *
 * Covers Requirements: 12.2, 12.5, 13.3, 13.4, 15.3, 17.7, 17.8
 */

import {
  buildPayload,
  dispatchNotification,
  sendFcmNotification,
  sendApnsNotification,
  NotificationJob,
  NotificationJobType,
} from '../services/notificationService';

// ─── buildPayload unit tests ──────────────────────────────────────────────────

describe('buildPayload', () => {
  const ALL_TYPES: NotificationJobType[] = [
    'meal_plan_reminder',
    'menu_change',
    'streak_broken',
    'badge_awarded',
    'event_special',
    'social_activity',
    'availability_prediction',
    'availability_confirmed',
  ];

  it('returns a payload with non-empty title and body for every job type', () => {
    for (const type of ALL_TYPES) {
      const payload = buildPayload(type, {});
      expect(typeof payload.title).toBe('string');
      expect(payload.title.length).toBeGreaterThan(0);
      expect(typeof payload.body).toBe('string');
      expect(payload.body.length).toBeGreaterThan(0);
    }
  });

  it('meal_plan_reminder includes item name and dining hall in body', () => {
    const payload = buildPayload('meal_plan_reminder', {
      itemName: 'Mac & Cheese',
      diningHallName: 'West End',
      mealPeriod: 'lunch',
    });
    expect(payload.body).toContain('Mac & Cheese');
    expect(payload.body).toContain('West End');
    expect(payload.data?.type).toBe('meal_plan_reminder');
  });

  it('menu_change includes item name in body', () => {
    const payload = buildPayload('menu_change', { itemName: 'Grilled Salmon' });
    expect(payload.body).toContain('Grilled Salmon');
    expect(payload.data?.type).toBe('menu_change');
  });

  it('streak_broken includes previous streak in body', () => {
    const payload = buildPayload('streak_broken', { previousStreak: 14 });
    expect(payload.body).toContain('14');
    expect(payload.data?.previousStreak).toBe('14');
  });

  it('badge_awarded includes badge name in body', () => {
    const payload = buildPayload('badge_awarded', {
      badgeName: '7-Day Streak',
      badgeType: 'streak_7',
    });
    expect(payload.body).toContain('7-Day Streak');
    expect(payload.data?.badgeType).toBe('streak_7');
  });

  it('event_special includes dining hall name and special title', () => {
    const payload = buildPayload('event_special', {
      diningHallName: 'D2',
      specialTitle: 'Lobster Night',
    });
    expect(payload.body).toContain('D2');
    expect(payload.body).toContain('Lobster Night');
    expect(payload.data?.type).toBe('event_special');
  });

  it('social_activity includes friend name and activity description', () => {
    const payload = buildPayload('social_activity', {
      friendName: 'Alice',
      activityDescription: 'rated Mac & Cheese 5 stars',
    });
    expect(payload.body).toContain('Alice');
    expect(payload.body).toContain('rated Mac & Cheese 5 stars');
  });

  it('availability_prediction includes item name and dining hall', () => {
    const payload = buildPayload('availability_prediction', {
      itemName: 'Chicken Tikka',
      diningHallName: 'Turner Place',
      predictedDate: '2024-03-15',
      predictedPeriod: 'lunch',
    });
    expect(payload.body).toContain('Chicken Tikka');
    expect(payload.body).toContain('Turner Place');
    expect(payload.data?.predictedDate).toBe('2024-03-15');
  });

  it('availability_confirmed includes item name and dining hall', () => {
    const payload = buildPayload('availability_confirmed', {
      itemName: 'Beef Bulgogi',
      diningHallName: 'Owens',
      confirmedDate: '2024-03-16',
      confirmedPeriod: 'dinner',
    });
    expect(payload.body).toContain('Beef Bulgogi');
    expect(payload.body).toContain('Owens');
    expect(payload.data?.confirmedDate).toBe('2024-03-16');
  });

  it('falls back gracefully when context fields are missing', () => {
    // Should not throw for any type with empty context
    for (const type of ALL_TYPES) {
      expect(() => buildPayload(type, {})).not.toThrow();
    }
  });
});

// ─── FCM / APNs stub tests ────────────────────────────────────────────────────

describe('sendFcmNotification', () => {
  it('returns success=true with a messageId', async () => {
    const result = await sendFcmNotification('test-fcm-token', {
      title: 'Test',
      body: 'Hello',
    });
    expect(result.success).toBe(true);
    expect(typeof result.messageId).toBe('string');
  });
});

describe('sendApnsNotification', () => {
  it('returns success=true with an apnsId', async () => {
    const result = await sendApnsNotification('test-apns-token', {
      title: 'Test',
      body: 'Hello',
    });
    expect(result.success).toBe(true);
    expect(typeof result.apnsId).toBe('string');
  });
});

// ─── dispatchNotification tests ───────────────────────────────────────────────

describe('dispatchNotification', () => {
  it('sends to all device tokens and returns correct sent count', async () => {
    const job: NotificationJob = {
      type: 'badge_awarded',
      studentId: 'student-1',
      deviceTokens: [
        { platform: 'android', token: 'fcm-token-1' },
        { platform: 'ios', token: 'apns-token-1' },
        { platform: 'android', token: 'fcm-token-2' },
      ],
      context: { badgeName: '7-Day Streak', badgeType: 'streak_7' },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns sent=0 and no errors for empty device token list', async () => {
    const job: NotificationJob = {
      type: 'streak_broken',
      studentId: 'student-2',
      deviceTokens: [],
      context: { previousStreak: 5 },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('handles android-only tokens', async () => {
    const job: NotificationJob = {
      type: 'menu_change',
      studentId: 'student-3',
      deviceTokens: [{ platform: 'android', token: 'fcm-only' }],
      context: { itemName: 'Pizza', menuItemId: 'item-1' },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('handles ios-only tokens', async () => {
    const job: NotificationJob = {
      type: 'event_special',
      studentId: 'student-4',
      deviceTokens: [{ platform: 'ios', token: 'apns-only' }],
      context: { diningHallName: 'West End', specialTitle: 'Taco Tuesday' },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('dispatches correct payload for meal_plan_reminder (Req 13.3)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const job: NotificationJob = {
      type: 'meal_plan_reminder',
      studentId: 'student-5',
      deviceTokens: [{ platform: 'android', token: 'fcm-reminder' }],
      context: {
        itemName: 'Waffles',
        diningHallName: 'West End',
        mealPeriod: 'breakfast',
        menuItemId: 'item-waffle',
        diningHallId: 'hall-west-end',
      },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(1);

    // Verify the log contains the item name (payload was built correctly)
    const logCalls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(logCalls.some((l) => l.includes('Waffles'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('dispatches correct payload for availability_prediction (Req 17.7)', async () => {
    const job: NotificationJob = {
      type: 'availability_prediction',
      studentId: 'student-6',
      deviceTokens: [
        { platform: 'ios', token: 'apns-avail' },
        { platform: 'android', token: 'fcm-avail' },
      ],
      context: {
        itemName: 'Chicken Tikka Masala',
        diningHallName: 'D2',
        predictedDate: '2024-03-20',
        predictedPeriod: 'dinner',
        menuItemId: 'item-tikka',
        diningHallId: 'hall-d2',
      },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('dispatches correct payload for availability_confirmed (Req 17.8)', async () => {
    const job: NotificationJob = {
      type: 'availability_confirmed',
      studentId: 'student-7',
      deviceTokens: [{ platform: 'ios', token: 'apns-confirmed' }],
      context: {
        itemName: 'Beef Bulgogi',
        diningHallName: 'Owens',
        confirmedDate: '2024-03-21',
        confirmedPeriod: 'lunch',
        menuItemId: 'item-bulgogi',
        diningHallId: 'hall-owens',
      },
    };

    const result = await dispatchNotification(job);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });
});
