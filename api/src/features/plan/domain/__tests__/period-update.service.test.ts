import { describe, it, expect } from 'bun:test';
import { decidePeriodUpdate } from '../services/period-update.service';
import { PeriodOrder, MIN_PERIODS, MAX_PERIODS } from '../plan.model';
import type { PlanId, PeriodId } from '../plan.model';

const ONE_HOUR_MS = 3_600_000;

const makeDate = (hoursFromBase: number): Date => {
  const base = new Date('2025-01-01T00:00:00Z');
  return new Date(base.getTime() + hoursFromBase * ONE_HOUR_MS);
};

const planId = '00000000-0000-0000-0000-000000000001' as PlanId;
const periodId1 = '00000000-0000-0000-0000-000000000010' as PeriodId;
const periodId2 = '00000000-0000-0000-0000-000000000020' as PeriodId;

describe('period-update.service', () => {
  describe('decidePeriodUpdate', () => {
    it('returns CanUpdate for modifying existing periods', () => {
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [
          { id: periodId1, order: PeriodOrder(1) },
          { id: periodId2, order: PeriodOrder(2) },
        ],
        inputPeriods: [
          { id: periodId1, fastingDuration: 18, eatingWindow: 6 },
          { id: periodId2, fastingDuration: 20, eatingWindow: 4 },
        ],
      });

      expect(result._tag).toBe('CanUpdate');
      if (result._tag === 'CanUpdate') {
        expect(result.periodsToWrite).toHaveLength(2);
        expect(result.periodsToWrite[0]!.id).toBe(periodId1);
        expect(result.periodsToWrite[1]!.id).toBe(periodId2);
        expect(result.periodsToWrite[0]!.order).toBe(1);
        expect(result.periodsToWrite[1]!.order).toBe(2);
      }
    });

    it('returns CanUpdate for adding new periods', () => {
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [{ id: periodId1, order: PeriodOrder(1) }],
        inputPeriods: [
          { id: periodId1, fastingDuration: 16, eatingWindow: 8 },
          { fastingDuration: 20, eatingWindow: 4 },
        ],
      });

      expect(result._tag).toBe('CanUpdate');
      if (result._tag === 'CanUpdate') {
        expect(result.periodsToWrite).toHaveLength(2);
        expect(result.periodsToWrite[0]!.id).toBe(periodId1);
        expect(result.periodsToWrite[1]!.id).toBeNull();
      }
    });

    it('returns CanUpdate with correct date calculation', () => {
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [],
        inputPeriods: [{ fastingDuration: 16, eatingWindow: 8 }],
      });

      expect(result._tag).toBe('CanUpdate');
      if (result._tag === 'CanUpdate') {
        const period = result.periodsToWrite[0]!;
        expect(period.startDate).toEqual(makeDate(0));
        expect(period.fastingStartDate).toEqual(makeDate(0));
        expect(period.fastingEndDate).toEqual(makeDate(16));
        expect(period.eatingStartDate).toEqual(makeDate(16));
        expect(period.eatingEndDate).toEqual(makeDate(24));
        expect(period.endDate).toEqual(makeDate(24));
      }
    });

    it('returns InvalidPeriodCount when below minimum', () => {
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [{ id: periodId1, order: PeriodOrder(1) }],
        inputPeriods: [],
      });

      expect(result._tag).toBe('InvalidPeriodCount');
      if (result._tag === 'InvalidPeriodCount') {
        expect(result.periodCount).toBe(0);
        expect(result.minPeriods).toBe(MIN_PERIODS);
        expect(result.maxPeriods).toBe(MAX_PERIODS);
      }
    });

    it('returns InvalidPeriodCount when above maximum', () => {
      const inputPeriods = Array.from({ length: MAX_PERIODS + 1 }, () => ({
        fastingDuration: 16,
        eatingWindow: 8,
      }));

      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [],
        inputPeriods,
      });

      expect(result._tag).toBe('InvalidPeriodCount');
    });

    it('returns DuplicatePeriodId for duplicate IDs in input', () => {
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [{ id: periodId1, order: PeriodOrder(1) }],
        inputPeriods: [
          { id: periodId1, fastingDuration: 16, eatingWindow: 8 },
          { id: periodId1, fastingDuration: 20, eatingWindow: 4 },
        ],
      });

      expect(result._tag).toBe('DuplicatePeriodId');
      if (result._tag === 'DuplicatePeriodId') {
        expect(result.periodId).toBe(periodId1);
      }
    });

    it('returns PeriodNotInPlan when ID does not belong to plan', () => {
      const unknownId = '00000000-0000-0000-0000-000000000099';
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [{ id: periodId1, order: PeriodOrder(1) }],
        inputPeriods: [{ id: unknownId, fastingDuration: 16, eatingWindow: 8 }],
      });

      expect(result._tag).toBe('PeriodNotInPlan');
      if (result._tag === 'PeriodNotInPlan') {
        expect(result.periodId).toBe(unknownId);
      }
    });

    it('orders existing periods by original order then appends new', () => {
      const result = decidePeriodUpdate({
        planId,
        planStartDate: makeDate(0),
        existingPeriods: [
          { id: periodId1, order: PeriodOrder(1) },
          { id: periodId2, order: PeriodOrder(2) },
        ],
        inputPeriods: [
          { id: periodId2, fastingDuration: 20, eatingWindow: 4 },
          { id: periodId1, fastingDuration: 16, eatingWindow: 8 },
          { fastingDuration: 12, eatingWindow: 6 },
        ],
      });

      expect(result._tag).toBe('CanUpdate');
      if (result._tag === 'CanUpdate') {
        // periodId1 has order 1, periodId2 has order 2 — so they keep original order
        expect(result.periodsToWrite[0]!.id).toBe(periodId1);
        expect(result.periodsToWrite[1]!.id).toBe(periodId2);
        expect(result.periodsToWrite[2]!.id).toBeNull();
        expect(result.periodsToWrite[0]!.order).toBe(1);
        expect(result.periodsToWrite[1]!.order).toBe(2);
        expect(result.periodsToWrite[2]!.order).toBe(3);
      }
    });
  });
});
