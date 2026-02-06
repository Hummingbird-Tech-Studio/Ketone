---
name: dm-create-literal-enum
description: Create a literal enum using S.Literal with optional metadata array. Use for simple enumerations.
model: opus
---

# Create Literal Enum

Creates a literal enum using `S.Literal` with an optional metadata array as single source of truth.

## Usage

```
/create-literal-enum <EnumName> --values <value1,value2,...> [--metadata <shape>]
```

## Arguments

- `EnumName`: The name of the enum in PascalCase (e.g., `FastingStage`, `OrderStatus`)
- `--values`: Comma-separated list of enum values
- `--metadata`: Optional metadata shape for all variants (e.g., `minHours:number,maxHours:number`)

## When to Use

Use `S.Literal` when:

- You need a simple enumeration without associated data
- Values are just labels/categories/statuses
- **All variants have the same metadata structure** (or no metadata)
- You need schema validation

Use `Data.TaggedEnum` instead when:

- Each variant has **different** associated data
- You need exhaustive pattern matching with `$match`

## Output

### Basic Enum (No Metadata)

```typescript
import { Schema as S } from 'effect';

// Schema for validation
export const OrderStatusSchema = S.Literal('Pending', 'Processing', 'Shipped', 'Delivered');
export type OrderStatus = S.Schema.Type<typeof OrderStatusSchema>;

// Const object for programmatic access
export const OrderStatus = {
  Pending: 'Pending',
  Processing: 'Processing',
  Shipped: 'Shipped',
  Delivered: 'Delivered',
} as const;
```

### Enum with Metadata Array

```typescript
import { Schema as S, Match } from 'effect';

// Schema for validation
export const FastingStageSchema = S.Literal('Digestion', 'Glycogenolysis', 'MetabolicSwitch', 'Ketosis', 'Autophagy');
export type FastingStage = S.Schema.Type<typeof FastingStageSchema>;

// Single source of truth: array with all metadata
export const FASTING_STAGES = [
  { stage: 'Digestion', minHours: 0, maxHours: 4 },
  { stage: 'Glycogenolysis', minHours: 4, maxHours: 12 },
  { stage: 'MetabolicSwitch', minHours: 12, maxHours: 18 },
  { stage: 'Ketosis', minHours: 18, maxHours: 24 },
  { stage: 'Autophagy', minHours: 24, maxHours: Infinity },
] as const satisfies readonly {
  stage: FastingStage;
  minHours: number;
  maxHours: number;
}[];

// Derived: calculate stage from hours
export const calculateFastingStage = (hours: number): FastingStage =>
  FASTING_STAGES.find((s) => hours >= s.minHours && hours < s.maxHours)?.stage ?? 'Autophagy';

// Derived: get thresholds for a stage
export const getStageThresholds = (stage: FastingStage) => FASTING_STAGES.find((s) => s.stage === stage)!;
```

### Using Match for Exhaustive Handling

```typescript
import { Match } from 'effect';

// Match.type<T>() creates a reusable matcher
export const describeStatus = Match.type<OrderStatus>().pipe(
  Match.when('Pending', () => 'Waiting for payment'),
  Match.when('Processing', () => 'Being prepared'),
  Match.when('Shipped', () => 'On the way'),
  Match.when('Delivered', () => 'Arrived'),
  Match.exhaustive, // Compiler error if a case is missing
);

// Usage
describeStatus('Pending'); // → 'Waiting for payment'

// Match.value for inline matching
const message = Match.value(status).pipe(
  Match.when('Pending', () => 'Waiting...'),
  Match.when('Processing', () => 'Working...'),
  Match.when('Shipped', () => 'Shipping...'),
  Match.when('Delivered', () => 'Done!'),
  Match.exhaustive,
);
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Either, Schema as S } from 'effect';
import { FastingStageSchema, FASTING_STAGES, calculateFastingStage, getStageThresholds } from './{module}.model.js';

describe('FastingStage', () => {
  describe('Schema validation', () => {
    it.each([
      ['Digestion', true],
      ['Ketosis', true],
      ['Invalid', false],
      ['', false],
    ])('validates %s as %s', (input, expected) => {
      const result = S.decodeUnknownEither(FastingStageSchema)(input);
      expect(Either.isRight(result)).toBe(expected);
    });
  });

  describe('FASTING_STAGES metadata', () => {
    it('has correct number of stages', () => {
      expect(FASTING_STAGES).toHaveLength(5);
    });

    it('has contiguous hour ranges', () => {
      for (let i = 1; i < FASTING_STAGES.length; i++) {
        expect(FASTING_STAGES[i].minHours).toBe(FASTING_STAGES[i - 1].maxHours);
      }
    });
  });

  describe('calculateFastingStage', () => {
    it.each([
      [0, 'Digestion'],
      [3, 'Digestion'],
      [4, 'Glycogenolysis'],
      [11, 'Glycogenolysis'],
      [12, 'MetabolicSwitch'],
      [18, 'Ketosis'],
      [24, 'Autophagy'],
      [100, 'Autophagy'],
    ])('returns %s for %d hours', (hours, expected) => {
      expect(calculateFastingStage(hours)).toBe(expected);
    });
  });

  describe('getStageThresholds', () => {
    it('returns correct thresholds for Ketosis', () => {
      const thresholds = getStageThresholds('Ketosis');
      expect(thresholds.minHours).toBe(18);
      expect(thresholds.maxHours).toBe(24);
    });
  });
});
```

## Prefer Match over Map

Maps provide no compile-time guarantees. Use `Match` for exhaustive handling:

```typescript
// ❌ Map: no compile-time guarantee, can miss keys
const ratesMap = new Map<CustomerRating, number>([
  ['Good', 5],
  ['Acceptable', 10],
  // Forgot 'Poor'! No compiler error.
]);

// ✅ Match: exhaustive, compiler enforces all cases
const getRate = (rating: CustomerRating): number =>
  Match.value(rating).pipe(
    Match.when('Good', () => 5),
    Match.when('Acceptable', () => 10),
    Match.when('Poor', () => 15),
    Match.exhaustive, // Compiler error if 'Poor' is missing
  );
```

## S.Literal vs TaggedEnum Decision

```
Is metadata the same for all variants?
├── YES → S.Literal + Array
│         • Schema validation built-in
│         • Derive functions from single array
│         • Use Match.type<T>() for exhaustive handling
│
└── NO → Data.TaggedEnum
          • $match for exhaustive pattern matching
          • $is for type guards
          • Each variant is a separate type
```

## References

- [guide.md](guide.md) — Extended guide: evolution guidelines, advanced Match patterns, complete S.Literal vs TaggedEnum decision table, metadata array deep dive
