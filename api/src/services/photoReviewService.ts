import { pool } from '../db/client';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface PhotoValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Pure function: validate photo file metadata before upload.
 */
export function validatePhoto(mimeType: string, sizeBytes: number): PhotoValidationResult {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, error: 'invalid_format' };
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'file_too_large' };
  }
  return { valid: true };
}

/**
 * Store a photo review record after upload to object storage.
 * storageUrl is the CDN URL returned by the S3-compatible upload.
 */
export async function createPhotoReview(ratingId: string, storageUrl: string) {
  const result = await pool.query(
    `INSERT INTO photo_review (rating_id, storage_url, status)
     VALUES ($1, $2, 'visible')
     RETURNING *`,
    [ratingId, storageUrl],
  );
  return result.rows[0];
}

/**
 * Report a photo as inappropriate — sets status to 'hidden' immediately.
 * A moderation job would be enqueued here in production.
 */
export async function reportPhoto(photoId: string) {
  const result = await pool.query(
    `UPDATE photo_review SET status = 'hidden' WHERE id = $1 RETURNING *`,
    [photoId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
  }
  return result.rows[0];
}

/**
 * Get all visible photos for a menu item (via its ratings).
 */
export async function getPhotosForMenuItem(menuItemId: string) {
  const result = await pool.query(
    `SELECT pr.*
     FROM photo_review pr
     JOIN rating r ON r.id = pr.rating_id
     WHERE r.menu_item_id = $1 AND pr.status = 'visible'
     ORDER BY pr.created_at DESC`,
    [menuItemId],
  );
  return result.rows;
}
