---
name: dm-create-tagged-enum
description: Create a discriminated union using Data.TaggedEnum. Use for mutually exclusive states with different data.
model: opus
---

# Create Tagged Enum

Creates a discriminated union (ADT) using `Data.TaggedEnum` with `$is` and `$match` helpers.

## Usage

```
/create-tagged-enum <EnumName> --variants <Variant1:field1:type1,field2:type2|Variant2:field1:type1,...>
```

## Arguments

- `EnumName`: The name in PascalCase (e.g., `PaymentResult`, `CycleProgressAssessment`)
- `--variants`: Pipe-separated variant definitions with colon-separated fields

## When to Use

Use `Data.TaggedEnum` when:

- A value can be one of several **mutually exclusive** states
- **Each variant has different associated data**
- You need exhaustive pattern matching
- Modeling state machines, results, or outcomes
- You have optional fields that depend on other fields

Use `S.Literal` instead when:

- Variants have identical structure (same metadata for all)
- It's a simple status without associated data

## Output

### Assessment/Result ADT

```typescript
import { Data } from 'effect';
import { Duration, Percentage } from '../shared/quantities.js';

/**
 * CycleProgressAssessment
 *
 * Represents the assessed state of a cycle's progress.
 * Each variant has different data appropriate to that state.
 */
export type CycleProgressAssessment = Data.TaggedEnum<{
  OnTrack: { readonly remaining: Duration; readonly progress: Percentage };
  Overdue: { readonly overdue: Duration; readonly progress: Percentage };
  Completed: { readonly totalDuration: Duration };
}>;

export const CycleProgressAssessment = Data.taggedEnum<CycleProgressAssessment>();

// Extract type guards and exhaustive matcher
export const { $is, $match } = CycleProgressAssessment;

// Usage examples:
// const onTrack = CycleProgressAssessment.OnTrack({ remaining: Duration(3600000), progress: Percentage(50) });
// const isOnTrack = $is('OnTrack')(assessment);
// const message = $match(assessment, { OnTrack: ..., Overdue: ..., Completed: ... });
```

### Payment Result ADT

```typescript
import { Data } from 'effect';

export type PaymentResult = Data.TaggedEnum<{
  Approved: { readonly transactionId: string; readonly amount: number };
  Declined: { readonly reason: string; readonly code: number };
  Pending: { readonly estimatedTime: number };
  RequiresVerification: {
    readonly verificationUrl: string;
    readonly expiresAt: Date;
  };
}>;

export const PaymentResult = Data.taggedEnum<PaymentResult>();
export const { $is, $match } = PaymentResult;
```

### Decision ADT (Reified Decisions)

```typescript
import { Data } from 'effect';
import { CycleId } from './cycle.model.js';

/**
 * CycleUpdateDecision
 *
 * Reified decision from the update cycle use case.
 * Separates "what to do" from "how to do it".
 */
export type CycleUpdateDecision = Data.TaggedEnum<{
  NoChanges: { readonly cycleId: CycleId };
  Update: {
    readonly cycleId: CycleId;
    readonly startDate: Date;
    readonly endDate: Date;
  };
}>;

export const CycleUpdateDecision = Data.taggedEnum<CycleUpdateDecision>();
export const { $is: isDecision, $match: matchDecision } = CycleUpdateDecision;
```

## Pattern Matching

### Using $match (exhaustive)

```typescript
// $match returns a function when called with just handlers
const getMessage = PaymentResult.$match({
  Approved: ({ transactionId, amount }) => `Payment of $${amount} approved (${transactionId})`,
  Declined: ({ reason, code }) => `Payment declined: ${reason} (code: ${code})`,
  Pending: ({ estimatedTime }) => `Processing... ETA: ${estimatedTime}ms`,
  RequiresVerification: ({ verificationUrl }) => `Please verify at: ${verificationUrl}`,
});

// Usage
const message = getMessage(result);

// Alternative: pass value as first argument
const message2 = PaymentResult.$match(result, {
  Approved: ({ transactionId }) => `Approved: ${transactionId}`,
  Declined: ({ reason }) => `Declined: ${reason}`,
  Pending: () => 'Pending...',
  RequiresVerification: () => 'Verify required',
});
```

### Using $is (type guard)

```typescript
if (PaymentResult.$is('Approved')(result)) {
  // result is narrowed to PaymentResult.Approved
  console.log(result.transactionId, result.amount);
}

// Useful for filtering
const approvedPayments = payments.filter(PaymentResult.$is('Approved'));
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { CycleProgressAssessment, $is, $match } from './{module}.model.js';
import { Duration, Percentage } from '../shared/quantities.js';

describe('CycleProgressAssessment', () => {
  describe('construction', () => {
    it('creates OnTrack variant', () => {
      const assessment = CycleProgressAssessment.OnTrack({
        remaining: Duration(3600000),
        progress: Percentage(50),
      });
      expect(assessment._tag).toBe('OnTrack');
      expect(assessment.remaining).toBe(3600000);
    });

    it('creates Completed variant', () => {
      const assessment = CycleProgressAssessment.Completed({
        totalDuration: Duration(86400000),
      });
      expect(assessment._tag).toBe('Completed');
    });
  });

  describe('$is type guard', () => {
    it('returns true for matching variant', () => {
      const assessment = CycleProgressAssessment.OnTrack({
        remaining: Duration(1000),
        progress: Percentage(10),
      });
      expect($is('OnTrack')(assessment)).toBe(true);
      expect($is('Overdue')(assessment)).toBe(false);
    });
  });

  describe('$match exhaustive', () => {
    it('matches OnTrack', () => {
      const assessment = CycleProgressAssessment.OnTrack({
        remaining: Duration(1000),
        progress: Percentage(50),
      });

      const result = $match(assessment, {
        OnTrack: ({ progress }) => `${progress}% complete`,
        Overdue: ({ overdue }) => `Overdue by ${overdue}ms`,
        Completed: () => 'Done!',
      });

      expect(result).toBe('50% complete');
    });

    it('matches all variants', () => {
      const variants = [
        CycleProgressAssessment.OnTrack({
          remaining: Duration(1000),
          progress: Percentage(50),
        }),
        CycleProgressAssessment.Overdue({
          overdue: Duration(500),
          progress: Percentage(110),
        }),
        CycleProgressAssessment.Completed({ totalDuration: Duration(10000) }),
      ];

      const messages = variants.map((v) =>
        $match(v, {
          OnTrack: () => 'on-track',
          Overdue: () => 'overdue',
          Completed: () => 'completed',
        }),
      );

      expect(messages).toEqual(['on-track', 'overdue', 'completed']);
    });
  });
});
```

## Refactoring from Optional Fields

When you see optional fields that depend on state, refactor to TaggedEnum:

```typescript
// ❌ Before: Optional fields that depend on status
class Task {
  status: 'pending' | 'completed';
  completedBy?: User;
  completedAt?: Date;
}

// ✅ After: Each variant has exactly what it needs
type Task = Data.TaggedEnum<{
  Pending: { readonly title: string; readonly assignee: User };
  Completed: {
    readonly title: string;
    readonly assignee: User;
    readonly completedBy: User;
    readonly completedAt: Date;
  };
}>;
```

## When NOT to Use TaggedEnum

- All variants have identical metadata structure → use `S.Literal` + array
- It's a simple status without associated data → use `S.Literal`
- States can overlap → rethink the model

## References

- functional-domain-modeling.md#731-833 (Data.TaggedEnum)
- functional-domain-modeling.md#869-1010 (Reifying Decisions)
- functional-domain-modeling.md#1408-1461 (When to Use What)
