-- Migration: 003_meal_log_soft_delete
-- Adds deleted_at column to meal_log for 90-day soft-delete support (Requirement 6.5)

ALTER TABLE meal_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meal_log_deleted_at ON meal_log(deleted_at)
  WHERE deleted_at IS NOT NULL;
