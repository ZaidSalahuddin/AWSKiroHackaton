# Requirements Document

## Introduction

VT Dining Ranker is a real-time campus dining application for Virginia Tech students. It surfaces the best-rated food available on campus right now, helps students decide what to eat through personalized recommendations, and enriches the dining experience with social features, nutritional awareness, gamification, and meal planning. The app aggregates crowdsourced ratings, menu data, wait times, and contextual signals (weather, dietary preferences, meal plan balance) to give students a smarter, more enjoyable dining experience.

## Glossary

- **App**: The VT Dining Ranker mobile/web application
- **Student**: A Virginia Tech student who is a registered user of the App
- **Dining_Hall**: A Virginia Tech on-campus dining facility (e.g., West End, D2, Turner Place, Perry Place, Owens, Squires)
- **Menu_Item**: A specific food or beverage offered at a Dining_Hall during a meal period
- **Rating**: A numerical score (1–5 stars) submitted by a Student for a Menu_Item they consumed
- **Recency_Score**: A time-decayed composite score calculated from Ratings, where more recent Ratings carry higher weight
- **Trending_Feed**: A real-time feed showing available Menu_Items with the highest Recency_Score activity in the past 60 minutes
- **Dietary_Profile**: A Student's saved set of dietary restrictions and preferences (e.g., vegan, gluten-free, halal, kosher, allergens)
- **Health_Score**: A computed nutritional quality score for a Menu_Item based on its macro and micronutrient data
- **Wait_Time**: An estimated number of minutes before a Student can be served at a Dining_Hall, derived from crowdsourced reports or sensor data
- **Streak**: A consecutive-day count of a Student logging at least one meal in the App
- **Recommendation_Engine**: The App subsystem that generates personalized meal suggestions
- **Meal_Plan_Service**: The Virginia Tech Hokie Dining for meal plan data
-- **Meals_Database**: Stores list of all meals, both available and unavailable
- **Weather_Service**: An external weather data provider supplying current conditions for Blacksburg, VA
- **Photo_Review**: An image attached by a Student to a Rating submission
- **Availability_History**: A timestamped log of every date, meal period, and Dining_Hall at which a Menu_Item appeared on the menu
- **Availability_Prediction**: A forecast of the next likely date(s) and meal period(s) a Menu_Item will appear, derived from its Availability_History using recurrence pattern analysis
- **Previous_Availability_Trend**: A visual summary of a Menu_Item's historical appearance frequency, shown on the item's detail page

---

## Requirements

### Requirement 1: Real-Time Menu Display

**User Story:** As a Student, I want to see what Menu_Items are currently available at each Dining_Hall, so that I can make an informed decision about where to eat all in one centralized app.

#### Acceptance Criteria

1. THE App SHALL display the current meal period's Menu_Items for each Dining_Hall, organized by dining station or category.
2. WHEN a Student selects a Menu_Item, THE App SHALL display the item's name, description, ingredients, allergen tags, Previous_Availability_Trend and Health_Score.
3. WHEN a Dining_Hall's menu changes between meal periods, THE App SHALL update the displayed menu within 5 minutes of the change.
4. IF menu data for a Dining_Hall is unavailable, THEN THE App SHALL display a "Menu unavailable" message for that Dining_Hall and continue displaying data for other Dining_Halls.
5. THE App SHALL indicate the meal period (breakfast, lunch, dinner, late night) currently active at each Dining_Hall.

---

### Requirement 2: Real-Time Ratings and Recency-Weighted Ranking

**User Story:** As a Student, I want to see which Menu_Items are rated highest right now, so that I can quickly find the best food on campus at this moment.

#### Acceptance Criteria

1. WHEN a Student submits a Rating for a Menu_Item, THE App SHALL record the Rating with a timestamp and update the item's Recency_Score within 10 seconds.
2. THE App SHALL compute each Menu_Item's Recency_Score using a time-decay function where Ratings submitted within the past 60 minutes carry at least twice the weight of Ratings submitted more than 6 hours ago.
3. THE App SHALL display a ranked list of currently available Menu_Items sorted by Recency_Score, updated at most every 30 seconds.
4. WHEN a Student submits a Rating, THE App SHALL require the Student to have checked in at the corresponding Dining_Hall within the past 90 minutes, or to confirm they consumed the item.
5. IF a Menu_Item is no longer available in the current meal period, THEN THE App SHALL exclude it from the ranked list.
6. THE App SHALL allow a Student to submit at most one Rating per Menu_Item per meal period.

---

### Requirement 3: Trending Feed

**User Story:** As a Student, I want to see what food is trending on campus right now, so that I can discover popular items I might not have considered.

#### Acceptance Criteria

1. THE App SHALL display a Trending_Feed showing the top 10 Menu_Items by Recency_Score activity in the past 60 minutes.
2. THE Trending_Feed SHALL refresh automatically every 60 seconds.
3. WHEN a Menu_Item appears in the Trending_Feed, THE App SHALL display the item's name, Dining_Hall, current Recency_Score, and number of Ratings in the past 60 minutes.
4. IF fewer than 3 Menu_Items have received Ratings in the past 60 minutes, THEN THE App SHALL display a "Not enough activity yet" message in the Trending_Feed.

---

### Requirement 4: Dietary Profiles and Filtering

**User Story:** As a Student with dietary restrictions, I want to filter Menu_Items by my dietary needs, so that I only see food that is safe and appropriate for me to eat.

#### Acceptance Criteria

1. THE App SHALL allow a Student to create and save a Dietary_Profile specifying one or more of: vegan, vegetarian, gluten-free, halal, kosher, and up to 10 named allergens.
2. WHEN a Student has an active Dietary_Profile, THE App SHALL exclude Menu_Items that conflict with the Student's restrictions from all ranked lists, recommendations, and search results.
3. WHEN a Student views a Menu_Item that contains an allergen listed in their Dietary_Profile, THE App SHALL display a prominent allergen warning before the Student can add the item to a meal log or rating.
4. THE App SHALL allow a Student to temporarily disable Dietary_Profile filtering without deleting the profile.
5. IF allergen data for a Menu_Item is incomplete, THEN THE App SHALL label the item as "Allergen info incomplete" and include it in filtered results only if the Student explicitly opts in.

---

### Requirement 5: Health Score and Nutritional Information

**User Story:** As a Student, I want to see the nutritional quality of Menu_Items, so that I can make healthier food choices.

#### Acceptance Criteria

1. THE App SHALL display a Health_Score between 1 and 10 for each Menu_Item that has complete nutritional data, computed from calories, macronutrient balance, sodium, fiber, and added sugar content.
2. WHEN a Student views a Menu_Item, THE App SHALL display the item's calories, protein (g), carbohydrates (g), fat (g), fiber (g), and sodium (mg) per serving.
3. THE App SHALL define the Health_Score formula in a documented, deterministic algorithm so that the same nutritional inputs always produce the same score.
4. IF nutritional data for a Menu_Item is unavailable, THEN THE App SHALL display "Nutrition info unavailable" instead of a Health_Score.

---

### Requirement 6: Nutritional Tracking

**User Story:** As a Student, I want to track my nutritional intake across meals, so that I can monitor my diet over time.

#### Acceptance Criteria

1. WHEN a Student logs a meal containing one or more Menu_Items, THE App SHALL add the combined calories, protein, carbohydrates, fat, fiber, and sodium to the Student's daily nutritional totals.
2. THE App SHALL display a Student's daily and weekly nutritional summary, including totals and a breakdown by macronutrient.
3. THE App SHALL allow a Student to set daily calorie and macronutrient targets and display progress toward those targets.
4. WHEN a Student's logged calorie intake for the day exceeds their set daily calorie target, THE App SHALL display a visual indicator on the nutritional summary.
5. THE App SHALL retain a Student's nutritional log for at least 90 days.

---

### Requirement 7: Dining Hall Wait Times

**User Story:** As a Student, I want to know how busy each Dining_Hall is right now, so that I can avoid long waits.

#### Acceptance Criteria

1. THE App SHALL display a Wait_Time estimate for each currently open Dining_Hall.
2. WHEN a Student submits a crowdsourced wait time report for a Dining_Hall, THE App SHALL incorporate the report into the Wait_Time estimate within 60 seconds.
3. THE App SHALL compute the displayed Wait_Time as a weighted average of crowdsourced reports submitted within the past 30 minutes, with more recent reports weighted more heavily.
4. IF no crowdsourced reports have been submitted for a Dining_Hall in the past 30 minutes and no sensor data is available, THEN THE App SHALL display "Wait time unknown" for that Dining_Hall.
5. WHERE sensor-based occupancy data is available for a Dining_Hall, THE App SHALL incorporate sensor data into the Wait_Time estimate alongside crowdsourced reports.

---

### Requirement 8: Personalized Recommendations

**User Story:** As a Student who is unsure what to eat, I want the App to recommend a meal, so that I can make a quick decision without having to browse everything.

#### Acceptance Criteria

1. WHEN a Student requests a recommendation, THE Recommendation_Engine SHALL return at least one Menu_Item currently available at an open Dining_Hall that satisfies the Student's active Dietary_Profile.
2. THE Recommendation_Engine SHALL factor in the Student's past Rating history, the current Recency_Score of available items, the Student's stated flavor or cuisine preferences, and current weather conditions when generating recommendations.
3. WHEN current weather conditions in Blacksburg, VA include precipitation or a temperature below 35°F, THE Recommendation_Engine SHALL increase the ranking weight of warm or comfort food Menu_Items by at least 20% relative to baseline.
4. WHEN current weather conditions include a temperature above 85°F, THE Recommendation_Engine SHALL increase the ranking weight of cold or light Menu_Items by at least 20% relative to baseline.
5. WHEN a Student explicitly provides input about what they feel like eating (e.g., "something spicy", "light meal"), THE Recommendation_Engine SHALL filter and rank recommendations to match that input.
6. IF no Menu_Items satisfy all active filters for a recommendation, THEN THE Recommendation_Engine SHALL notify the Student and offer to relax one filter at a time until at least one result is found.

---

### Requirement 9: Weather Integration

**User Story:** As a Student, I want the App to be aware of current weather, so that recommendations feel relevant to the conditions outside.

#### Acceptance Criteria

1. THE App SHALL retrieve current weather conditions for Blacksburg, VA from the Weather_Service at least every 15 minutes.
2. WHEN weather data is successfully retrieved, THE App SHALL display the current temperature and conditions (e.g., sunny, rainy, snowing) on the home screen.
3. IF the Weather_Service is unavailable, THEN THE App SHALL use the most recently cached weather data and display a "Weather data may be outdated" indicator.
4. THE App SHALL pass current weather conditions to the Recommendation_Engine for use in generating recommendations.

---

### Requirement 10: Social Layer — Friends and Activity Feed

**User Story:** As a Student, I want to follow friends and see what they are eating and rating, so that I can discover food through people I trust.

#### Acceptance Criteria

1. THE App SHALL allow a Student to follow other Students by username or by connecting a Virginia Tech email contact list.
2. WHEN a Student the current Student follows submits a Rating or logs a meal, THE App SHALL display that activity in the current Student's social feed within 60 seconds.
3. THE App SHALL allow a Student to control the visibility of their own meal logs and Ratings as either public, friends-only, or private.
4. WHEN a Student's privacy setting is private, THE App SHALL exclude that Student's activity from all other Students' social feeds and from the Trending_Feed.
5. THE App SHALL allow a Student to unlike or remove a follow relationship at any time.

---

### Requirement 11: Photo Reviews

**User Story:** As a Student, I want to attach a photo to my Rating, so that others can see what the food actually looks like.

#### Acceptance Criteria

1. WHEN a Student submits a Rating, THE App SHALL allow the Student to optionally attach one Photo_Review image.
2. THE App SHALL accept Photo_Review images in JPEG or PNG format with a maximum file size of 10 MB.
3. WHEN a Photo_Review is submitted, THE App SHALL display it alongside the Rating on the Menu_Item's detail page within 30 seconds of submission.
4. THE App SHALL allow any Student to report a Photo_Review as inappropriate, triggering a moderation review.
5. WHEN a Photo_Review is reported, THE App SHALL hide the image from public display within 5 minutes of the report and queue it for human moderation review.

---

### Requirement 12: Gamification — Streaks, Badges, and Leaderboards

**User Story:** As a Student, I want to earn rewards for logging meals and trying new things, so that using the App feels engaging and fun.

#### Acceptance Criteria

1. THE App SHALL increment a Student's Streak by 1 for each calendar day the Student logs at least one meal.
2. WHEN a Student's Streak reaches 7, 30, or 100 days, THE App SHALL award the Student a corresponding badge and display a congratulatory notification.
3. THE App SHALL award a "Foodie Explorer" badge WHEN a Student rates 10 distinct Menu_Items they have not previously rated within a 7-day period.
4. THE App SHALL display a weekly leaderboard of the top 20 Students by number of Ratings submitted, visible to all Students.
5. WHEN a Student's Streak is broken by missing a day, THE App SHALL reset the Streak to 0 and notify the Student.
6. THE App SHALL allow a Student to opt out of appearing on public leaderboards without losing Streak or badge progress.

---

### Requirement 13: Meal Planning

**User Story:** As a Student, I want to plan my meals for the upcoming week based on posted menus, so that I can eat intentionally and not miss items I enjoy.

#### Acceptance Criteria

1. THE App SHALL display Dining_Hall menus for up to 7 days in advance, where menu data is available from Virginia Tech Dining Services.
2. THE App SHALL allow a Student to add a Menu_Item from a future menu to a personal meal plan for a specific date and meal period.
3. WHEN a Menu_Item a Student has added to their meal plan becomes available at its scheduled Dining_Hall, THE Notification_Service SHALL send the Student a push notification at least 30 minutes before the meal period begins.
4. WHEN a Menu_Item a Student has added to their meal plan is removed from the upcoming menu, THE Notification_Service SHALL notify the Student within 10 minutes of the menu change.
5. THE App SHALL allow a Student to mark a planned meal as completed, which automatically logs the meal's nutritional data to the Student's nutritional tracking record.

---

### Requirement 14: Meal Plan (Swipe) Awareness

**User Story:** As a Student on a meal plan, I want to see my remaining swipe credits in the App, so that I can manage my dining budget.

#### Acceptance Criteria

1. WHERE a Student has connected their Hokie Passport account, THE App SHALL display the Student's remaining meal swipes and dining dollar balance on the home screen.
2. WHEN a Student's remaining meal swipes fall below 5, THE App SHALL display a low-balance warning on the home screen.
3. THE App SHALL refresh Meal_Plan balance data from the Meal_Plan_Service at least once every 24 hours and whenever the Student manually requests a refresh.
4. IF the Meal_Plan_Service is unavailable, THEN THE App SHALL display the most recently cached balance with a "Balance may be outdated" indicator.
5. THE App SHALL allow a Student to use the App fully without connecting a Hokie Passport account.

---

### Requirement 15: Event-Based Specials and Dining Hall Announcements

**User Story:** As a Student, I want to be notified about special menu items during campus events, so that I don't miss unique dining experiences.

#### Acceptance Criteria

1. THE App SHALL allow authorized Virginia Tech Dining Services staff to publish event-based special announcements tied to a specific Dining_Hall, date, and meal period.
2. WHEN a Dining_Hall publishes a special announcement, THE App SHALL display it prominently on that Dining_Hall's page and in the Trending_Feed.
3. WHEN a Student has favorited a Dining_Hall, THE Notification_Service SHALL send the Student a push notification when that Dining_Hall publishes a new special announcement.
4. THE App SHALL display event-based specials with a distinct visual indicator (e.g., a "Special Event" badge) to differentiate them from regular Menu_Items.

---

### Requirement 17: Menu Item Availability History and Prediction

**User Story:** As a Student, I want to see when a Menu_Item has appeared in the past and when it might be available again, so that I can plan around items I enjoy.

#### Acceptance Criteria

1. THE App SHALL log every occurrence of a Menu_Item appearing on a Dining_Hall's menu, recording the Menu_Item identifier, Dining_Hall, date, and meal period, forming the item's Availability_History.
2. THE App SHALL retain Availability_History records for at least 365 days.
3. WHEN a Student views a Menu_Item's detail page, THE App SHALL display the Previous_Availability_Trend showing the item's historical appearance frequency by day of week and meal period.
4. THE App SHALL compute an Availability_Prediction for each Menu_Item that has at least 4 historical appearances, using recurrence pattern analysis (e.g., "typically appears on Tuesdays and Thursdays at lunch").
5. WHEN an Availability_Prediction is available for a Menu_Item, THE App SHALL display the predicted next appearance date(s) and meal period(s) on the item's detail page.
6. IF a Menu_Item has fewer than 4 historical appearances, THEN THE App SHALL display "Not enough history to predict" instead of an Availability_Prediction.
7. THE App SHALL allow a Student to subscribe to a Menu_Item so that the Notification_Service sends a push notification when the item's Availability_Prediction indicates it is likely to appear within the next 24 hours.
8. WHEN a subscribed Menu_Item appears on a confirmed upcoming menu, THE Notification_Service SHALL send the Student a push notification regardless of whether an Availability_Prediction was made.
9. THE App SHALL update Availability_Predictions at least once every 24 hours as new menu data is ingested.

---

### Requirement 16: Accessibility

**User Story:** As a Student with a disability, I want the App to be accessible, so that I can use all features without barriers.

#### Acceptance Criteria

1. THE App SHALL provide text alternatives for all non-text content, including Menu_Item images and Photo_Reviews.
2. THE App SHALL support dynamic text sizing so that all content remains readable when the system font size is increased by up to 200%.
3. THE App SHALL ensure all interactive elements have a minimum touch target size of 44×44 points.
4. THE App SHALL maintain a color contrast ratio of at least 4.5:1 for all body text and at least 3:1 for large text and UI components.
5. THE App SHALL be fully navigable using screen reader assistive technology on both iOS and Android platforms.
