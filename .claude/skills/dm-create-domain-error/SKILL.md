---
name: dm-create-domain-error
description: Create a domain error using Data.TaggedError. Use for business rule violations.
model: opus
---

# Create Domain Error

Creates a domain error using `Data.TaggedError` with contextual fields.

## Usage

```
/create-domain-error <ErrorName> --fields <field1:type1,field2:type2,...>
```

## Arguments

- `ErrorName`: The name in PascalCase, should end with `Error` (e.g., `CycleNotFoundError`, `InvalidDateRangeError`)
- `--fields`: Comma-separated contextual field definitions

## When to Use

Use domain errors when:

- A business rule is violated
- An expected error condition occurs (not found, already exists, invalid state)
- You need to communicate why an operation failed
- The error needs contextual information for debugging/handling

## Output

### Basic Domain Error

```typescript
import { Data } from 'effect';
import { CycleId, UserId } from '../shared/ids.js';

/**
 * CycleNotFoundError
 *
 * Thrown when attempting to access a cycle that doesn't exist
 * or doesn't belong to the requesting user.
 */
export class CycleNotFoundError extends Data.TaggedError('CycleNotFoundError')<{
  readonly cycleId: CycleId;
  readonly userId: UserId;
}> {}

// Usage:
// Effect.fail(new CycleNotFoundError({ cycleId, userId }))
```

### Validation Error

```typescript
import { Data } from 'effect';

/**
 * InvalidDateRangeError
 *
 * Thrown when a date range is invalid (e.g., end before start).
 */
export class InvalidDateRangeError extends Data.TaggedError('InvalidDateRangeError')<{
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason: string;
}> {}
```

### Business Rule Error

```typescript
import { Data } from 'effect';
import { CycleId } from './cycle.model.js';

/**
 * CycleOverlapError
 *
 * Thrown when attempting to create a cycle that overlaps
 * with an existing active cycle.
 */
export class CycleOverlapError extends Data.TaggedError('CycleOverlapError')<{
  readonly existingCycleId: CycleId;
  readonly existingEndDate: Date;
  readonly requestedStartDate: Date;
}> {}
```

### State Transition Error

```typescript
import { Data } from 'effect';
import { CycleId, CycleStatus } from './cycle.model.js';

/**
 * InvalidCycleTransitionError
 *
 * Thrown when attempting an invalid state transition.
 */
export class InvalidCycleTransitionError extends Data.TaggedError('InvalidCycleTransitionError')<{
  readonly cycleId: CycleId;
  readonly currentStatus: CycleStatus;
  readonly attemptedStatus: CycleStatus;
}> {}
```

## Organizing Errors

All domain errors for a module should live in `{module}/errors.ts`:

```typescript
// cycle/errors.ts
import { Data } from 'effect';
import { CycleId, UserId } from '../shared/ids.js';

export class CycleNotFoundError extends Data.TaggedError('CycleNotFoundError')<{
  readonly cycleId: CycleId;
  readonly userId: UserId;
}> {}

export class CycleOverlapError extends Data.TaggedError('CycleOverlapError')<{
  readonly existingCycleId: CycleId;
  readonly existingEndDate: Date;
  readonly requestedStartDate: Date;
}> {}

export class InvalidDateRangeError extends Data.TaggedError('InvalidDateRangeError')<{
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason: string;
}> {}

export class FutureStartDateError extends Data.TaggedError('FutureStartDateError')<{
  readonly startDate: Date;
  readonly now: Date;
}> {}

export class CycleNotInProgressError extends Data.TaggedError('CycleNotInProgressError')<{
  readonly cycleId: CycleId;
  readonly currentStatus: string;
}> {}
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import { CycleNotFoundError, InvalidDateRangeError } from './errors.js';

describe('Domain Errors', () => {
  describe('CycleNotFoundError', () => {
    it('has correct tag', () => {
      const error = new CycleNotFoundError({
        cycleId: 'cycle-123' as CycleId,
        userId: 'user-456' as UserId,
      });
      expect(error._tag).toBe('CycleNotFoundError');
    });

    it('contains contextual fields', () => {
      const error = new CycleNotFoundError({
        cycleId: 'cycle-123' as CycleId,
        userId: 'user-456' as UserId,
      });
      expect(error.cycleId).toBe('cycle-123');
      expect(error.userId).toBe('user-456');
    });

    it('can be caught with catchTag', async () => {
      const program = Effect.fail(
        new CycleNotFoundError({
          cycleId: 'cycle-123' as CycleId,
          userId: 'user-456' as UserId,
        }),
      ).pipe(Effect.catchTag('CycleNotFoundError', (e) => Effect.succeed(`Not found: ${e.cycleId}`)));

      const result = await Effect.runPromise(program);
      expect(result).toBe('Not found: cycle-123');
    });
  });

  describe('InvalidDateRangeError', () => {
    it('includes reason message', () => {
      const error = new InvalidDateRangeError({
        startDate: new Date('2025-01-02'),
        endDate: new Date('2025-01-01'),
        reason: 'End date must be after start date',
      });
      expect(error.reason).toBe('End date must be after start date');
    });
  });
});
```

## Using Errors in Services

```typescript
// In validation service
validateDateRange: (start: Date, end: Date) =>
  start < end
    ? Effect.void
    : Effect.fail(new InvalidDateRangeError({
        startDate: start,
        endDate: end,
        reason: 'End date must be after start date',
      })),

// In domain service
findCycle: (cycleId: CycleId, userId: UserId) =>
  Effect.gen(function* () {
    const cycle = yield* repository.findById(cycleId);
    if (Option.isNone(cycle) || cycle.value.userId !== userId) {
      return yield* Effect.fail(new CycleNotFoundError({ cycleId, userId }));
    }
    return cycle.value;
  }),
```

## Handling Errors in Handlers

```typescript
// In API handler
yield *
  service.createCycle(input).pipe(
    Effect.catchTags({
      CycleOverlapError: (e) =>
        Effect.fail(
          new CycleOverlapErrorSchema({
            message: `Cycle overlaps with existing cycle ending ${e.existingEndDate}`,
          }),
        ),
      InvalidDateRangeError: (e) =>
        Effect.fail(
          new ValidationErrorSchema({
            message: e.reason,
          }),
        ),
    }),
  );
```

## Naming Conventions

| Pattern                      | Example                   | Use Case                  |
| ---------------------------- | ------------------------- | ------------------------- |
| `{Entity}NotFoundError`      | `CycleNotFoundError`      | Entity doesn't exist      |
| `{Entity}AlreadyExistsError` | `UserAlreadyExistsError`  | Duplicate entity          |
| `Invalid{Concept}Error`      | `InvalidDateRangeError`   | Validation failure        |
| `{Entity}{Action}Error`      | `CycleOverlapError`       | Business rule violation   |
| `{Entity}Not{State}Error`    | `CycleNotInProgressError` | Wrong state for operation |

## References

- functional-domain-modeling.md#2044-2051 (Type Classification - Domain Error)
- functional-domain-modeling.md#2002-2005 (Domain errors live with their module)
