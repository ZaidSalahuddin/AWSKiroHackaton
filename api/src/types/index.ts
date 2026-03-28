// ─── Dietary & Nutrition sub-types ───────────────────────────────────────────

export interface DietaryProfile {
  restrictions: string[];
  allergens: string[];
  active: boolean;
  opt_in_incomplete: boolean;
}

export interface NutritionTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
}

export interface NutritionData {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  added_sugar_g: number;
}

// ─── Core domain interfaces ───────────────────────────────────────────────────

export interface Student {
  id: string;
  vt_email: string;
  username: string;
  display_name: string;
  password_hash: string;
  dietary_profile: DietaryProfile;
  nutrition_targets: NutritionTargets | null;
  leaderboard_opt_out: boolean;
  privacy_setting: 'public' | 'friends' | 'private';
  created_at: Date;
}

export interface DiningHall {
  id: string;
  name: string;
  location: string;
  has_sensor_data: boolean;
}

export interface MenuItem {
  id: string;
  dining_hall_id: string;
  name: string;
  description: string;
  station: string;
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'late_night';
  menu_date: string;
  allergens: string[];
  allergen_data_complete: boolean;
  nutrition: NutritionData | null;
  health_score: number | null;
}

export interface Rating {
  id: string;
  student_id: string;
  menu_item_id: string;
  /** Integer 1–5 */
  stars: number;
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'late_night';
  meal_date: string;
  check_in_verified: boolean;
  created_at: Date;
}

export interface MealLogItem {
  menu_item_id: string;
  servings: number;
}

export interface MealLog {
  id: string;
  student_id: string;
  log_date: string;
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'late_night';
  items: MealLogItem[];
  nutrition_totals: NutritionData;
  created_at: Date;
}

export interface WaitTimeReport {
  id: string;
  dining_hall_id: string;
  student_id: string;
  /** Estimated wait in minutes */
  minutes: number;
  source: 'crowdsource' | 'sensor';
  created_at: Date;
}

export interface MealPlanEntry {
  id: string;
  student_id: string;
  menu_item_id: string;
  planned_date: string;
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'late_night';
  completed: boolean;
  created_at: Date;
}

export interface Follow {
  id: string;
  follower_id: string;
  followee_id: string;
  created_at: Date;
}

export interface Badge {
  id: string;
  student_id: string;
  badge_type: 'streak_7' | 'streak_30' | 'streak_100' | 'foodie_explorer';
  awarded_at: Date;
}

export interface ActivityEvent {
  id: string;
  student_id: string;
  event_type: 'rating_submitted' | 'meal_logged';
  payload: Record<string, unknown>;
  created_at: Date;
}
