---
name: dm-create-smart-constructors
description: Create smart constructors (create/Effect and make/Option) for types with validation.
model: opus
---

# Create Smart Constructors

Creates smart constructors (`create` returning Effect, `make` returning Option) for types with validation.

## Usage

```
/create-smart-constructors <TypeName>
```

## Arguments

- `TypeName`: The name of the type to create constructors for (e.g., `DateRange`, `Email`)

## When to Use

Always provide smart constructors when:

- The type has validation rules (S.filter, Brand.refined)
- You want to guarantee only valid instances exist
- You need different "flavors" of construction (Effect, Option)
- The type is used in both effectful and synchronous contexts

## Naming Conventions

| Prefix   | Return Type                         | Use Case                          |
| -------- | ----------------------------------- | --------------------------------- |
| `create` | `Effect<T, ParseResult.ParseError>` | Default choice, Effect pipelines  |
| `make`   | `Option<T>`                         | Synchronous, success/failure only |

## Output

### For Value Objects (S.Class with validation)

```typescript
import { Effect, Option, ParseResult, Schema as S } from 'effect';

// The class (with filter INSIDE)
export class DateRange extends S.Class<DateRange>('DateRange')(
  S.Struct({
    start: S.DateFromSelf,
    end: S.DateFromSelf,
  }).pipe(S.filter(({ start, end }) => (end.getTime() > start.getTime() ? undefined : 'End must be after start'))),
) {}

// Smart constructor returning Effect (for effectful contexts)
export const createDateRange = (start: Date, end: Date): Effect.Effect<DateRange, ParseResult.ParseError> =>
  S.decodeUnknown(DateRange)({ start, end });

// Smart constructor returning Option (for non-effectful contexts)
export const makeDateRange = (start: Date, end: Date): Option.Option<DateRange> =>
  Effect.runSync(Effect.option(createDateRange(start, end)));
```

### For Branded Types

```typescript
import { Effect, Option, Schema as S, ParseResult } from 'effect';

// Schema for the branded type
export const PercentageSchema = S.Number.pipe(S.fromBrand(Percentage));

// Smart constructor returning Effect
export const createPercentage = (value: number): Effect.Effect<Percentage, ParseResult.ParseError> =>
  S.decodeUnknown(PercentageSchema)(value);

// Smart constructor returning Option
export const makePercentage = (value: number): Option.Option<Percentage> =>
  Effect.runSync(Effect.option(createPercentage(value)));
```

### For Complex Types with Multiple Fields

```typescript
import { Effect, Option, Schema as S, ParseResult } from 'effect';

export class Money extends S.Class<Money>('Money')({
  amount: S.Number.pipe(S.nonNegative()),
  currency: S.Literal('USD', 'EUR', 'MXN'),
}) {}

// Accept individual parameters for convenience
export const createMoney = (
  amount: number,
  currency: 'USD' | 'EUR' | 'MXN',
): Effect.Effect<Money, ParseResult.ParseError> => S.decodeUnknown(Money)({ amount, currency });

export const makeMoney = (amount: number, currency: 'USD' | 'EUR' | 'MXN'): Option.Option<Money> =>
  Effect.runSync(Effect.option(createMoney(amount, currency)));

// Convenience factory for common currency
export const usd = (amount: number): Option.Option<Money> => makeMoney(amount, 'USD');
```

## Usage Examples

### In Effect Pipelines

```typescript
const program = Effect.gen(function* () {
  // Use create* for Effect pipelines
  const range = yield* createDateRange(startDate, endDate);
  const percentage = yield* createPercentage(50);

  return { range, percentage };
});
```

### In Synchronous Code

```typescript
// Use make* when you just need success/failure
const range = makeDateRange(startDate, endDate);

if (Option.isSome(range)) {
  console.log('Duration:', range.value.durationMs);
} else {
  console.log('Invalid date range');
}

// Or with getOrElse for defaults
const percentage = Option.getOrElse(makePercentage(value), () => Percentage(0));
```

### In Validation Chains

```typescript
const validateInput = (input: unknown) =>
  Effect.gen(function* () {
    const { start, end, percentage } = input as any;

    // All validations run, collecting errors
    const [range, pct] = yield* Effect.all([
      createDateRange(new Date(start), new Date(end)),
      createPercentage(percentage),
    ]);

    return { range, pct };
  });
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either, Option } from 'effect';
import { createDateRange, makeDateRange, DateRange } from './{module}.model.js';

describe('DateRange smart constructors', () => {
  const validStart = new Date('2025-01-01');
  const validEnd = new Date('2025-01-02');
  const invalidEnd = new Date('2024-12-31');

  describe('createDateRange (Effect)', () => {
    it('returns Right for valid input', async () => {
      const result = await Effect.runPromise(Effect.either(createDateRange(validStart, validEnd)));
      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeInstanceOf(DateRange);
      }
    });

    it('returns Left for invalid input', async () => {
      const result = await Effect.runPromise(Effect.either(createDateRange(validStart, invalidEnd)));
      expect(Either.isLeft(result)).toBe(true);
    });

    it('can be used in Effect.gen', async () => {
      const program = Effect.gen(function* () {
        const range = yield* createDateRange(validStart, validEnd);
        return range.durationHours;
      });

      const hours = await Effect.runPromise(program);
      expect(hours).toBe(24);
    });
  });

  describe('makeDateRange (Option)', () => {
    it('returns Some for valid input', () => {
      const result = makeDateRange(validStart, validEnd);
      expect(Option.isSome(result)).toBe(true);
    });

    it('returns None for invalid input', () => {
      const result = makeDateRange(validStart, invalidEnd);
      expect(Option.isNone(result)).toBe(true);
    });

    it('can be used with getOrElse', () => {
      const fallback = new DateRange({
        start: new Date(0),
        end: new Date(1),
      });

      const result = Option.getOrElse(makeDateRange(validStart, invalidEnd), () => fallback);

      expect(result).toBe(fallback);
    });
  });
});
```

## Why Two Constructors?

| Constructor        | Use When                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| `create*` (Effect) | In Effect pipelines, when you need error details, when composing with other effects |
| `make*` (Option)   | In synchronous code, when you only care about success/failure, in tests             |

The `make*` variant is essentially:

```typescript
const make = (...args) => Effect.runSync(Effect.option(create(...args)));
```

This pattern allows the same validation logic to be used in both contexts without duplication.

## References

- functional-domain-modeling.md#1497-1561 (Smart Constructors)
- functional-domain-modeling.md#1554-1560 (Naming Conventions)
