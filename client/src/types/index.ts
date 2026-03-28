// Client-side TypeScript types for VT Dining Ranker

export interface DiningHall {
  id: string;
  name: string;
  location: string;
  isOpen: boolean;
  currentMealPeriod: MealPeriod | null;
  waitTime: WaitTimeResult | null;
}

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'late_night';

export interface MenuItem {
  id: string;
  diningHallId: string;
  name: string;
  description: string;
  station: string;
  mealPeriod: MealPeriod;
  menuDate: string;
  allergens: string[];
  allergenDataComplete: boolean;
  nutrition: NutritionInfo | null;
  healthScore: number | null;
  recencyScore: number;
  available: boolean;
  allergenWarning?: boolean;
  isEventSpecial?: boolean;
}

export interface NutritionInfo {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  added_sugar_g: number;
}

export interface Rating {
  id: string;
  studentId: string;
  menuItemId: string;
  stars: number;
  mealPeriod: MealPeriod;
  mealDate: string;
  checkInVerified: boolean;
  createdAt: string;
}

export interface TrendingItem {
  id: string;
  name: string;
  diningHall: string;
  recencyScore: number;
  ratingCount60min: number;
  isEventSpecial?: boolean;
}

export interface TrendingFeedResponse {
  items: TrendingItem[];
  insufficientActivity: boolean;
}

export interface Recommendation {
  menuItem: MenuItem;
  score: number;
  reasons: string[];
}

export interface Student {
  id: string;
  vtEmail: string;
  username: string;
  displayName: string;
  dietaryProfile: DietaryProfile | null;
  nutritionTargets: NutritionTargets | null;
  leaderboardOptOut: boolean;
  privacySetting: PrivacySetting;
  hokiePassportConnected: boolean;
}

export interface DietaryProfile {
  restrictions: string[];
  allergens: string[];
  active: boolean;
  optInIncomplete: boolean;
}

export type PrivacySetting = 'public' | 'friends' | 'private';

export interface NutritionTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealLog {
  id: string;
  studentId: string;
  logDate: string;
  mealPeriod: MealPeriod;
  items: { menuItemId: string; servings: number }[];
  nutritionTotals: NutritionInfo;
}

export interface WaitTimeResult {
  minutes: number | null;
  unknown: boolean;
}

export interface HokiePassportBalance {
  mealSwipesRemaining: number;
  diningDollarsBalance: number;
  lowBalanceWarning: boolean;
  stale: boolean;
}

export interface WeatherData {
  temperature_f: number;
  conditions: string;
  stale?: boolean;
}

export interface SocialActivity {
  id: string;
  studentId: string;
  displayName: string;
  type: 'rating' | 'meal_log';
  menuItemName?: string;
  diningHallName?: string;
  stars?: number;
  createdAt: string;
}

export interface GamificationData {
  streak: number;
  badges: Badge[];
  leaderboardRank: number | null;
}

export interface Badge {
  id: string;
  badgeType: string;
  awardedAt: string;
}

export interface LeaderboardEntry {
  studentId: string;
  displayName: string;
  ratingsCount: number;
  rank: number;
}

export interface MealPlanEntry {
  id: string;
  studentId: string;
  menuItemId: string;
  menuItemName: string;
  plannedDate: string;
  mealPeriod: MealPeriod;
  completed: boolean;
}

export interface AvailabilityHistory {
  appearances: { appearedOn: string; mealPeriod: MealPeriod; diningHallId: string }[];
}

export interface AvailabilityPrediction {
  predictionAvailable: boolean;
  nextAppearances?: { dayOfWeek: string; mealPeriod: MealPeriod; diningHallId: string }[];
  message?: string;
}

export interface EventSpecial {
  id: string;
  diningHallId: string;
  title: string;
  description: string;
  eventDate: string;
  mealPeriod: MealPeriod;
}

// WebSocket message types
export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string };

export type WsServerMessage = {
  type: 'update' | 'replay';
  channel: string;
  data: unknown;
};

// Auth
export interface AuthTokens {
  accessToken: string;
}
