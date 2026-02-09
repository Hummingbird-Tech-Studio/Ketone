import { describe, it, expect } from 'bun:test';
import {
  calculatePeriodDates,
  recalculatePeriodDates,
  assessPeriodPhase,
  assessPlanProgress,
} from '../services/period-calculation.service';
import type { PeriodDates } from '../plan.model';

const ONE_HOUR_MS = 3_600_000;

const makeDate = (hoursFromBase: number): Date => {
  const base = new Date('2025-01-01T00:00:00Z');
  return new Date(base.getTime() + hoursFromBase * ONE_HOUR_MS);
};

const makePeriodDates = (fastingStart: number, fastingEnd: number, eatingEnd: number): PeriodDates => ({
  startDate: makeDate(fastingStart),
  endDate: makeDate(eatingEnd),
  fastingStartDate: makeDate(fastingStart),
  fastingEndDate: makeDate(fastingEnd),
  eatingStartDate: makeDate(fastingEnd),
  eatingEndDate: makeDate(eatingEnd),
});

describe('period-calculation.service', () => {
  describe('calculatePeriodDates', () => {
    it('calculates dates for a single period', () => {
      const result = calculatePeriodDates(makeDate(0), [{ fastingDuration: 16, eatingWindow: 8 }]);

      expect(result).toHaveLength(1);
      expect(result[0]!.order).toBe(1);
      expect(result[0]!.fastingDuration).toBe(16);
      expect(result[0]!.eatingWindow).toBe(8);
      expect(result[0]!.startDate).toEqual(makeDate(0));
      expect(result[0]!.fastingStartDate).toEqual(makeDate(0));
      expect(result[0]!.fastingEndDate).toEqual(makeDate(16));
      expect(result[0]!.eatingStartDate).toEqual(makeDate(16));
      expect(result[0]!.eatingEndDate).toEqual(makeDate(24));
      expect(result[0]!.endDate).toEqual(makeDate(24));
    });

    it('calculates consecutive periods correctly', () => {
      const result = calculatePeriodDates(makeDate(0), [
        { fastingDuration: 16, eatingWindow: 8 },
        { fastingDuration: 20, eatingWindow: 4 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]!.order).toBe(1);
      expect(result[1]!.order).toBe(2);

      // Second period starts where first ends
      expect(result[1]!.startDate).toEqual(result[0]!.endDate);
      expect(result[1]!.fastingStartDate).toEqual(makeDate(24));
      expect(result[1]!.fastingEndDate).toEqual(makeDate(44));
      expect(result[1]!.eatingStartDate).toEqual(makeDate(44));
      expect(result[1]!.eatingEndDate).toEqual(makeDate(48));
    });

    it('returns empty array for empty input', () => {
      const result = calculatePeriodDates(makeDate(0), []);
      expect(result).toHaveLength(0);
    });
  });

  describe('recalculatePeriodDates', () => {
    it('produces same output as calculatePeriodDates', () => {
      const periods = [
        { fastingDuration: 16, eatingWindow: 8 },
        { fastingDuration: 20, eatingWindow: 4 },
      ];
      const start = makeDate(10);

      const calculated = calculatePeriodDates(start, periods);
      const recalculated = recalculatePeriodDates(start, periods);

      expect(recalculated).toEqual(calculated);
    });
  });

  describe('assessPeriodPhase', () => {
    const period = makePeriodDates(0, 16, 24);

    it('returns Scheduled when now is before fasting start', () => {
      const result = assessPeriodPhase(period, makeDate(-2));
      expect(result._tag).toBe('Scheduled');
      if (result._tag === 'Scheduled') {
        expect(result.startsInMs).toBe(2 * ONE_HOUR_MS);
      }
    });

    it('returns Fasting when now is during fasting phase', () => {
      const result = assessPeriodPhase(period, makeDate(8));
      expect(result._tag).toBe('Fasting');
      if (result._tag === 'Fasting') {
        expect(result.elapsedMs).toBe(8 * ONE_HOUR_MS);
        expect(result.remainingMs).toBe(8 * ONE_HOUR_MS);
        expect(result.percentage).toBe(50);
      }
    });

    it('returns Eating when now is during eating phase', () => {
      const result = assessPeriodPhase(period, makeDate(20));
      expect(result._tag).toBe('Eating');
      if (result._tag === 'Eating') {
        expect(result.fastingCompletedMs).toBe(16 * ONE_HOUR_MS);
        expect(result.eatingElapsedMs).toBe(4 * ONE_HOUR_MS);
        expect(result.eatingRemainingMs).toBe(4 * ONE_HOUR_MS);
      }
    });

    it('returns Completed when now is after eating end', () => {
      const result = assessPeriodPhase(period, makeDate(30));
      expect(result._tag).toBe('Completed');
      if (result._tag === 'Completed') {
        expect(result.fastingDurationMs).toBe(16 * ONE_HOUR_MS);
        expect(result.eatingDurationMs).toBe(8 * ONE_HOUR_MS);
      }
    });

    it('returns Fasting at exact fasting start (boundary)', () => {
      const result = assessPeriodPhase(period, makeDate(0));
      expect(result._tag).toBe('Fasting');
    });

    it('returns Eating at exact fasting end (boundary)', () => {
      const result = assessPeriodPhase(period, makeDate(16));
      expect(result._tag).toBe('Eating');
    });

    it('returns Completed at exact eating end (boundary)', () => {
      const result = assessPeriodPhase(period, makeDate(24));
      expect(result._tag).toBe('Completed');
    });
  });

  describe('assessPlanProgress', () => {
    it('returns AllPeriodsCompleted for empty periods', () => {
      const result = assessPlanProgress([], makeDate(0));
      expect(result._tag).toBe('AllPeriodsCompleted');
      if (result._tag === 'AllPeriodsCompleted') {
        expect(result.totalPeriods).toBe(0);
        expect(result.totalFastingTimeMs).toBe(0);
      }
    });

    it('returns NotStarted when now is before first period', () => {
      const periods = [makePeriodDates(10, 26, 34)];
      const result = assessPlanProgress(periods, makeDate(5));
      expect(result._tag).toBe('NotStarted');
      if (result._tag === 'NotStarted') {
        expect(result.startsInMs).toBe(5 * ONE_HOUR_MS);
        expect(result.totalPeriods).toBe(1);
      }
    });

    it('returns InProgress when mid-plan', () => {
      const periods = [makePeriodDates(0, 16, 24), makePeriodDates(24, 40, 48)];
      const result = assessPlanProgress(periods, makeDate(30));
      expect(result._tag).toBe('InProgress');
      if (result._tag === 'InProgress') {
        expect(result.currentPeriodIndex).toBe(1);
        expect(result.totalPeriods).toBe(2);
        expect(result.completedPeriods).toBe(1);
        expect(result.currentPeriodPhase._tag).toBe('Fasting');
      }
    });

    it('returns AllPeriodsCompleted when all periods are done', () => {
      const periods = [makePeriodDates(0, 16, 24), makePeriodDates(24, 40, 48)];
      const result = assessPlanProgress(periods, makeDate(100));
      expect(result._tag).toBe('AllPeriodsCompleted');
      if (result._tag === 'AllPeriodsCompleted') {
        expect(result.totalPeriods).toBe(2);
        expect(result.totalFastingTimeMs).toBe(32 * ONE_HOUR_MS);
      }
    });
  });
});
