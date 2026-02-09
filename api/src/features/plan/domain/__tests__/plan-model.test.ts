import { describe, it, expect } from 'bun:test';
import { Option } from 'effect';
import {
  isValidPeriodDates,
  makePeriodDateRange,
  FastingDuration,
  EatingWindow,
  PeriodOrder,
  PeriodCount,
  PlanName,
  PlanDescription,
  MIN_FASTING_DURATION,
  MAX_FASTING_DURATION,
  MIN_EATING_WINDOW,
  MAX_EATING_WINDOW,
  MIN_PERIODS,
  MAX_PERIODS,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_DESCRIPTION_LENGTH,
  type PeriodDates,
} from '../plan.model';

const makeDate = (hoursFromBase: number): Date => {
  const base = new Date('2025-01-01T00:00:00Z');
  return new Date(base.getTime() + hoursFromBase * 3_600_000);
};

const makeValidPeriodDates = (overrides: Partial<PeriodDates> = {}): PeriodDates => ({
  startDate: makeDate(0),
  endDate: makeDate(24),
  fastingStartDate: makeDate(0),
  fastingEndDate: makeDate(16),
  eatingStartDate: makeDate(16),
  eatingEndDate: makeDate(24),
  ...overrides,
});

describe('plan.model', () => {
  describe('isValidPeriodDates', () => {
    it('returns true for valid period dates', () => {
      expect(isValidPeriodDates(makeValidPeriodDates())).toBe(true);
    });

    it('returns false when startDate !== fastingStartDate', () => {
      expect(isValidPeriodDates(makeValidPeriodDates({ startDate: makeDate(1) }))).toBe(false);
    });

    it('returns false when endDate !== eatingEndDate', () => {
      expect(isValidPeriodDates(makeValidPeriodDates({ endDate: makeDate(25) }))).toBe(false);
    });

    it('returns false when fastingStartDate >= fastingEndDate', () => {
      expect(
        isValidPeriodDates(makeValidPeriodDates({ fastingStartDate: makeDate(16), fastingEndDate: makeDate(16) })),
      ).toBe(false);
    });

    it('returns false when fastingEndDate > eatingStartDate', () => {
      expect(
        isValidPeriodDates(makeValidPeriodDates({ fastingEndDate: makeDate(17), eatingStartDate: makeDate(16) })),
      ).toBe(false);
    });

    it('returns false when eatingStartDate >= eatingEndDate', () => {
      expect(
        isValidPeriodDates(makeValidPeriodDates({ eatingStartDate: makeDate(24), eatingEndDate: makeDate(24) })),
      ).toBe(false);
    });

    it('returns false when endDate <= startDate', () => {
      const dates = makeValidPeriodDates({
        startDate: makeDate(24),
        endDate: makeDate(24),
        fastingStartDate: makeDate(24),
        eatingEndDate: makeDate(24),
      });
      expect(isValidPeriodDates(dates)).toBe(false);
    });
  });

  describe('makePeriodDateRange', () => {
    it('returns Some for valid dates', () => {
      const result = makePeriodDateRange(
        makeDate(0),
        makeDate(24),
        makeDate(0),
        makeDate(16),
        makeDate(16),
        makeDate(24),
      );
      expect(Option.isSome(result)).toBe(true);
    });

    it('returns None for invalid dates', () => {
      const result = makePeriodDateRange(
        makeDate(0),
        makeDate(24),
        makeDate(0),
        makeDate(16),
        makeDate(15),
        makeDate(24),
      );
      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('FastingDuration', () => {
    it('accepts minimum value', () => {
      expect(FastingDuration(MIN_FASTING_DURATION) as number).toBe(MIN_FASTING_DURATION);
    });

    it('accepts maximum value', () => {
      expect(FastingDuration(MAX_FASTING_DURATION) as number).toBe(MAX_FASTING_DURATION);
    });

    it('accepts 15-minute increments', () => {
      expect(FastingDuration(1.25) as number).toBe(1.25);
      expect(FastingDuration(1.5) as number).toBe(1.5);
      expect(FastingDuration(1.75) as number).toBe(1.75);
    });

    it('throws for values below minimum', () => {
      expect(() => FastingDuration(0)).toThrow();
    });

    it('throws for values above maximum', () => {
      expect(() => FastingDuration(MAX_FASTING_DURATION + 1)).toThrow();
    });

    it('throws for non-15-minute increments', () => {
      expect(() => FastingDuration(1.1)).toThrow();
    });
  });

  describe('EatingWindow', () => {
    it('accepts minimum value', () => {
      expect(EatingWindow(MIN_EATING_WINDOW) as number).toBe(MIN_EATING_WINDOW);
    });

    it('accepts maximum value', () => {
      expect(EatingWindow(MAX_EATING_WINDOW) as number).toBe(MAX_EATING_WINDOW);
    });

    it('accepts 15-minute increments', () => {
      expect(EatingWindow(2.25) as number).toBe(2.25);
    });

    it('throws for values below minimum', () => {
      expect(() => EatingWindow(0)).toThrow();
    });

    it('throws for values above maximum', () => {
      expect(() => EatingWindow(MAX_EATING_WINDOW + 1)).toThrow();
    });

    it('throws for non-15-minute increments', () => {
      expect(() => EatingWindow(1.3)).toThrow();
    });
  });

  describe('PeriodOrder', () => {
    it('accepts minimum value', () => {
      expect(PeriodOrder(MIN_PERIODS) as number).toBe(MIN_PERIODS);
    });

    it('accepts maximum value', () => {
      expect(PeriodOrder(MAX_PERIODS) as number).toBe(MAX_PERIODS);
    });

    it('throws for zero', () => {
      expect(() => PeriodOrder(0)).toThrow();
    });

    it('throws for values above maximum', () => {
      expect(() => PeriodOrder(MAX_PERIODS + 1)).toThrow();
    });

    it('throws for non-integer', () => {
      expect(() => PeriodOrder(1.5)).toThrow();
    });
  });

  describe('PeriodCount', () => {
    it('accepts minimum value', () => {
      expect(PeriodCount(MIN_PERIODS) as number).toBe(MIN_PERIODS);
    });

    it('accepts maximum value', () => {
      expect(PeriodCount(MAX_PERIODS) as number).toBe(MAX_PERIODS);
    });

    it('throws for zero', () => {
      expect(() => PeriodCount(0)).toThrow();
    });

    it('throws for values above maximum', () => {
      expect(() => PeriodCount(MAX_PERIODS + 1)).toThrow();
    });

    it('throws for non-integer', () => {
      expect(() => PeriodCount(2.5)).toThrow();
    });
  });

  describe('PlanName', () => {
    it('accepts valid name', () => {
      expect(PlanName('My Plan') as string).toBe('My Plan');
    });

    it('accepts minimum length', () => {
      expect(PlanName('A') as string).toBe('A');
    });

    it('accepts maximum length', () => {
      const name = 'a'.repeat(MAX_PLAN_NAME_LENGTH);
      expect(PlanName(name) as string).toBe(name);
    });

    it('throws for empty string', () => {
      expect(() => PlanName('')).toThrow();
    });

    it('throws for string exceeding max length', () => {
      expect(() => PlanName('a'.repeat(MAX_PLAN_NAME_LENGTH + 1))).toThrow();
    });
  });

  describe('PlanDescription', () => {
    it('accepts valid description', () => {
      expect(PlanDescription('A description') as string).toBe('A description');
    });

    it('accepts empty string', () => {
      expect(PlanDescription('') as string).toBe('');
    });

    it('accepts maximum length', () => {
      const desc = 'a'.repeat(MAX_PLAN_DESCRIPTION_LENGTH);
      expect(PlanDescription(desc) as string).toBe(desc);
    });

    it('throws for string exceeding max length', () => {
      expect(() => PlanDescription('a'.repeat(MAX_PLAN_DESCRIPTION_LENGTH + 1))).toThrow();
    });
  });
});
