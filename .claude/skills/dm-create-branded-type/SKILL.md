---
name: dm-create-branded-type
description: Create a branded type with validation using Brand.refined. Use for primitive domain constraints.
model: opus
---

# Create Branded Type

Creates a branded type with validation using `Brand.refined`, including the schema integration and basic tests.

## Usage

```
/create-branded-type <TypeName> --base <string|number> --validation <rule>
```

## Arguments

- `TypeName`: The name of the branded type in PascalCase (e.g., `CycleId`, `Percentage`, `Duration`)
- `--base`: The base primitive type (`string` or `number`)
- `--validation`: The validation rule (e.g., `uuid`, `positive`, `percentage`, `non-negative`, or custom regex/predicate)

## When to Use

Use branded types when:

- You have a primitive (`string`, `number`) that needs domain constraints
- You want to prevent mixing values of the same base type (e.g., `UserId` vs `OrderId`)
- The value is atomic with no internal structure
- You need runtime validation on construction

## Output

### For String IDs (UUID validation)

```typescript
import { Brand, Schema as S } from 'effect';

// Type definition
export type CycleId = string & Brand.Brand<'CycleId'>;

// Brand constructor with validation
export const CycleId = Brand.refined<CycleId>(
  (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  (s) => Brand.error(`Invalid CycleId: ${s}`),
);

// Schema for use in S.Class and validation
export const CycleIdSchema = S.String.pipe(S.fromBrand(CycleId));
```

### For Constrained Numbers

```typescript
import { Brand, Schema as S } from 'effect';

// Percentage (0-100)
export type Percentage = number & Brand.Brand<'Percentage'>;

export const Percentage = Brand.refined<Percentage>(
  (n) => n >= 0 && n <= 100,
  (n) => Brand.error(`Percentage must be 0-100, got ${n}`),
);

export const PercentageSchema = S.Number.pipe(S.fromBrand(Percentage));

// Duration (non-negative milliseconds)
export type Duration = number & Brand.Brand<'Duration'>;

export const Duration = Brand.refined<Duration>(
  (n) => n >= 0,
  (n) => Brand.error(`Duration must be non-negative, got ${n}`),
);

export const DurationSchema = S.Number.pipe(S.fromBrand(Duration));

// PositiveInt (positive integer)
export type PositiveInt = number & Brand.Brand<'PositiveInt'>;

export const PositiveInt = Brand.refined<PositiveInt>(
  (n) => Number.isInteger(n) && n > 0,
  (n) => Brand.error(`PositiveInt must be a positive integer, got ${n}`),
);

export const PositiveIntSchema = S.Number.pipe(S.fromBrand(PositiveInt));
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Either, Schema as S } from 'effect';
import { CycleId, CycleIdSchema } from './{module}.model.js';

describe('CycleId', () => {
  describe('Brand.refined', () => {
    it('accepts valid UUID', () => {
      const validId = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => CycleId(validId)).not.toThrow();
      expect(CycleId(validId)).toBe(validId);
    });

    it('rejects invalid UUID', () => {
      expect(() => CycleId('not-a-uuid')).toThrow();
      expect(() => CycleId('')).toThrow();
    });
  });

  describe('Schema', () => {
    it.each([
      ['', false],
      ['not-a-uuid', false],
      ['550e8400-e29b-41d4-a716-446655440000', true],
      ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', true],
    ])('validates %s as %s', (input, expected) => {
      const result = S.decodeUnknownEither(CycleIdSchema)(input);
      expect(Either.isRight(result)).toBe(expected);
    });
  });
});

describe('Percentage', () => {
  it.each([
    [-1, false],
    [0, true],
    [50, true],
    [100, true],
    [101, false],
  ])('validates %d as %s', (input, expected) => {
    if (expected) {
      expect(() => Percentage(input)).not.toThrow();
    } else {
      expect(() => Percentage(input)).toThrow();
    }
  });
});
```

## Common Validation Patterns

| Type           | Validation     | Regex/Predicate                                                     |
| -------------- | -------------- | ------------------------------------------------------------------- |
| UUID           | `uuid`         | `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` |
| Email          | `email`        | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`                                      |
| Percentage     | `percentage`   | `n >= 0 && n <= 100`                                                |
| Positive       | `positive`     | `n > 0`                                                             |
| Non-negative   | `non-negative` | `n >= 0`                                                            |
| PositiveInt    | `positive-int` | `Number.isInteger(n) && n > 0`                                      |
| NonEmptyString | `non-empty`    | `s.length > 0`                                                      |
| Slug           | `slug`         | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`                                      |

## Location Guidelines

| Type                                                | Location                     | Reason                     |
| --------------------------------------------------- | ---------------------------- | -------------------------- |
| Module-specific ID (e.g., `CycleId`)                | `{module}/{module}.model.ts` | Orphaned if module deleted |
| Shared ID (e.g., `UserId`)                          | `shared/ids.ts`              | Used across modules        |
| Generic quantities (e.g., `Duration`, `Percentage`) | `shared/quantities.ts`       | Reusable primitives        |

## Brand.refined vs S.filter

| Scenario                                        | Use                         | Why                                                   |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| Primitive with domain identity (ID, Percentage) | `Brand.refined`             | Encodes semantic identity + validates at construction |
| Cross-field invariants (DateRange end > start)  | `S.filter` inside `S.Class` | Validation depends on multiple fields                 |
