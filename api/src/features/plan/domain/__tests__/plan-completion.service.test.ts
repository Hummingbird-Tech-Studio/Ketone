import { describe, it, expect } from 'bun:test';
import { decidePlanCompletion } from '../services/plan-completion.service';
import type { PlanId, PeriodDates } from '../plan.model';

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
const userId = '00000000-0000-0000-0000-000000000002';

describe('plan-completion.service', () => {
  describe('decidePlanCompletion', () => {
    it('returns CanComplete when all periods have elapsed', () => {
      const periods = [makePeriodDates(0, 16, 24), makePeriodDates(24, 40, 48)];
      const result = decidePlanCompletion({
        planId,
        status: 'InProgress',
        periods,
        now: makeDate(100),
        userId,
      });

      expect(result._tag).toBe('CanComplete');
      if (result._tag === 'CanComplete') {
        expect(result.planId).toBe(planId);
        expect(result.completedAt).toEqual(makeDate(100));
        expect(result.cyclesToCreate).toHaveLength(2);
        expect(result.cyclesToCreate[0]!.startDate).toEqual(makeDate(0));
        expect(result.cyclesToCreate[0]!.endDate).toEqual(makeDate(16));
        expect(result.cyclesToCreate[1]!.startDate).toEqual(makeDate(24));
        expect(result.cyclesToCreate[1]!.endDate).toEqual(makeDate(40));
      }
    });

    it('returns PeriodsNotFinished when some periods are not elapsed', () => {
      const periods = [makePeriodDates(0, 16, 24), makePeriodDates(24, 40, 48)];
      const result = decidePlanCompletion({
        planId,
        status: 'InProgress',
        periods,
        now: makeDate(30), // first complete, second not
        userId,
      });

      expect(result._tag).toBe('PeriodsNotFinished');
      if (result._tag === 'PeriodsNotFinished') {
        expect(result.completedCount).toBe(1);
        expect(result.totalCount).toBe(2);
      }
    });

    it('returns PeriodsNotFinished for empty periods', () => {
      const result = decidePlanCompletion({
        planId,
        status: 'InProgress',
        periods: [],
        now: makeDate(0),
        userId,
      });

      expect(result._tag).toBe('PeriodsNotFinished');
      if (result._tag === 'PeriodsNotFinished') {
        expect(result.completedCount).toBe(0);
        expect(result.totalCount).toBe(0);
      }
    });

    it('returns CanComplete when now equals exact eatingEndDate (boundary)', () => {
      const periods = [makePeriodDates(0, 16, 24)];
      const result = decidePlanCompletion({
        planId,
        status: 'InProgress',
        periods,
        now: makeDate(24), // exactly at eatingEndDate
        userId,
      });

      expect(result._tag).toBe('CanComplete');
    });

    it('returns PeriodsNotFinished 1ms before eatingEndDate (boundary)', () => {
      const eatingEndDate = makeDate(24);
      const justBefore = new Date(eatingEndDate.getTime() - 1);
      const periods = [makePeriodDates(0, 16, 24)];
      const result = decidePlanCompletion({
        planId,
        status: 'InProgress',
        periods,
        now: justBefore,
        userId,
      });

      expect(result._tag).toBe('PeriodsNotFinished');
    });

    it('returns InvalidState for Completed status', () => {
      const result = decidePlanCompletion({
        planId,
        status: 'Completed',
        periods: [],
        now: makeDate(0),
        userId,
      });

      expect(result._tag).toBe('InvalidState');
      if (result._tag === 'InvalidState') {
        expect(result.currentStatus).toBe('Completed');
      }
    });

    it('returns InvalidState for Cancelled status', () => {
      const result = decidePlanCompletion({
        planId,
        status: 'Cancelled',
        periods: [],
        now: makeDate(0),
        userId,
      });

      expect(result._tag).toBe('InvalidState');
      if (result._tag === 'InvalidState') {
        expect(result.currentStatus).toBe('Cancelled');
      }
    });

    it('cycle data uses fasting dates not eating dates', () => {
      const periods = [makePeriodDates(0, 16, 24)];
      const result = decidePlanCompletion({
        planId,
        status: 'InProgress',
        periods,
        now: makeDate(100),
        userId,
      });

      expect(result._tag).toBe('CanComplete');
      if (result._tag === 'CanComplete') {
        // startDate = fastingStartDate, endDate = fastingEndDate
        expect(result.cyclesToCreate[0]!.startDate).toEqual(makeDate(0));
        expect(result.cyclesToCreate[0]!.endDate).toEqual(makeDate(16));
      }
    });
  });
});
