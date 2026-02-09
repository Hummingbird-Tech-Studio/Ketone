import { describe, it, expect } from 'bun:test';
import {
  decidePlanTemplateCreation,
  decidePlanTemplateDuplication,
  decidePlanTemplateUpdate,
  decidePlanTemplateDeletion,
  decidePlanTemplateApplication,
  extractTemplateFromPlan,
  buildDuplicateName,
  assignPeriodOrders,
  toPeriodInputs,
} from '../services/plan-template.service';
import { TemplatePeriodConfig } from '../plan-template.model';
import type { PlanTemplateId } from '../plan-template.model';
import {
  PlanName,
  PlanDescription,
  PeriodOrder,
  FastingDuration,
  EatingWindow,
  MIN_PERIODS,
  MAX_PERIODS,
  MAX_PLAN_NAME_LENGTH,
  type PlanId,
  type PeriodId,
  type PlanWithPeriods,
  type Period,
} from '../../../plan/domain/plan.model';

const makeDate = (hoursFromBase: number): Date => {
  const base = new Date('2025-01-01T00:00:00Z');
  return new Date(base.getTime() + hoursFromBase * 3_600_000);
};

const templateId = '00000000-0000-0000-0000-000000000001' as PlanTemplateId;
const planId = '00000000-0000-0000-0000-000000000099' as PlanId;

describe('plan-template.service', () => {
  describe('decidePlanTemplateCreation', () => {
    it('returns CanCreate when below limit', () => {
      const result = decidePlanTemplateCreation({ currentCount: 5, maxTemplates: 20 });
      expect(result._tag).toBe('CanCreate');
    });

    it('returns LimitReached when at limit', () => {
      const result = decidePlanTemplateCreation({ currentCount: 20, maxTemplates: 20 });
      expect(result._tag).toBe('LimitReached');
      if (result._tag === 'LimitReached') {
        expect(result.currentCount).toBe(20);
        expect(result.maxTemplates).toBe(20);
      }
    });

    it('returns LimitReached when above limit', () => {
      const result = decidePlanTemplateCreation({ currentCount: 21, maxTemplates: 20 });
      expect(result._tag).toBe('LimitReached');
    });
  });

  describe('decidePlanTemplateDuplication', () => {
    it('returns CanDuplicate when below limit', () => {
      const result = decidePlanTemplateDuplication({ currentCount: 10, maxTemplates: 20 });
      expect(result._tag).toBe('CanDuplicate');
    });

    it('returns LimitReached when at limit', () => {
      const result = decidePlanTemplateDuplication({ currentCount: 20, maxTemplates: 20 });
      expect(result._tag).toBe('LimitReached');
      if (result._tag === 'LimitReached') {
        expect(result.currentCount).toBe(20);
        expect(result.maxTemplates).toBe(20);
      }
    });
  });

  describe('decidePlanTemplateUpdate', () => {
    it('returns CanUpdate for valid period count', () => {
      const result = decidePlanTemplateUpdate({ periodCount: 5 });
      expect(result._tag).toBe('CanUpdate');
    });

    it('returns CanUpdate for minimum period count', () => {
      const result = decidePlanTemplateUpdate({ periodCount: MIN_PERIODS });
      expect(result._tag).toBe('CanUpdate');
    });

    it('returns CanUpdate for maximum period count', () => {
      const result = decidePlanTemplateUpdate({ periodCount: MAX_PERIODS });
      expect(result._tag).toBe('CanUpdate');
    });

    it('returns InvalidPeriodCount for count below minimum', () => {
      const result = decidePlanTemplateUpdate({ periodCount: MIN_PERIODS - 1 });
      expect(result._tag).toBe('InvalidPeriodCount');
      if (result._tag === 'InvalidPeriodCount') {
        expect(result.periodCount).toBe(MIN_PERIODS - 1);
        expect(result.minPeriods).toBe(MIN_PERIODS);
        expect(result.maxPeriods).toBe(MAX_PERIODS);
      }
    });

    it('returns InvalidPeriodCount for count above maximum', () => {
      const result = decidePlanTemplateUpdate({ periodCount: MAX_PERIODS + 1 });
      expect(result._tag).toBe('InvalidPeriodCount');
    });
  });

  describe('decidePlanTemplateDeletion', () => {
    it('returns CanDelete when template exists', () => {
      const result = decidePlanTemplateDeletion({
        planTemplateId: templateId,
        exists: true,
      });
      expect(result._tag).toBe('CanDelete');
    });

    it('returns TemplateNotFound when template does not exist', () => {
      const result = decidePlanTemplateDeletion({
        planTemplateId: templateId,
        exists: false,
      });
      expect(result._tag).toBe('TemplateNotFound');
      if (result._tag === 'TemplateNotFound') {
        expect(result.planTemplateId).toBe(templateId);
      }
    });
  });

  describe('decidePlanTemplateApplication', () => {
    it('returns CanApply when template has periods', () => {
      const periodConfigs = [
        new TemplatePeriodConfig({
          order: PeriodOrder(1),
          fastingDuration: FastingDuration(16),
          eatingWindow: EatingWindow(8),
        }),
      ];
      const result = decidePlanTemplateApplication({
        planTemplateId: templateId,
        startDate: makeDate(0),
        periodConfigs,
      });
      expect(result._tag).toBe('CanApply');
      if (result._tag === 'CanApply') {
        expect(result.periodConfigs).toHaveLength(1);
      }
    });

    it('returns EmptyTemplate when template has no periods', () => {
      const result = decidePlanTemplateApplication({
        planTemplateId: templateId,
        startDate: makeDate(0),
        periodConfigs: [],
      });
      expect(result._tag).toBe('EmptyTemplate');
      if (result._tag === 'EmptyTemplate') {
        expect(result.planTemplateId).toBe(templateId);
      }
    });
  });

  describe('extractTemplateFromPlan', () => {
    it('extracts name, description, and ordered period configs', () => {
      const plan = {
        id: planId,
        userId: '00000000-0000-0000-0000-000000000002',
        name: PlanName('My Plan'),
        description: PlanDescription('Desc'),
        startDate: makeDate(0),
        status: 'InProgress' as const,
        createdAt: makeDate(0),
        updatedAt: makeDate(0),
        periods: [
          {
            id: '00000000-0000-0000-0000-000000000010' as PeriodId,
            planId,
            order: PeriodOrder(1),
            fastingDuration: FastingDuration(16),
            eatingWindow: EatingWindow(8),
            startDate: makeDate(0),
            endDate: makeDate(24),
            fastingStartDate: makeDate(0),
            fastingEndDate: makeDate(16),
            eatingStartDate: makeDate(16),
            eatingEndDate: makeDate(24),
            createdAt: makeDate(0),
            updatedAt: makeDate(0),
          },
        ],
      } as PlanWithPeriods;

      const result = extractTemplateFromPlan(plan);

      expect(result.name as string).toBe('My Plan');
      expect(result.description as string | null).toBe('Desc');
      expect(result.periods).toHaveLength(1);
      expect(result.periods[0]!.order as number).toBe(1);
      expect(result.periods[0]!.fastingDuration as number).toBe(16);
      expect(result.periods[0]!.eatingWindow as number).toBe(8);
    });
  });

  describe('buildDuplicateName', () => {
    it('appends (copy) to name', () => {
      const result = buildDuplicateName(PlanName('My Plan'));
      expect(result as string).toBe('My Plan (copy)');
    });

    it('truncates long names to stay within limit', () => {
      const longName = PlanName('a'.repeat(MAX_PLAN_NAME_LENGTH));
      const result = buildDuplicateName(longName);
      expect((result as string).length).toBeLessThanOrEqual(MAX_PLAN_NAME_LENGTH);
      expect(result as string).toEndWith(' (copy)');
    });

    it('keeps short names intact', () => {
      const result = buildDuplicateName(PlanName('Short'));
      expect(result as string).toBe('Short (copy)');
    });
  });

  describe('assignPeriodOrders', () => {
    it('assigns 1-based order', () => {
      const periods = [
        { fastingDuration: 16, eatingWindow: 8 },
        { fastingDuration: 20, eatingWindow: 4 },
      ];
      const result = assignPeriodOrders(periods);

      expect(result).toHaveLength(2);
      expect(result[0]!.order).toBe(1);
      expect(result[1]!.order).toBe(2);
      expect(result[0]!.fastingDuration).toBe(16);
      expect(result[1]!.fastingDuration).toBe(20);
    });

    it('handles empty array', () => {
      const result = assignPeriodOrders([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('toPeriodInputs', () => {
    it('strips order and returns duration fields only', () => {
      const periodConfigs = [
        new TemplatePeriodConfig({
          order: PeriodOrder(1),
          fastingDuration: FastingDuration(16),
          eatingWindow: EatingWindow(8),
        }),
        new TemplatePeriodConfig({
          order: PeriodOrder(2),
          fastingDuration: FastingDuration(20),
          eatingWindow: EatingWindow(4),
        }),
      ];
      const result = toPeriodInputs(periodConfigs);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ fastingDuration: 16, eatingWindow: 8 });
      expect(result[1]).toEqual({ fastingDuration: 20, eatingWindow: 4 });
      expect((result[0] as any).order).toBeUndefined();
    });
  });
});
