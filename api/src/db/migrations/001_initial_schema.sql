-- Migration: 001_initial_schema
-- Creates all core tables for VT Dining Ranker

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── student ─────────────────────────────────────────────────────────────────

CREATE TABLE student (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vt_email                 TEXT NOT NULL UNIQUE,
  username                 TEXT NOT NULL UNIQUE,
  display_name             TEXT NOT NULL,
  password_hash            TEXT NOT NULL,
  dietary_profile          JSONB NOT NULL DEFAULT '{}',
  nutrition_targets        JSONB,
  leaderboard_opt_out      BOOLEAN NOT NULL DEFAULT false,
  privacy_setting          VARCHAR(16) NOT NULL DEFAULT 'friends'
                             CHECK (privacy_setting IN ('public', 'friends', 'private')),
  hokie_passport_connected BOOLEAN NOT NULL DEFAULT false,
  hokie_passport_token_enc TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── dining_hall ─────────────────────────────────────────────────────────────

CREATE TABLE dining_hall (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  location       TEXT NOT NULL,
  has_sensor_data BOOLEAN NOT NULL DEFAULT false
);

-- ─── menu_item ───────────────────────────────────────────────────────────────

CREATE TABLE menu_item (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dining_hall_id           UUID NOT NULL REFERENCES dining_hall(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',
  station                  TEXT NOT NULL,
  meal_period              VARCHAR(16) NOT NULL
                             CHECK (meal_period IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  menu_date                DATE NOT NULL,
  allergens                JSONB NOT NULL DEFAULT '[]',
  allergen_data_complete   BOOLEAN NOT NULL DEFAULT true,
  nutrition                JSONB,
  health_score             FLOAT,
  recency_score            FLOAT NOT NULL DEFAULT 0,
  recency_score_updated_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_item_dining_hall_id ON menu_item(dining_hall_id);
CREATE INDEX idx_menu_item_menu_date      ON menu_item(menu_date);
CREATE INDEX idx_menu_item_meal_period    ON menu_item(meal_period);
CREATE INDEX idx_menu_item_recency_score  ON menu_item(recency_score DESC);

-- ─── rating ──────────────────────────────────────────────────────────────────

CREATE TABLE rating (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  menu_item_id     UUID NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  stars            INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  meal_period      VARCHAR(16) NOT NULL
                     CHECK (meal_period IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  meal_date        DATE NOT NULL,
  check_in_verified BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, menu_item_id, meal_period, meal_date)
);

CREATE INDEX idx_rating_student_id   ON rating(student_id);
CREATE INDEX idx_rating_menu_item_id ON rating(menu_item_id);
CREATE INDEX idx_rating_created_at   ON rating(created_at);
CREATE INDEX idx_rating_meal_date    ON rating(meal_date);

-- ─── photo_review ────────────────────────────────────────────────────────────

CREATE TABLE photo_review (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id   UUID NOT NULL UNIQUE REFERENCES rating(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'visible'
                CHECK (status IN ('visible', 'hidden', 'removed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photo_review_rating_id ON photo_review(rating_id);

-- ─── meal_log ────────────────────────────────────────────────────────────────

CREATE TABLE meal_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  log_date         DATE NOT NULL,
  meal_period      VARCHAR(16) NOT NULL
                     CHECK (meal_period IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  items            JSONB NOT NULL DEFAULT '[]',
  nutrition_totals JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_log_student_id ON meal_log(student_id);
CREATE INDEX idx_meal_log_log_date   ON meal_log(log_date);

-- ─── wait_time_report ────────────────────────────────────────────────────────

CREATE TABLE wait_time_report (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dining_hall_id UUID NOT NULL REFERENCES dining_hall(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  minutes        INT NOT NULL CHECK (minutes >= 0),
  source         VARCHAR(16) NOT NULL
                   CHECK (source IN ('crowdsource', 'sensor')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wait_time_report_dining_hall_id ON wait_time_report(dining_hall_id);
CREATE INDEX idx_wait_time_report_student_id     ON wait_time_report(student_id);
CREATE INDEX idx_wait_time_report_created_at     ON wait_time_report(created_at);

-- ─── meal_plan_entry ─────────────────────────────────────────────────────────

CREATE TABLE meal_plan_entry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  meal_period  VARCHAR(16) NOT NULL
                 CHECK (meal_period IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  completed    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_plan_entry_student_id   ON meal_plan_entry(student_id);
CREATE INDEX idx_meal_plan_entry_menu_item_id ON meal_plan_entry(menu_item_id);

-- ─── follow ──────────────────────────────────────────────────────────────────

CREATE TABLE follow (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, followee_id)
);

CREATE INDEX idx_follow_follower_id ON follow(follower_id);
CREATE INDEX idx_follow_followee_id ON follow(followee_id);

-- ─── badge ───────────────────────────────────────────────────────────────────

CREATE TABLE badge (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  badge_type VARCHAR(32) NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, badge_type)
);

CREATE INDEX idx_badge_student_id ON badge(student_id);

-- ─── event_special ───────────────────────────────────────────────────────────

CREATE TABLE event_special (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dining_hall_id UUID NOT NULL REFERENCES dining_hall(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  event_date     DATE NOT NULL,
  meal_period    VARCHAR(16) NOT NULL
                   CHECK (meal_period IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  created_by     UUID NOT NULL REFERENCES student(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_special_dining_hall_id ON event_special(dining_hall_id);
CREATE INDEX idx_event_special_created_by     ON event_special(created_by);
CREATE INDEX idx_event_special_event_date     ON event_special(event_date);

-- ─── availability_log ────────────────────────────────────────────────────────

CREATE TABLE availability_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id   UUID NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  dining_hall_id UUID NOT NULL REFERENCES dining_hall(id) ON DELETE CASCADE,
  appeared_on    DATE NOT NULL,
  meal_period    VARCHAR(16) NOT NULL
                   CHECK (meal_period IN ('breakfast', 'lunch', 'dinner', 'late_night')),
  logged_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, dining_hall_id, appeared_on, meal_period)
);

CREATE INDEX idx_availability_log_menu_item_id ON availability_log(menu_item_id);
CREATE INDEX idx_availability_log_appeared_on  ON availability_log(appeared_on);
CREATE INDEX idx_availability_log_dining_hall_id ON availability_log(dining_hall_id);

-- ─── availability_subscription ───────────────────────────────────────────────

CREATE TABLE availability_subscription (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, menu_item_id)
);

CREATE INDEX idx_availability_subscription_student_id   ON availability_subscription(student_id);
CREATE INDEX idx_availability_subscription_menu_item_id ON availability_subscription(menu_item_id);
