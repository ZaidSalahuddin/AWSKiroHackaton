/**
 * Notification Service
 * Centralized dispatcher for FCM (Android) and APNs (iOS) push notifications.
 * Handles all notification job types defined in Requirements 12.2, 12.5, 13.3,
 * 13.4, 15.3, 17.7, 17.8.
 *
 * FCM and APNs are stubbed — replace with real SDK calls when credentials are available.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationJobType =
  | 'meal_plan_reminder'
  | 'menu_change'
  | 'streak_broken'
  | 'badge_awarded'
  | 'event_special'
  | 'social_activity'
  | 'availability_prediction'
  | 'availability_confirmed';

export interface DeviceToken {
  platform: 'android' | 'ios';
  token: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationJob {
  type: NotificationJobType;
  studentId: string;
  deviceTokens: DeviceToken[];
  /** Job-type-specific context data */
  context: Record<string, unknown>;
}

// ─── FCM stub ─────────────────────────────────────────────────────────────────

/**
 * Sends a push notification via FCM (Android).
 * Stub implementation — replace with firebase-admin SDK call.
 */
export async function sendFcmNotification(
  token: string,
  payload: NotificationPayload,
): Promise<{ success: boolean; messageId?: string }> {
  console.log(`[FCM] → token=${token} title="${payload.title}" body="${payload.body}"`);
  // Real implementation:
  // const message = { token, notification: { title: payload.title, body: payload.body }, data: payload.data };
  // const result = await admin.messaging().send(message);
  // return { success: true, messageId: result };
  return { success: true, messageId: `fcm-stub-${Date.now()}` };
}

// ─── APNs stub ────────────────────────────────────────────────────────────────

/**
 * Sends a push notification via APNs (iOS).
 * Stub implementation — replace with @parse/node-apn or apn SDK call.
 */
export async function sendApnsNotification(
  token: string,
  payload: NotificationPayload,
): Promise<{ success: boolean; apnsId?: string }> {
  console.log(`[APNs] → token=${token} title="${payload.title}" body="${payload.body}"`);
  // Real implementation:
  // const note = new apn.Notification();
  // note.alert = { title: payload.title, body: payload.body };
  // note.payload = payload.data ?? {};
  // const result = await apnProvider.send(note, token);
  // return { success: result.sent.length > 0, apnsId: result.sent[0]?.device };
  return { success: true, apnsId: `apns-stub-${Date.now()}` };
}

// ─── Payload builders ─────────────────────────────────────────────────────────

export function buildPayload(
  type: NotificationJobType,
  context: Record<string, unknown>,
): NotificationPayload {
  switch (type) {
    case 'meal_plan_reminder':
      return {
        title: 'Meal Plan Reminder',
        body: `Your planned meal "${context.itemName ?? 'item'}" starts in 30 minutes at ${context.diningHallName ?? 'the dining hall'}.`,
        data: {
          type,
          menuItemId: String(context.menuItemId ?? ''),
          diningHallId: String(context.diningHallId ?? ''),
          mealPeriod: String(context.mealPeriod ?? ''),
        },
      };

    case 'menu_change':
      return {
        title: 'Menu Change Alert',
        body: `"${context.itemName ?? 'An item'}" you planned to eat has been removed from the upcoming menu.`,
        data: {
          type,
          menuItemId: String(context.menuItemId ?? ''),
          diningHallId: String(context.diningHallId ?? ''),
        },
      };

    case 'streak_broken':
      return {
        title: 'Streak Broken',
        body: `Your ${context.previousStreak ?? ''}-day streak has been reset. Start a new one today!`,
        data: {
          type,
          previousStreak: String(context.previousStreak ?? 0),
        },
      };

    case 'badge_awarded':
      return {
        title: 'Badge Earned! 🏅',
        body: `Congratulations! You earned the "${context.badgeName ?? 'new'}" badge.`,
        data: {
          type,
          badgeType: String(context.badgeType ?? ''),
          badgeName: String(context.badgeName ?? ''),
        },
      };

    case 'event_special':
      return {
        title: 'Special Event at Your Favorite Dining Hall',
        body: `${context.diningHallName ?? 'A dining hall'} just posted a special: "${context.specialTitle ?? 'New special'}".`,
        data: {
          type,
          eventSpecialId: String(context.eventSpecialId ?? ''),
          diningHallId: String(context.diningHallId ?? ''),
        },
      };

    case 'social_activity':
      return {
        title: 'Friend Activity',
        body: `${context.friendName ?? 'A friend'} ${context.activityDescription ?? 'did something'}.`,
        data: {
          type,
          actorStudentId: String(context.actorStudentId ?? ''),
          activityType: String(context.activityType ?? ''),
        },
      };

    case 'availability_prediction':
      return {
        title: 'Item Coming Soon',
        body: `"${context.itemName ?? 'An item'}" you subscribed to is predicted to appear within the next 24 hours at ${context.diningHallName ?? 'a dining hall'}.`,
        data: {
          type,
          menuItemId: String(context.menuItemId ?? ''),
          diningHallId: String(context.diningHallId ?? ''),
          predictedDate: String(context.predictedDate ?? ''),
          predictedPeriod: String(context.predictedPeriod ?? ''),
        },
      };

    case 'availability_confirmed':
      return {
        title: 'Item Confirmed on Menu',
        body: `"${context.itemName ?? 'An item'}" you subscribed to is confirmed on the upcoming menu at ${context.diningHallName ?? 'a dining hall'}.`,
        data: {
          type,
          menuItemId: String(context.menuItemId ?? ''),
          diningHallId: String(context.diningHallId ?? ''),
          confirmedDate: String(context.confirmedDate ?? ''),
          confirmedPeriod: String(context.confirmedPeriod ?? ''),
        },
      };

    default: {
      const _exhaustive: never = type;
      return { title: 'Notification', body: 'You have a new notification.' };
    }
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Dispatches a push notification to all device tokens for a student.
 * Sends via FCM for Android tokens and APNs for iOS tokens.
 * Returns a summary of successes and failures.
 */
export async function dispatchNotification(job: NotificationJob): Promise<{
  sent: number;
  failed: number;
  errors: string[];
}> {
  const payload = buildPayload(job.type, job.context);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  await Promise.all(
    job.deviceTokens.map(async ({ platform, token }) => {
      try {
        if (platform === 'android') {
          const result = await sendFcmNotification(token, payload);
          if (result.success) {
            sent++;
          } else {
            failed++;
            errors.push(`FCM failed for token ${token}`);
          }
        } else {
          const result = await sendApnsNotification(token, payload);
          if (result.success) {
            sent++;
          } else {
            failed++;
            errors.push(`APNs failed for token ${token}`);
          }
        }
      } catch (err) {
        failed++;
        errors.push(`${platform} error for token ${token}: ${String(err)}`);
      }
    }),
  );

  return { sent, failed, errors };
}
