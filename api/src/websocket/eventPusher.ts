/**
 * eventPusher — thin helpers called by services/routes to push real-time
 * events to the appropriate WebSocket channels.
 *
 * Social feed events  → social:{student_id}  (for each follower)
 * Photo upload events → photos:{item_id}
 */

import { pool } from '../db/client';
import { pushToChannel } from './wsServer';
import { Channels } from './channels';
import { getPhotosForMenuItem } from '../services/photoReviewService';
import { getSocialFeed } from '../services/socialService';

/**
 * Push a social activity event to all followers of `actorStudentId`.
 * Called after a rating or meal-log is created for a non-private student.
 * Requirement 10.2: pushed within 60 s of triggering event.
 */
export async function pushSocialEvent(
  actorStudentId: string,
  event: Record<string, unknown>,
): Promise<void> {
  try {
    // Fetch all followers of the actor
    const result = await pool.query<{ follower_id: string }>(
      `SELECT follower_id FROM follow WHERE followee_id = $1`,
      [actorStudentId],
    );

    for (const row of result.rows) {
      const channel = Channels.social(row.follower_id);
      // Push the individual event; also snapshot the full feed for replay
      await pushToChannel(channel, { event });
    }
  } catch (err) {
    console.error('[WS] pushSocialEvent failed:', err);
  }
}

/**
 * Push a photo-upload event to the photos:{item_id} channel.
 * Called after a photo is successfully stored.
 * Requirement 11.3: pushed within 30 s of upload.
 */
export async function pushPhotoEvent(
  menuItemId: string,
  photo: Record<string, unknown>,
): Promise<void> {
  try {
    const channel = Channels.photos(menuItemId);
    // Include the full current photo list so clients can refresh
    const photos = await getPhotosForMenuItem(menuItemId);
    await pushToChannel(channel, { photo, photos });
  } catch (err) {
    console.error('[WS] pushPhotoEvent failed:', err);
  }
}
