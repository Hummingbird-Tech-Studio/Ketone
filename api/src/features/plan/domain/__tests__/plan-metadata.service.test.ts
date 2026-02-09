import { describe, it, expect } from 'bun:test';
import { computeMetadataUpdate } from '../services/plan-metadata.service';
import {
  PlanName,
  PlanDescription,
  PeriodOrder,
  FastingDuration,
  EatingWindow,
  type PlanId,
  type PeriodId,
  type Plan,
  type Period,
} from '../plan.model';

const ONE_HOUR_MS = 3_600_000;

const makeDate = (hoursFromBase: number): Date => {
  const base = new Date('2025-01-01T00:00:00Z');
  return new Date(base.getTime() + hoursFromBase * ONE_HOUR_MS);
};

const planId = '00000000-0000-0000-0000-000000000001' as PlanId;
const userId = '00000000-0000-0000-0000-000000000002';

const makePlan = (overrides: Partial<Plan> = {}): Plan =>
  ({
    id: planId,
    userId,
    name: PlanName('Test Plan'),
    description: null,
    startDate: makeDate(0),
    status: 'InProgress',
    createdAt: makeDate(0),
    updatedAt: makeDate(0),
    ...overrides,
  }) as Plan;

const makePeriod = (
  id: string,
  order: number,
  fastingDuration: number,
  eatingWindow: number,
  fastingStartHour: number,
): Period =>
  ({
    id: id as PeriodId,
    planId,
    order: PeriodOrder(order),
    fastingDuration: FastingDuration(fastingDuration),
    eatingWindow: EatingWindow(eatingWindow),
    startDate: makeDate(fastingStartHour),
    endDate: makeDate(fastingStartHour + fastingDuration + eatingWindow),
    fastingStartDate: makeDate(fastingStartHour),
    fastingEndDate: makeDate(fastingStartHour + fastingDuration),
    eatingStartDate: makeDate(fastingStartHour + fastingDuration),
    eatingEndDate: makeDate(fastingStartHour + fastingDuration + eatingWindow),
    createdAt: makeDate(0),
    updatedAt: makeDate(0),
  }) as Period;

describe('plan-metadata.service', () => {
  describe('computeMetadataUpdate', () => {
    it('updates name only', () => {
      const result = computeMetadataUpdate({
        existingPlan: makePlan(),
        existingPeriods: [],
        metadata: { name: 'New Name' },
      });

      expect(result.planUpdate.name).toBe('New Name');
      expect(result.planUpdate.description).toBeUndefined();
      expect(result.planUpdate.startDate).toBeUndefined();
      expect(result.recalculatedPeriods).toBeNull();
    });

    it('normalizes empty description to null', () => {
      const result = computeMetadataUpdate({
        existingPlan: makePlan(),
        existingPeriods: [],
        metadata: { description: '' },
      });

      expect(result.planUpdate.description).toBeNull();
    });

    it('normalizes whitespace-only description to null', () => {
      const result = computeMetadataUpdate({
        existingPlan: makePlan(),
        existingPeriods: [],
        metadata: { description: '   ' },
      });

      expect(result.planUpdate.description).toBeNull();
    });

    it('preserves non-empty description', () => {
      const result = computeMetadataUpdate({
        existingPlan: makePlan(),
        existingPeriods: [],
        metadata: { description: 'A description' },
      });

      expect(result.planUpdate.description).toBe('A description');
    });

    it('does not recalculate when startDate is unchanged', () => {
      const plan = makePlan({ startDate: makeDate(0) });
      const period = makePeriod('00000000-0000-0000-0000-000000000010', 1, 16, 8, 0);

      const result = computeMetadataUpdate({
        existingPlan: plan,
        existingPeriods: [period],
        metadata: { startDate: makeDate(0) },
      });

      expect(result.recalculatedPeriods).toBeNull();
    });

    it('recalculates periods when startDate changes', () => {
      const plan = makePlan({ startDate: makeDate(0) });
      const period = makePeriod('00000000-0000-0000-0000-000000000010', 1, 16, 8, 0);

      const result = computeMetadataUpdate({
        existingPlan: plan,
        existingPeriods: [period],
        metadata: { startDate: makeDate(48) },
      });

      expect(result.recalculatedPeriods).not.toBeNull();
      expect(result.recalculatedPeriods).toHaveLength(1);
      const recalc = result.recalculatedPeriods![0]!;
      expect(recalc.id).toBe('00000000-0000-0000-0000-000000000010');
      expect(recalc.startDate).toEqual(makeDate(48));
      expect(recalc.fastingStartDate).toEqual(makeDate(48));
      expect(recalc.fastingEndDate).toEqual(makeDate(64));
      expect(recalc.eatingStartDate).toEqual(makeDate(64));
      expect(recalc.eatingEndDate).toEqual(makeDate(72));
    });

    it('returns null recalculated when no periods and startDate changes', () => {
      const plan = makePlan({ startDate: makeDate(0) });

      const result = computeMetadataUpdate({
        existingPlan: plan,
        existingPeriods: [],
        metadata: { startDate: makeDate(48) },
      });

      expect(result.recalculatedPeriods).toBeNull();
    });

    it('preserves period IDs during recalculation', () => {
      const plan = makePlan({ startDate: makeDate(0) });
      const period1 = makePeriod('00000000-0000-0000-0000-000000000010', 1, 16, 8, 0);
      const period2 = makePeriod('00000000-0000-0000-0000-000000000020', 2, 20, 4, 24);

      const result = computeMetadataUpdate({
        existingPlan: plan,
        existingPeriods: [period1, period2],
        metadata: { startDate: makeDate(100) },
      });

      expect(result.recalculatedPeriods).toHaveLength(2);
      expect(result.recalculatedPeriods![0]!.id).toBe('00000000-0000-0000-0000-000000000010');
      expect(result.recalculatedPeriods![1]!.id).toBe('00000000-0000-0000-0000-000000000020');
    });
  });
});
