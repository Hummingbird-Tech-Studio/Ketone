import { describe, it, expect } from 'bun:test';
import { isPlanInProgress, decidePlanCreation } from '../services/plan-validation.service';
import { MIN_PERIODS, MAX_PERIODS } from '../plan.model';

const userId = '00000000-0000-0000-0000-000000000001';

describe('plan-validation.service', () => {
  describe('isPlanInProgress', () => {
    it('returns true for InProgress', () => {
      expect(isPlanInProgress('InProgress')).toBe(true);
    });

    it('returns false for Completed', () => {
      expect(isPlanInProgress('Completed')).toBe(false);
    });

    it('returns false for Cancelled', () => {
      expect(isPlanInProgress('Cancelled')).toBe(false);
    });
  });

  describe('decidePlanCreation', () => {
    it('returns CanCreate when all conditions are met', () => {
      const result = decidePlanCreation({
        userId,
        activePlanId: null,
        activeCycleId: null,
        periodCount: 3,
      });
      expect(result._tag).toBe('CanCreate');
    });

    it('returns InvalidPeriodCount when period count is below minimum', () => {
      const result = decidePlanCreation({
        userId,
        activePlanId: null,
        activeCycleId: null,
        periodCount: MIN_PERIODS - 1,
      });
      expect(result._tag).toBe('InvalidPeriodCount');
      if (result._tag === 'InvalidPeriodCount') {
        expect(result.periodCount).toBe(MIN_PERIODS - 1);
        expect(result.minPeriods).toBe(MIN_PERIODS);
        expect(result.maxPeriods).toBe(MAX_PERIODS);
      }
    });

    it('returns InvalidPeriodCount when period count is above maximum', () => {
      const result = decidePlanCreation({
        userId,
        activePlanId: null,
        activeCycleId: null,
        periodCount: MAX_PERIODS + 1,
      });
      expect(result._tag).toBe('InvalidPeriodCount');
    });

    it('returns BlockedByActivePlan when user has active plan', () => {
      const planId = '00000000-0000-0000-0000-000000000010';
      const result = decidePlanCreation({
        userId,
        activePlanId: planId,
        activeCycleId: null,
        periodCount: 3,
      });
      expect(result._tag).toBe('BlockedByActivePlan');
      if (result._tag === 'BlockedByActivePlan') {
        expect(result.planId).toBe(planId);
      }
    });

    it('returns BlockedByActiveCycle when user has active cycle', () => {
      const cycleId = '00000000-0000-0000-0000-000000000020';
      const result = decidePlanCreation({
        userId,
        activePlanId: null,
        activeCycleId: cycleId,
        periodCount: 3,
      });
      expect(result._tag).toBe('BlockedByActiveCycle');
      if (result._tag === 'BlockedByActiveCycle') {
        expect(result.cycleId).toBe(cycleId);
      }
    });

    it('checks period count before active plan', () => {
      const result = decidePlanCreation({
        userId,
        activePlanId: '00000000-0000-0000-0000-000000000010',
        activeCycleId: null,
        periodCount: 0,
      });
      expect(result._tag).toBe('InvalidPeriodCount');
    });

    it('checks active plan before active cycle', () => {
      const result = decidePlanCreation({
        userId,
        activePlanId: '00000000-0000-0000-0000-000000000010',
        activeCycleId: '00000000-0000-0000-0000-000000000020',
        periodCount: 3,
      });
      expect(result._tag).toBe('BlockedByActivePlan');
    });
  });
});
