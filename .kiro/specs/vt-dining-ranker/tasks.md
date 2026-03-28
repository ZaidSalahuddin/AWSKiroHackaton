# Implementation Plan: VT Dining Ranker

## Overview

Monorepo with `api/` (Node.js/Express/TypeScript) and `client/` (React Native/Expo/TypeScript). Tasks are ordered so each step builds on the previous, starting with infrastructure and data models, then backend services, then the real-time layer, then the mobile client. Property-based tests use `fast-check`.

---

## Tasks

- [ ] 1. Initialize monorepo, tooling, and shared types
  - Scaffold `api/` (Node/Express/TypeScript) and `client/` (React Native/Expo/TypeScript) workspaces with shared `tsconfig` base
  - Add `fast-check`, `jest`, `supertest` to `api/`; add `jest` and `@testing-library/react-native` to `client/`
  - Create `api/src/types/` with shared TypeScript interfaces: `Student`, `DiningHall`, `MenuItem`, `Rating`, `MealLog`, `WaitTimeReport`, `MealPlanEntry`, `Follow`, `Badge`, `EventSpecial`, `AvailabilityLog`, `AvailabilitySubscription`, `PhotoReview`
  - _Requirements: 1.1, 2.1, 4.1, 5.1, 6.1, 7.1, 10.1, 11.1, 12.1, 13.1, 14.1, 15.1, 17.1_


- [ ] 2. Database schema and migrations
  - Write PostgreSQL migrations for all tables: `STUDENT`, `DINING_HALL`, `MENU_ITEM`, `RATING`, `PHOTO_REVIEW`, `MEAL_LOG`, `WAIT_TIME_REPORT`, `MEAL_PLAN_ENTRY`, `FOLLOW`, `BADGE`, `EVENT_SPECIAL`, `AVAILABILITY_LOG`, `AVAILABILITY_SUBSCRIPTION`
  - Add indexes on foreign keys and frequently queried columns (`menu_item_id`, `student_id`, `appeared_on`, `created_at`)
  - Set up Redis connection and BullMQ queue definitions (`recency.recompute`, `notification.*`, `trending.refresh`, `availability.predict`)
  - _Requirements: 1.1, 2.1, 6.5, 17.2_

- [ ] 3. Authentication and student account API
  - Implement `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` with JWT session tokens
  - Implement `GET /api/students/:id`, `PUT /api/students/:id` (display name, privacy setting, leaderboard opt-out)
  - Implement `PUT /api/dietary-profile` and `GET /api/dietary-profile` endpoints
  - [ ]* 3.1 Write property test for dietary profile round-trip
    - **Property 10: Dietary profile round-trip**
    - **Validates: Requirements 4.1**
  - [ ]* 3.2 Write property test for privacy setting round-trip
    - **Property 26: Privacy setting round-trip**
    - **Validates: Requirements 10.3**
  - _Requirements: 4.1, 10.3, 14.5_


- [ ] 4. Menu Service
  - Implement VT Dining Services poller (every 5 min), diff logic, and `menu.updated` event emission
  - Implement `GET /api/dining-halls`, `GET /api/dining-halls/:id/menu`, `GET /api/dining-halls/:id/menu?date=&period=`, `GET /api/menu-items/:id`
  - Return cached data with `stale: true` on upstream unavailability; return `{ available: false }` when no cache exists
  - On each menu ingestion, upsert `AVAILABILITY_LOG` records for every item present (feeds Requirement 17)
  - [ ] 4.1 Implement menu item grouping by station
    - Ensure response groups items by `station` field with no null stations
    - _Requirements: 1.1_
  - [ ]* 4.2 Write property test for menu items grouped by station
    - **Property 1: Menu items are grouped by station**
    - **Validates: Requirements 1.1**
  - [ ]* 4.3 Write property test for menu item detail fields
    - **Property 2: Menu item detail contains all required fields**
    - **Validates: Requirements 1.2, 5.2**
  - [ ]* 4.4 Write property test for active meal period presence
    - **Property 3: Active meal period is always present**
    - **Validates: Requirements 1.5**
  - [ ]* 4.5 Write property test for availability log on ingestion
    - **Property 40: Availability log records every menu appearance**
    - **Validates: Requirements 17.1**
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 17.1_


- [ ] 5. Recency Score Engine
  - Implement `recencyScore(item)` pure function: `Σ[rating_i * decay(t_i)] / Σ[decay(t_i)]` with `λ = ln(2)/6`
  - Implement BullMQ worker that consumes `recency.recompute` jobs and persists updated `recency_score` to `MENU_ITEM`
  - Ensure recomputation completes within 10 seconds of job enqueue
  - [ ]* 5.1 Write property test for recency decay weight ratio
    - **Property 4: Recency decay weight ratio**
    - **Validates: Requirements 2.2**
  - [ ]* 5.2 Write property test for ranked list invariants
    - **Property 5: Ranked list invariants (sorted descending, available items only)**
    - **Validates: Requirements 2.3, 2.5**
  - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [ ] 6. Rating Service
  - Implement `POST /api/ratings` with check-in validation (within 90 min) or explicit confirmation flag
  - Enforce one rating per student per item per meal period; return `409` on duplicate
  - After recording, enqueue `recency.recompute` job for the affected item
  - Implement `GET /api/menu-items/:id/ratings` (paginated) and `GET /api/dining-halls/:id/ranked-items`
  - [ ]* 6.1 Write property test for rating requires check-in or confirmation
    - **Property 6: Rating submission requires check-in or confirmation**
    - **Validates: Requirements 2.4**
  - [ ]* 6.2 Write property test for one rating per item per meal period
    - **Property 7: One rating per item per meal period**
    - **Validates: Requirements 2.6**
  - _Requirements: 2.1, 2.4, 2.6_


- [ ] 7. Checkpoint — core data pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Dietary Filter Service
  - Implement middleware that reads `Dietary_Profile` from JWT and excludes conflicting items before response serialization
  - Exclude items with `allergen_data_complete: false` unless `opt_in_incomplete: true`
  - Inject `allergen_warning: true` on item detail responses when a match is found
  - Apply middleware to ranked list, recommendations, and search endpoints
  - [ ]* 8.1 Write property test for dietary filter excludes conflicting items
    - **Property 11: Dietary filter excludes conflicting items**
    - **Validates: Requirements 4.2**
  - [ ]* 8.2 Write property test for allergen warning on conflicting items
    - **Property 12: Allergen warning on conflicting items**
    - **Validates: Requirements 4.3**
  - [ ]* 8.3 Write property test for disable/re-enable preserves profile
    - **Property 13: Dietary filter disable/re-enable preserves profile**
    - **Validates: Requirements 4.4**
  - [ ]* 8.4 Write property test for incomplete allergen items excluded by default
    - **Property 14: Incomplete allergen items excluded by default**
    - **Validates: Requirements 4.5**
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 9. Health Score Service
  - Implement `healthScore(nutrition)` pure function with documented formula (base 10, deductions/bonuses, clamped to [1,10])
  - Compute and persist `health_score` on `MENU_ITEM` during menu ingestion
  - Return `{ health_score: null, nutrition_unavailable: true }` when nutritional data is missing
  - [ ]* 9.1 Write property test for health score range
    - **Property 15: Health score is in range [1, 10]**
    - **Validates: Requirements 5.1**
  - [ ]* 9.2 Write property test for health score determinism
    - **Property 16: Health score is deterministic**
    - **Validates: Requirements 5.3**
  - _Requirements: 5.1, 5.3, 5.4_


- [ ] 10. Trending Feed Service
  - Implement BullMQ worker that runs every 60 seconds: query items with ≥1 rating in past 60 min, sort by `count × recency_score`, take top 10
  - Implement `GET /api/trending`; return `{ items: [], insufficient_activity: true }` when fewer than 3 items qualify
  - Cache result in Redis with 60 s TTL
  - [ ]* 10.1 Write property test for trending feed size and recency
    - **Property 8: Trending feed size and recency**
    - **Validates: Requirements 3.1**
  - [ ]* 10.2 Write property test for trending feed item fields
    - **Property 9: Trending feed item fields**
    - **Validates: Requirements 3.3**
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 11. Nutritional Tracking Service
  - Implement `POST /api/meal-logs`, `GET /api/meal-logs?date=&range=daily|weekly`, `PUT /api/nutrition-targets`
  - Aggregate macros from logged items; store daily totals; soft-delete logs after 90 days
  - Compute `over_calorie_target` flag at read time
  - [ ]* 11.1 Write property test for nutritional log accuracy
    - **Property 17: Nutritional log accuracy**
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 11.2 Write property test for nutrition targets round-trip
    - **Property 18: Nutrition targets round-trip**
    - **Validates: Requirements 6.3**
  - [ ]* 11.3 Write property test for over-target indicator
    - **Property 19: Over-target indicator**
    - **Validates: Requirements 6.4**
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_


- [ ] 12. Wait Time Service
  - Implement `POST /api/wait-time-reports` and `GET /api/dining-halls/:id/wait-time`
  - Compute weighted average of reports in past 30 min (exponential decay by age); treat sensor data as high-weight report
  - Return `{ minutes: null, unknown: true }` when no data in 30 min and no sensor data
  - [ ]* 12.1 Write property test for wait time recency weighting
    - **Property 20: Wait time estimate uses recency weighting**
    - **Validates: Requirements 7.3**
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Weather Integration
  - Implement OpenWeatherMap poller (every 15 min) with Redis cache (15 min TTL)
  - Expose weather data to Recommendation Engine; include `weather_stale: true` on cache fallback
  - [ ]* 13.1 Write property test for weather response required fields
    - **Property 24: Weather response contains required fields**
    - **Validates: Requirements 9.2**
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 14. Recommendation Engine
  - Implement `GET /api/recommendations?input=` with scoring pipeline: dietary filter → `base_score = recency_score*0.4 + rating_history_affinity*0.3 + cuisine_preference_match*0.2 + weather_boost*0.1`
  - Apply weather boost (+20% warm/comfort items when temp < 35°F or precipitation; +20% cold/light items when temp > 85°F)
  - Parse natural language `input` into tags for filter/re-rank
  - Implement progressive filter relaxation when no results satisfy all filters
  - [ ]* 14.1 Write property test for recommendations satisfy dietary profile
    - **Property 21: Recommendations satisfy dietary profile**
    - **Validates: Requirements 8.1**
  - [ ]* 14.2 Write property test for weather boost applied correctly
    - **Property 22: Weather boost applied correctly**
    - **Validates: Requirements 8.3, 8.4**
  - [ ]* 14.3 Write property test for input-based recommendation filtering
    - **Property 23: Input-based recommendation filtering**
    - **Validates: Requirements 8.5**
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_


- [ ] 15. Checkpoint — services layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Social Service
  - Implement `POST /api/follows`, `DELETE /api/follows/:id`, `GET /api/social-feed`, `PUT /api/privacy-settings`
  - Publish activity events (rating, meal log) to fan-out queue; respect privacy settings before fan-out
  - Drop events for `private` users before fan-out
  - [ ]* 16.1 Write property test for follow/unfollow round-trip
    - **Property 25: Follow/unfollow round-trip**
    - **Validates: Requirements 10.1, 10.5**
  - [ ]* 16.2 Write property test for private student excluded from all feeds
    - **Property 27: Private student excluded from all feeds**
    - **Validates: Requirements 10.4**
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 17. Photo Review Service
  - Implement `POST /api/ratings/:id/photo` (multipart, JPEG/PNG, ≤10 MB) with S3-compatible upload
  - Implement `POST /api/photos/:id/report`; set status to `hidden` within 5 min and enqueue moderation job
  - Serve photos via CDN URL stored in `PHOTO_REVIEW.storage_url`
  - [ ]* 17.1 Write property test for photo upload validation
    - **Property 28: Photo upload validation**
    - **Validates: Requirements 11.2**
  - [ ]* 17.2 Write property test for reported photo is hidden
    - **Property 29: Reported photo is hidden**
    - **Validates: Requirements 11.5**
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_


- [ ] 18. Gamification Service
  - Implement daily cron job that increments streak for students who logged a meal that calendar day; reset to 0 and enqueue `streak_broken` notification for those who missed
  - Implement badge award event listeners on meal-log and rating events (streak milestones at 7/30/100 days, Foodie Explorer at 10 distinct items in 7 days)
  - Implement `GET /api/students/:id/gamification` and `GET /api/leaderboard/weekly`; exclude opted-out students from leaderboard
  - [ ]* 18.1 Write property test for streak increments on daily meal log
    - **Property 30: Streak increments on daily meal log**
    - **Validates: Requirements 12.1**
  - [ ]* 18.2 Write property test for Foodie Explorer badge awarded correctly
    - **Property 31: Foodie Explorer badge awarded correctly**
    - **Validates: Requirements 12.3**
  - [ ]* 18.3 Write property test for leaderboard ordering and size
    - **Property 32: Leaderboard ordering and size**
    - **Validates: Requirements 12.4**
  - [ ]* 18.4 Write property test for streak resets to 0 on missed day
    - **Property 33: Streak resets to 0 on missed day**
    - **Validates: Requirements 12.5**
  - [ ]* 18.5 Write property test for leaderboard opt-out preserves streak and badges
    - **Property 34: Leaderboard opt-out preserves streak and badges**
    - **Validates: Requirements 12.6**
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [ ] 19. Meal Planning Service
  - Implement `GET /api/meal-plans`, `POST /api/meal-plans`, `PUT /api/meal-plans/:id/complete`
  - On complete: auto-log nutrition to `MEAL_LOG` for that date
  - On save: create scheduled BullMQ `meal_plan_reminder` job (30 min before meal period)
  - Subscribe to `menu.updated` events; check all meal plan entries for affected items and enqueue `menu_change` notifications
  - [ ]* 19.1 Write property test for meal plan add round-trip
    - **Property 35: Meal plan add round-trip**
    - **Validates: Requirements 13.2**
  - [ ]* 19.2 Write property test for completing a meal plan entry logs nutrition
    - **Property 36: Completing a meal plan entry logs nutrition**
    - **Validates: Requirements 13.5**
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_


- [ ] 20. Hokie Passport (Meal Plan) Service
  - Implement `GET /api/hokie-passport/balance`, `POST /api/hokie-passport/connect`, `POST /api/hokie-passport/refresh`
  - Poll Meal_Plan_Service daily via BullMQ cron; cache balance with 24 h TTL; return `stale: true` on unavailability
  - Compute `low_balance_warning: true` at read time when `meal_swipes_remaining < 5`
  - [ ]* 20.1 Write property test for meal plan balance display
    - **Property 37: Meal plan balance display**
    - **Validates: Requirements 14.1, 14.2**
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 21. Event Specials Service
  - Implement `POST /api/event-specials` (staff role required; return `403` otherwise) and `GET /api/dining-halls/:id/specials`
  - Inject active specials into Trending Feed response
  - On publish: enqueue `event_special` notification for students who favorited the dining hall
  - [ ]* 21.1 Write property test for event special appears in dining hall page and trending feed
    - **Property 38: Event special appears in dining hall page and trending feed**
    - **Validates: Requirements 15.2**
  - [ ]* 21.2 Write property test for event special has distinct indicator
    - **Property 39: Event special has distinct indicator**
    - **Validates: Requirements 15.4**
  - _Requirements: 15.1, 15.2, 15.3, 15.4_


- [ ] 22. Availability History and Prediction Service
  - Implement `GET /api/menu-items/:id/availability-history` and `GET /api/menu-items/:id/availability-prediction`
  - Implement prediction algorithm: group by `(day_of_week, meal_period, dining_hall_id)` over trailing 90 days; require ≥4 appearances; threshold ≥25% of weeks; return `{ prediction_available: false }` when insufficient history
  - Implement daily BullMQ cron job to recompute predictions; enqueue `availability_prediction` notifications for subscribers when item predicted within 24 h
  - Implement `POST /api/menu-items/:id/subscribe` and `DELETE /api/menu-items/:id/subscribe`
  - On confirmed upcoming menu appearance: enqueue `availability_confirmed` notification for all subscribers regardless of prediction state
  - [ ]* 22.1 Write property test for availability prediction requires minimum history
    - **Property 41: Availability prediction requires minimum history**
    - **Validates: Requirements 17.6**
  - [ ]* 22.2 Write property test for availability prediction based on recurrence patterns
    - **Property 42: Availability prediction is based on recurrence patterns**
    - **Validates: Requirements 17.4**
  - [ ]* 22.3 Write property test for subscription round-trip
    - **Property 43: Subscription round-trip**
    - **Validates: Requirements 17.7**
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9_

- [ ] 23. Notification Service
  - Implement BullMQ consumer that dispatches FCM (Android) and APNs (iOS) push notifications
  - Handle all job types: `meal_plan_reminder`, `menu_change`, `streak_broken`, `badge_awarded`, `event_special`, `social_activity`, `availability_prediction`, `availability_confirmed`
  - _Requirements: 12.2, 12.5, 13.3, 13.4, 15.3, 17.7, 17.8_


- [ ] 24. Checkpoint — all backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 25. WebSocket real-time layer
  - Implement WebSocket server on the Express app; define channels per dining hall (`rankings:{hall_id}`, `trending`, `social:{student_id}`, `photos:{item_id}`)
  - Push ranking updates every 30 s per dining hall channel; push trending feed updates every 60 s
  - Push social feed events to follower channels within 60 s of triggering event
  - Push photo-upload events to item channel within 30 s of upload
  - Implement reconnect replay: on reconnect, server sends last known state for subscribed channels
  - _Requirements: 2.3, 3.2, 10.2, 11.3_

- [ ] 26. React Native client — project setup and navigation
  - Initialize Expo project in `client/` with TypeScript template
  - Set up React Navigation (tab navigator: Home, Trending, Recommendations, Social, Profile)
  - Configure API client (Axios) with JWT interceptor and WebSocket client with exponential-backoff reconnect
  - _Requirements: 1.1, 2.3, 3.2_

- [ ] 27. Client — Home screen (menu display, rankings, wait times, weather, meal plan balance)
  - Implement dining hall list with open/closed status, current meal period, and wait time estimate
  - Display ranked menu items per hall (sorted by `recency_score`, updated via WebSocket)
  - Display current weather (temperature + conditions) with `weather_stale` indicator
  - Display Hokie Passport balance with `low_balance_warning` badge when applicable
  - Show `stale: true` banner when menu data is cached
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.3, 7.1, 9.2, 14.1, 14.2_


- [ ] 28. Client — Menu item detail screen
  - Display name, description, ingredients, allergen tags, `allergen_warning` banner, Health Score, full nutrition panel
  - Display `Previous_Availability_Trend` (bar chart by day-of-week/meal-period) and predicted next appearance or "Not enough history to predict"
  - Show subscribe/unsubscribe button for availability notifications
  - Display photo reviews (CDN images) with report button; show new photos via WebSocket push within 30 s
  - _Requirements: 1.2, 4.3, 5.2, 5.4, 17.3, 17.5, 17.6, 17.7, 11.3, 11.4_

- [ ] 29. Client — Rating submission flow
  - Implement star-rating UI with check-in confirmation prompt
  - Allow optional photo attachment (JPEG/PNG, ≤10 MB); show validation error on invalid format/size
  - Disable submit if student already rated this item this meal period; show "Already rated" message
  - _Requirements: 2.1, 2.4, 2.6, 11.1, 11.2_

- [ ] 30. Client — Trending Feed screen
  - Display top-10 trending items with name, dining hall, recency score, and 60-min rating count; auto-refresh via WebSocket every 60 s
  - Show "Not enough activity yet" when `insufficient_activity: true`
  - Display event specials with "Special Event" badge in the feed
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 15.2, 15.4_

- [ ] 31. Client — Dietary profile and filtering UI
  - Implement dietary profile editor (restrictions checkboxes, allergen input, active toggle, opt-in incomplete toggle)
  - Show "Allergen info incomplete" label on items with `allergen_data_complete: false`
  - _Requirements: 4.1, 4.2, 4.4, 4.5_


- [ ] 32. Client — Nutritional tracking and meal log UI
  - Implement meal log entry screen (select items + servings); display daily/weekly macro summary with progress bars
  - Show `over_calorie_target` visual indicator when daily calories exceed target
  - Implement nutrition targets editor
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 33. Client — Recommendations screen
  - Implement recommendations screen with natural language input field
  - Display progressive filter relaxation suggestions when no results match all filters
  - _Requirements: 8.1, 8.2, 8.5, 8.6_

- [ ] 34. Client — Social feed and follow UI
  - Implement social feed screen with real-time WebSocket updates (friend ratings and meal logs within 60 s)
  - Implement follow/unfollow by username; privacy settings screen (public/friends/private)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 35. Client — Gamification screen (streaks, badges, leaderboard)
  - Display current streak, badge list, and weekly leaderboard (top 20)
  - Show leaderboard opt-out toggle; opted-out students see their own stats but not their leaderboard rank
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [ ] 36. Client — Meal planning screen
  - Display 7-day advance menu; allow adding items to meal plan for a specific date/period
  - Show planned meals list; implement "Mark as completed" action
  - _Requirements: 13.1, 13.2, 13.5_


- [ ] 37. Client — Hokie Passport connect and balance screen
  - Implement Hokie Passport connect flow and manual refresh button
  - Display balance with `stale` indicator; show low-balance warning banner
  - Allow full app use without connecting Hokie Passport
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 38. Accessibility implementation
  - Add `accessibilityLabel` and `accessibilityHint` to all interactive elements and images (including photo reviews)
  - Verify all touch targets are ≥44×44 points; use `minimumFontScale` and dynamic type support
  - Ensure color contrast ≥4.5:1 for body text and ≥3:1 for large text/UI components across all screens
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 39. Final checkpoint — full integration
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with ≥100 iterations and tag format: `Feature: vt-dining-ranker, Property {N}: {text}`
- Unit tests cover concrete examples, edge cases, and error conditions not already covered by property tests
- Checkpoints at tasks 7, 15, 24, and 39 ensure incremental validation before moving to the next layer
