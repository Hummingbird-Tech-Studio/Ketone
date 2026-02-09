import { describe, it, expect } from 'bun:test';
import {
  determinePeriodOutcome,
  processCancellation,
  decideCancellation,
  decidePlanCancellation,
} from '../services/plan-cancellation.service';
import { CancellationResult as CR } from '../plan.model';
import type { PeriodDates, PlanId } from '../plan.model';

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

const planId = '00000000-0000-0000-0000-000000000001' as PlanId;

describe('plan-cancellation.service', () => {
  describe('determinePeriodOutcome', () => {
    const period = makePeriodDates(0, 16, 24);

    it('returns DiscardedPeriod when period has not started', () => {
      const result = determinePeriodOutcome(period, makeDate(-1));
      expect(result._tag).toBe('DiscardedPeriod');
    });

    it('returns PartialFastingPeriod when in fasting phase', () => {
      const result = determinePeriodOutcome(period, makeDate(8));
      expect(result._tag).toBe('PartialFastingPeriod');
      if (result._tag === 'PartialFastingPeriod') {
        expect(result.fastingStartDate).toEqual(makeDate(0));
        expect(result.fastingEndDate).toEqual(makeDate(8));
        expect(result.originalFastingEndDate).toEqual(makeDate(16));
      }
    });

    it('returns CompletedFastingInEatingPhase when in eating phase', () => {
      const result = determinePeriodOutcome(period, makeDate(20));
      expect(result._tag).toBe('CompletedFastingInEatingPhase');
      if (result._tag === 'CompletedFastingInEatingPhase') {
        expect(result.fastingStartDate).toEqual(makeDate(0));
        expect(result.fastingEndDate).toEqual(makeDate(16));
      }
    });

    it('returns CompletedPeriod when period is fully completed', () => {
      const result = determinePeriodOutcome(period, makeDate(30));
      expect(result._tag).toBe('CompletedPeriod');
      if (result._tag === 'CompletedPeriod') {
        expect(result.fastingStartDate).toEqual(makeDate(0));
        expect(result.fastingEndDate).toEqual(makeDate(16));
      }
    });

    it('returns PartialFastingPeriod at exact fastingStart (boundary)', () => {
      const result = determinePeriodOutcome(period, makeDate(0));
      expect(result._tag).toBe('PartialFastingPeriod');
      if (result._tag === 'PartialFastingPeriod') {
        expect(result.fastingEndDate).toEqual(makeDate(0));
      }
    });

    it('returns CompletedFastingInEatingPhase at exact fastingEnd (boundary)', () => {
      const result = determinePeriodOutcome(period, makeDate(16));
      expect(result._tag).toBe('CompletedFastingInEatingPhase');
    });

    it('returns CompletedPeriod at exact eatingEnd (boundary)', () => {
      const result = determinePeriodOutcome(period, makeDate(24));
      expect(result._tag).toBe('CompletedPeriod');
    });
  });

  describe('processCancellation', () => {
    it('processes multiple periods with mixed outcomes', () => {
      const periods = [
        makePeriodDates(0, 16, 24), // completed
        makePeriodDates(24, 40, 48), // in fasting
        makePeriodDates(48, 64, 72), // not started
      ];
      const results = processCancellation(periods, makeDate(30));

      expect(results).toHaveLength(3);
      expect(results[0]!._tag).toBe('CompletedPeriod');
      expect(results[1]!._tag).toBe('PartialFastingPeriod');
      expect(results[2]!._tag).toBe('DiscardedPeriod');
    });
  });

  describe('decideCancellation', () => {
    it('groups completed and in-progress periods', () => {
      const results = [
        CR.CompletedPeriod({ fastingStartDate: makeDate(0), fastingEndDate: makeDate(16) }),
        CR.CompletedFastingInEatingPhase({ fastingStartDate: makeDate(24), fastingEndDate: makeDate(40) }),
        CR.DiscardedPeriod(),
      ];

      const decision = decideCancellation(results);

      expect(decision.completedPeriodsFastingDates).toHaveLength(1);
      expect(decision.completedPeriodsFastingDates[0]!.fastingStartDate).toEqual(makeDate(0));
      expect(decision.inProgressPeriodFastingDates).not.toBeNull();
      expect(decision.inProgressPeriodFastingDates!.fastingStartDate).toEqual(makeDate(24));
    });

    it('returns null inProgress when no in-progress periods', () => {
      const results = [
        CR.CompletedPeriod({ fastingStartDate: makeDate(0), fastingEndDate: makeDate(16) }),
        CR.DiscardedPeriod(),
      ];

      const decision = decideCancellation(results);

      expect(decision.completedPeriodsFastingDates).toHaveLength(1);
      expect(decision.inProgressPeriodFastingDates).toBeNull();
    });

    it('handles PartialFastingPeriod as in-progress', () => {
      const results = [
        CR.PartialFastingPeriod({
          fastingStartDate: makeDate(0),
          fastingEndDate: makeDate(8),
          originalFastingEndDate: makeDate(16),
        }),
      ];

      const decision = decideCancellation(results);

      expect(decision.completedPeriodsFastingDates).toHaveLength(0);
      expect(decision.inProgressPeriodFastingDates).not.toBeNull();
      expect(decision.inProgressPeriodFastingDates!.fastingEndDate).toEqual(makeDate(8));
    });
  });

  describe('decidePlanCancellation', () => {
    it('returns Cancel for InProgress plan', () => {
      const periods = [makePeriodDates(0, 16, 24)];
      const result = decidePlanCancellation({
        planId,
        status: 'InProgress',
        periods,
        now: makeDate(30),
      });
      expect(result._tag).toBe('Cancel');
      if (result._tag === 'Cancel') {
        expect(result.planId).toBe(planId);
        expect(result.cancelledAt).toEqual(makeDate(30));
      }
    });

    it('returns InvalidState for Completed plan', () => {
      const result = decidePlanCancellation({
        planId,
        status: 'Completed',
        periods: [],
        now: makeDate(0),
      });
      expect(result._tag).toBe('InvalidState');
      if (result._tag === 'InvalidState') {
        expect(result.currentStatus).toBe('Completed');
      }
    });

    it('returns InvalidState for Cancelled plan', () => {
      const result = decidePlanCancellation({
        planId,
        status: 'Cancelled',
        periods: [],
        now: makeDate(0),
      });
      expect(result._tag).toBe('InvalidState');
    });
  });
});
