// VT Dining Ranker — API client functions
import apiClient from './client';
import type {
  DiningHall,
  MenuItem,
  MealPeriod,
  WeatherData,
  HokiePassportBalance,
  DietaryProfile,
  NutritionTargets,
} from '../types';

export interface DiningHallsResponse {
  halls: DiningHall[];
  stale?: boolean;
}

export interface RankedMenuResponse {
  items: MenuItem[];
  stale?: boolean;
}

export async function fetchDiningHalls(): Promise<DiningHallsResponse> {
  const res = await apiClient.get<DiningHallsResponse>('/api/dining-halls');
  return res.data;
}

export async function fetchRankedItems(hallId: string): Promise<RankedMenuResponse> {
  const res = await apiClient.get<RankedMenuResponse>(
    `/api/dining-halls/${hallId}/ranked-items`,
  );
  return res.data;
}

export async function fetchWeather(): Promise<WeatherData> {
  const res = await apiClient.get<WeatherData>('/api/weather');
  return res.data;
}

export async function fetchHokiePassportBalance(): Promise<HokiePassportBalance> {
  const res = await apiClient.get<HokiePassportBalance>('/api/hokie-passport/balance');
  return res.data;
}

export async function fetchDietaryProfile(): Promise<DietaryProfile> {
  const res = await apiClient.get<DietaryProfile>('/api/dietary-profile');
  return res.data;
}

export async function saveDietaryProfile(profile: DietaryProfile): Promise<DietaryProfile> {
  const res = await apiClient.put<DietaryProfile>('/api/dietary-profile', profile);
  return res.data;
}

// ─── Nutritional Tracking ─────────────────────────────────────────────────────

export interface NutritionalSummaryResponse {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  over_calorie_target: boolean;
  targets: NutritionTargets | null;
}

export async function fetchMenuItemSearch(query: string): Promise<MenuItem[]> {
  const res = await apiClient.get<{ items: MenuItem[] }>('/api/menu-items', {
    params: { search: query },
  });
  return res.data.items;
}

export async function fetchNutritionalSummary(
  date: string,
  range: 'daily' | 'weekly',
): Promise<NutritionalSummaryResponse> {
  const res = await apiClient.get<NutritionalSummaryResponse>('/api/meal-logs', {
    params: { date, range },
  });
  return res.data;
}

export async function logMeal(payload: {
  items: { menuItemId: string; servings: number }[];
  mealPeriod: MealPeriod;
}): Promise<void> {
  await apiClient.post('/api/meal-logs', payload);
}

export async function updateNutritionTargets(targets: NutritionTargets): Promise<void> {
  await apiClient.put('/api/nutrition-targets', targets);
}
