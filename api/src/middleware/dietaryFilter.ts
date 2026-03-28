import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getDietaryProfile } from '../services/studentService';
import { DietaryProfile, MenuItem } from '../types';

/**
 * Middleware: reads req.studentId, fetches dietary profile from DB,
 * attaches it to req.dietaryProfile.
 */
export async function dietaryFilterMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.studentId) {
    next();
    return;
  }
  try {
    const profile = await getDietaryProfile(req.studentId);
    req.dietaryProfile = profile ?? undefined;
  } catch {
    // Non-fatal: proceed without filtering
  }
  next();
}

/**
 * Pure function: filters out items conflicting with the student's dietary profile.
 *
 * Rules:
 * - If profile is null/undefined or profile.active === false, return items unfiltered.
 * - An item conflicts if any restriction or allergen in the profile appears in item.allergens.
 * - An item with allergen_data_complete: false is excluded unless profile.opt_in_incomplete === true.
 */
export function applyDietaryFilter(
  items: MenuItem[],
  profile: DietaryProfile | null | undefined,
): MenuItem[] {
  if (!profile || !profile.active) return items;

  const blocked = new Set([
    ...profile.restrictions.map((r) => r.toLowerCase()),
    ...profile.allergens.map((a) => a.toLowerCase()),
  ]);

  return items.filter((item) => {
    // Exclude items with incomplete allergen data unless opted in
    if (!item.allergen_data_complete && !profile.opt_in_incomplete) {
      return false;
    }

    // Exclude items that conflict with restrictions or allergens
    const itemAllergens = item.allergens.map((a) => a.toLowerCase());
    return !itemAllergens.some((a) => blocked.has(a));
  });
}

/**
 * Pure function: injects allergen_warning: true when item allergens overlap
 * with the student's profile allergens/restrictions.
 *
 * Returns item unchanged if profile is null/undefined or inactive.
 */
export function injectAllergenWarning(
  item: MenuItem,
  profile: DietaryProfile | null | undefined,
): MenuItem & { allergen_warning?: boolean } {
  if (!profile || !profile.active) return item;

  const blocked = new Set([
    ...profile.restrictions.map((r) => r.toLowerCase()),
    ...profile.allergens.map((a) => a.toLowerCase()),
  ]);

  const itemAllergens = item.allergens.map((a) => a.toLowerCase());
  const hasWarning = itemAllergens.some((a) => blocked.has(a));

  if (hasWarning) {
    return { ...item, allergen_warning: true };
  }
  return item;
}
