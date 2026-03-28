/**
 * Channel name helpers for WebSocket subscriptions.
 * Channels:
 *   rankings:{hall_id}     — ranked items for a dining hall (pushed every 30 s)
 *   trending               — trending feed (pushed every 60 s)
 *   social:{student_id}    — social feed events for a student (pushed within 60 s)
 *   photos:{item_id}       — photo-upload events for a menu item (pushed within 30 s)
 */

export const Channels = {
  rankings: (hallId: string) => `rankings:${hallId}`,
  trending: () => 'trending',
  social: (studentId: string) => `social:${studentId}`,
  photos: (itemId: string) => `photos:${itemId}`,
} as const;

export type ChannelName = string;
