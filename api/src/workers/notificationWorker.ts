/**
 * Notification Worker
 * BullMQ consumer that processes notification jobs and dispatches FCM/APNs
 * push notifications via the NotificationService.
 *
 * Handles job types: meal_plan_reminder, menu_change, streak_broken,
 * badge_awarded, event_special, social_activity, availability_prediction,
 * availability_confirmed.
 *
 * Requirements: 12.2, 12.5, 13.3, 13.4, 15.3, 17.7, 17.8
 */

import { Worker } from 'bullmq';
import { dispatchNotification, NotificationJob } from '../services/notificationService';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

export function startNotificationWorker() {
  const worker = new Worker(
    'notification',
    async (job) => {
      const notificationJob = job.data as NotificationJob;

      if (!notificationJob.type || !notificationJob.studentId) {
        throw new Error(`Invalid notification job: missing type or studentId (job id=${job.id})`);
      }

      if (!Array.isArray(notificationJob.deviceTokens) || notificationJob.deviceTokens.length === 0) {
        // No device tokens registered — skip silently (student hasn't enabled push)
        console.log(
          `[notification] No device tokens for student ${notificationJob.studentId}, skipping job ${job.id}`,
        );
        return;
      }

      const result = await dispatchNotification(notificationJob);

      console.log(
        `[notification] job=${job.id} type=${notificationJob.type} student=${notificationJob.studentId} ` +
          `sent=${result.sent} failed=${result.failed}`,
      );

      if (result.failed > 0) {
        console.warn(
          `[notification] Partial failure for job ${job.id}: ${result.errors.join('; ')}`,
        );
      }
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[notification] job ${job?.id} failed:`, err);
  });

  return worker;
}
