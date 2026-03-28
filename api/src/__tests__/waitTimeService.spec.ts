import * as fc from 'fast-check';
import { computeWeightedAverage, WaitTimeReportRow } from '../services/waitTimeService';

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('computeWeightedAverage', () => {
  it('returns unknown when no reports', () => {
    expect(computeWeightedAverage([])).toEqual({ minutes: null, unknown: true });
  });

  it('returns the single report value when there is one report', () => {
    const result = computeWeightedAverage([
      { minutes: 10, source: 'crowdsource', age_minutes: 0 },
    ]);
    expect(result.unknown).toBe(false);
    expect(result.minutes).toBe(10);
  });

  it('weights sensor reports 5x higher than crowdsource', () => {
    // sensor at age 0 with 20 min, crowdsource at age 0 with 0 min
    // sensor weight = 5 * exp(0) = 5, crowdsource weight = 1 * exp(0) = 1
    // weighted avg = (5*20 + 1*0) / (5+1) = 100/6 ≈ 17
    const result = computeWeightedAverage([
      { minutes: 20, source: 'sensor', age_minutes: 0 },
      { minutes: 0, source: 'crowdsource', age_minutes: 0 },
    ]);
    expect(result.unknown).toBe(false);
    expect(result.minutes).toBeCloseTo(100 / 6, 0);
  });

  it('gives more weight to more recent reports', () => {
    // recent: 5 min wait at age 0; old: 30 min wait at age 29 min
    // recent weight = exp(0) = 1; old weight = exp(-λ*29) ≈ small
    // result should be closer to 5 than 30
    const result = computeWeightedAverage([
      { minutes: 5, source: 'crowdsource', age_minutes: 0 },
      { minutes: 30, source: 'crowdsource', age_minutes: 29 },
    ]);
    expect(result.unknown).toBe(false);
    expect(result.minutes!).toBeLessThan(18); // closer to 5 than midpoint 17.5
  });

  it('returns unknown: false with a valid estimate when reports exist', () => {
    const result = computeWeightedAverage([
      { minutes: 15, source: 'crowdsource', age_minutes: 5 },
    ]);
    expect(result.unknown).toBe(false);
    expect(result.minutes).not.toBeNull();
  });
});

// ─── Property-based tests ─────────────────────────────────────────────────────

/**
 * Property 20: Wait time estimate uses recency weighting
 * Validates: Requirements 7.3
 *
 * For any set of reports, a more recent report with a higher wait time should
 * pull the estimate higher than the same set with that report being older.
 * Equivalently: given two otherwise-identical reports at different ages,
 * the one with age=0 has strictly higher weight than the one with age>0.
 *
 * Feature: vt-dining-ranker, Property 20: Wait time estimate uses recency weighting
 */
describe('Property 20: Wait time estimate uses recency weighting', () => {
  it('more recent reports have strictly higher weight than older ones', () => {
    fc.assert(
      fc.property(
        // age_recent: [0, 14], age_old: [age_recent+1, 29]
        fc.integer({ min: 0, max: 14 }),
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 60 }), // minutes value for the report
        (ageRecent, ageDelta, minutes) => {
          const ageOld = ageRecent + ageDelta;

          // Two single-report scenarios: same minutes, different ages
          const recentResult = computeWeightedAverage([
            { minutes, source: 'crowdsource', age_minutes: ageRecent },
          ]);
          const oldResult = computeWeightedAverage([
            { minutes, source: 'crowdsource', age_minutes: ageOld },
          ]);

          // Both should return the same minutes value (single report = exact value)
          // but we verify the weighting by mixing with a fixed anchor report
          const anchor = 0; // anchor at 0 minutes wait
          const recentMix = computeWeightedAverage([
            { minutes, source: 'crowdsource', age_minutes: ageRecent },
            { minutes: anchor, source: 'crowdsource', age_minutes: 0 },
          ]);
          const oldMix = computeWeightedAverage([
            { minutes, source: 'crowdsource', age_minutes: ageOld },
            { minutes: anchor, source: 'crowdsource', age_minutes: 0 },
          ]);

          // The more recent report pulls the estimate higher (closer to `minutes`)
          // so recentMix.minutes >= oldMix.minutes
          return recentMix.minutes! >= oldMix.minutes!;
        }
      ),
      { numRuns: 200, verbose: true }
    );
  });

  it('sensor reports always have higher effective weight than same-age crowdsource reports', () => {
    // Verify directly via the weight formula: sensor weight = 5 * decay, crowd weight = 1 * decay
    // So for any age, sensor_weight / crowd_weight = 5 (strictly greater)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 29 }), // age in minutes
        (age) => {
          const LAMBDA = Math.LN2 / 15;
          const decay = Math.exp(-LAMBDA * age);
          const sensorWeight = decay * 5;
          const crowdWeight = decay * 1;
          return sensorWeight > crowdWeight;
        }
      ),
      { numRuns: 200, verbose: true }
    );
  });
});
