---
name: dm-create-value-object
description: Create a value object using S.Class with cross-field validation. Use for multi-field immutable types.
model: opus
---

# Create Value Object

Creates a value object using `S.Class` with cross-field validation using `S.filter` INSIDE the class definition.

## Usage

```
/create-value-object <ValueObjectName> --fields <field1:type1,field2:type2,...> [--validation <rule>]
```

## Arguments

- `ValueObjectName`: The name in PascalCase (e.g., `DateRange`, `Money`, `Address`)
- `--fields`: Comma-separated field definitions
- `--validation`: Optional cross-field validation rule

## When to Use

Use `S.Class` for value objects when:

- You have 2+ fields that **always** belong together
- **All** fields apply in **all** cases (no contextual fields)
- There are invariants between fields (e.g., `end > start`)
- You need computed properties or methods
- The type has no identity (equality is structural, by value)

Don't use when:

- It's a single primitive value (use `Brand.refined`)
- Some fields only apply in certain states (use `TaggedEnum`)
- The type has identity that persists over time (use Entity pattern)

## Critical: S.filter INSIDE S.Class

**Always apply `S.filter` INSIDE the class definition**, not after. This ensures the constructor validates automatically.

```typescript
// ✅ CORRECT: filter INSIDE the class - constructor validates
class DateRange extends S.Class<DateRange>('DateRange')(
  S.Struct({
    start: S.DateFromSelf,
    end: S.DateFromSelf,
  }).pipe(
    S.filter(({ start, end }) =>
      end.getTime() > start.getTime() ? undefined : 'End must be after start'
    )
  )
) {}

// ❌ WRONG: filter OUTSIDE - constructor does NOT validate
class DateRange extends S.Class<DateRange>('DateRange')({
  start: S.DateFromSelf,
  end: S.DateFromSelf,
}) {}
const DateRangeValidated = DateRange.pipe(S.filter(...)); // Invalid instances possible!
```

## Output

### DateRange (with cross-field validation)

```typescript
import { Effect, Option, ParseResult, Schema as S } from 'effect';
import { Duration } from '../shared/quantities.js';

/**
 * DateRange Value Object
 *
 * Represents a time range with start and end dates.
 * Invariant: end > start (enforced at construction)
 */
export class DateRange extends S.Class<DateRange>('DateRange')(
  S.Struct({
    start: S.DateFromSelf,
    end: S.DateFromSelf,
  }).pipe(
    S.filter(({ start, end }) => (end.getTime() > start.getTime() ? undefined : 'End date must be after start date')),
  ),
) {
  /** Duration in milliseconds */
  get durationMs(): Duration {
    return Duration(this.end.getTime() - this.start.getTime());
  }

  /** Duration in hours */
  get durationHours(): number {
    return this.durationMs / 3600000;
  }

  /** Check if a date falls within this range */
  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }
}

// Smart constructors
export const createDateRange = (start: Date, end: Date): Effect.Effect<DateRange, ParseResult.ParseError> =>
  S.decodeUnknown(DateRange)({ start, end });

export const makeDateRange = (start: Date, end: Date): Option.Option<DateRange> =>
  Effect.runSync(Effect.option(createDateRange(start, end)));
```

### Money (simple value object)

```typescript
import { Schema as S } from 'effect';

/**
 * Money Value Object
 *
 * Represents a monetary amount with currency.
 */
export class Money extends S.Class<Money>('Money')({
  amount: S.Number.pipe(S.nonNegative()),
  currency: S.Literal('USD', 'EUR', 'MXN'),
}) {
  /** Add two money values (must be same currency) */
  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return new Money({
      amount: this.amount + other.amount,
      currency: this.currency,
    });
  }

  /** Multiply by a factor */
  multiply(factor: number): Money {
    return new Money({ amount: this.amount * factor, currency: this.currency });
  }

  /** Create zero amount for a currency */
  static zero(currency: Money['currency']): Money {
    return new Money({ amount: 0, currency });
  }
}
```

### Address (simple value object, no validation)

```typescript
import { Schema as S } from 'effect';

/**
 * Address Value Object
 */
export class Address extends S.Class<Address>('Address')({
  street: S.String,
  city: S.String,
  state: S.String,
  zipCode: S.String,
  country: S.String,
}) {}
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either, Option, Schema as S } from 'effect';
import { DateRange, createDateRange, makeDateRange } from './{module}.model.js';

describe('DateRange', () => {
  const validStart = new Date('2025-01-01');
  const validEnd = new Date('2025-01-02');
  const invalidEnd = new Date('2024-12-31'); // Before start

  describe('construction', () => {
    it('creates valid DateRange', () => {
      const range = new DateRange({ start: validStart, end: validEnd });
      expect(range.start).toEqual(validStart);
      expect(range.end).toEqual(validEnd);
    });

    it('throws on invalid range (end before start)', () => {
      expect(() => new DateRange({ start: validStart, end: invalidEnd })).toThrow();
    });

    it('throws on equal dates', () => {
      expect(() => new DateRange({ start: validStart, end: validStart })).toThrow();
    });
  });

  describe('computed properties', () => {
    it('calculates durationMs correctly', () => {
      const range = new DateRange({ start: validStart, end: validEnd });
      expect(range.durationMs).toBe(86400000); // 24 hours in ms
    });

    it('calculates durationHours correctly', () => {
      const range = new DateRange({ start: validStart, end: validEnd });
      expect(range.durationHours).toBe(24);
    });
  });

  describe('methods', () => {
    it('contains returns true for date within range', () => {
      const range = new DateRange({ start: validStart, end: validEnd });
      const middle = new Date('2025-01-01T12:00:00');
      expect(range.contains(middle)).toBe(true);
    });

    it('contains returns false for date outside range', () => {
      const range = new DateRange({ start: validStart, end: validEnd });
      const outside = new Date('2025-01-03');
      expect(range.contains(outside)).toBe(false);
    });
  });

  describe('smart constructors', () => {
    it('createDateRange returns Effect with valid input', async () => {
      const result = await Effect.runPromise(createDateRange(validStart, validEnd));
      expect(result.start).toEqual(validStart);
    });

    it('createDateRange fails with invalid input', async () => {
      const result = await Effect.runPromise(Effect.either(createDateRange(validStart, invalidEnd)));
      expect(Either.isLeft(result)).toBe(true);
    });

    it('makeDateRange returns Some with valid input', () => {
      const result = makeDateRange(validStart, validEnd);
      expect(Option.isSome(result)).toBe(true);
    });

    it('makeDateRange returns None with invalid input', () => {
      const result = makeDateRange(validStart, invalidEnd);
      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('structural equality', () => {
    it('equal ranges are Equal.equals', () => {
      const range1 = new DateRange({ start: validStart, end: validEnd });
      const range2 = new DateRange({ start: validStart, end: validEnd });
      expect(Equal.equals(range1, range2)).toBe(true);
    });
  });
});
```

## The Implicit AND

Every field in an `S.Class` is connected by AND. This means:

- All fields apply in all cases
- If a field only applies in certain contexts, it doesn't belong here

```typescript
// ❌ Bad: shippedAt only applies when status is 'shipped'
class Order extends S.Class<Order>('Order')({
  status: S.Literal('pending', 'shipped'),
  shippedAt: S.optionalWith(S.DateFromSelf, { nullable: true }),
}) {}

// ✅ Good: Use TaggedEnum when data varies by state
type Order = Data.TaggedEnum<{
  Pending: { readonly items: readonly Item[] };
  Shipped: { readonly items: readonly Item[]; readonly shippedAt: Date };
}>;
```

## References

- functional-domain-modeling.md#566-673 (Schema Class)
- functional-domain-modeling.md#643-671 (Validation with Filters - INSIDE vs OUTSIDE)
- functional-domain-modeling.md#604-623 (The Implicit AND)
