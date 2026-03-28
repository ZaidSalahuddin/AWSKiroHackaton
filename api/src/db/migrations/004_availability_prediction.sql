-- Migration: 004_availability_prediction
-- Adds prediction_data column to menu_item for caching computed availability predictions
-- Requirement 17.4, 17.9

ALTER TABLE menu_item
  ADD COLUMN IF NOT EXISTS prediction_data JSONB;

COMMENT ON COLUMN menu_item.prediction_data IS
  'Cached availability prediction: { prediction_available, patterns, predicted_next }';
