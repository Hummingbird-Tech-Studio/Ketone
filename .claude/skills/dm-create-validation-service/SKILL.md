---
name: dm-create-validation-service
description: Create a validation service using Effect.Service with Effect<void, DomainError> methods.
model: opus
---

# Create Validation Service

Creates a validation service using Effect.Service with `Effect<void, DomainError>` methods.

## Usage

```
/create-validation-service <ServiceName> --methods <method1,method2,...>
```

## Arguments

- `ServiceName`: The service name in PascalCase (e.g., `CycleValidationService`)
- `--methods`: Comma-separated validation method names

## When to Use

Create validation services when:

- Multiple validation rules apply to a domain concept
- Validations need to be composed or reused
- Validation logic depends on external services (Clock, other services)
- You want consistent validation across use cases

## Output

### Validation Service Implementation

```typescript
// services/cycle.validation.service.ts
import { Effect } from 'effect';
import { Option } from 'effect';
import { Cycle } from '../cycle.model.js';
import { InvalidDateRangeError, CycleOverlapError, FutureStartDateError } from '../errors.js';

/**
 * ICycleValidationService
 *
 * Interface for cycle validation rules.
 * Methods return Effect<void, DomainError> for validation-only operations.
 */
export interface ICycleValidationService {
  /**
   * Validates that end date is after start date.
   */
  validateDateRange(start: Date, end: Date): Effect.Effect<void, InvalidDateRangeError>;

  /**
   * Validates that new cycle doesn't overlap with existing active cycle.
   */
  validateNoOverlap(existingCycle: Option.Option<Cycle>, newStartDate: Date): Effect.Effect<void, CycleOverlapError>;

  /**
   * Validates that start date is not in the future.
   */
  validateStartDateNotFuture(startDate: Date, now: Date): Effect.Effect<void, FutureStartDateError>;
}

/**
 * CycleValidationService
 *
 * Domain validation rules for cycles.
 * Lives with the cycle module (cohesion principle).
 */
export class CycleValidationService extends Effect.Service<CycleValidationService>()('CycleValidationService', {
  effect: Effect.gen(function* () {
    return {
      validateDateRange: (start: Date, end: Date) =>
        start.getTime() < end.getTime()
          ? Effect.void
          : Effect.fail(
              new InvalidDateRangeError({
                startDate: start,
                endDate: end,
                reason: 'End date must be after start date',
              }),
            ),

      validateNoOverlap: (existingCycle: Option.Option<Cycle>, newStartDate: Date) =>
        Option.match(existingCycle, {
          onNone: () => Effect.void,
          onSome: (cycle) =>
            newStartDate.getTime() >= cycle.endDate.getTime()
              ? Effect.void
              : Effect.fail(
                  new CycleOverlapError({
                    existingCycleId: cycle.id,
                    existingEndDate: cycle.endDate,
                    requestedStartDate: newStartDate,
                  }),
                ),
        }),

      validateStartDateNotFuture: (startDate: Date, now: Date) =>
        startDate.getTime() <= now.getTime()
          ? Effect.void
          : Effect.fail(
              new FutureStartDateError({
                startDate,
                now,
              }),
            ),
    } satisfies ICycleValidationService;
  }),
  dependencies: [],
  accessors: true,
}) {}
```

### Validation Service with Dependencies

```typescript
// services/order.validation.service.ts
import { Effect, Clock, Option } from 'effect';
import { Order } from '../order.model.js';
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { InsufficientInventoryError, OrderExpiredError, InvalidOrderStateError } from '../errors.js';

export interface IOrderValidationService {
  validateInventoryAvailable(order: Order): Effect.Effect<void, InsufficientInventoryError>;
  validateNotExpired(order: Order): Effect.Effect<void, OrderExpiredError>;
  validateCanBeCancelled(order: Order): Effect.Effect<void, InvalidOrderStateError>;
}

export class OrderValidationService extends Effect.Service<OrderValidationService>()('OrderValidationService', {
  effect: Effect.gen(function* () {
    const inventoryService = yield* InventoryService;

    return {
      validateInventoryAvailable: (order: Order) =>
        Effect.gen(function* () {
          const available = yield* inventoryService.checkAvailability(order.items);
          if (!available) {
            return yield* Effect.fail(
              new InsufficientInventoryError({
                orderId: order.id,
                items: order.items,
              }),
            );
          }
        }),

      validateNotExpired: (order: Order) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          if (order.expiresAt.getTime() < now.getTime()) {
            return yield* Effect.fail(
              new OrderExpiredError({
                orderId: order.id,
                expiredAt: order.expiresAt,
              }),
            );
          }
        }),

      validateCanBeCancelled: (order: Order) =>
        order.status === 'Pending' || order.status === 'Processing'
          ? Effect.void
          : Effect.fail(
              new InvalidOrderStateError({
                orderId: order.id,
                currentState: order.status,
                requiredStates: ['Pending', 'Processing'],
              }),
            ),
    } satisfies IOrderValidationService;
  }),
  dependencies: [InventoryService.Default],
  accessors: true,
}) {}
```

## Using Validation Services

### In Domain Services

```typescript
// In cycle.service.ts
export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const validationService = yield* CycleValidationService;

    return {
      createCycle: (input: CreateCycleInput) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;

          // Run validations
          yield* validationService.validateDateRange(input.startDate, input.endDate);
          yield* validationService.validateNoOverlap(input.existingActiveCycle, input.startDate);
          yield* validationService.validateStartDateNotFuture(input.startDate, now);

          // Create cycle...
          return {
            userId: input.userId,
            startDate: input.startDate,
            endDate: input.endDate,
          };
        }),
    };
  }),
  dependencies: [CycleValidationService.Default],
  accessors: true,
}) {}
```

### Composing Multiple Validations

```typescript
// Run all validations, fail on first error
yield *
  Effect.all([
    validationService.validateDateRange(start, end),
    validationService.validateNoOverlap(existing, start),
    validationService.validateStartDateNotFuture(start, now),
  ]);

// Or with explicit sequencing
yield * validationService.validateDateRange(start, end);
yield * validationService.validateNoOverlap(existing, start);
yield * validationService.validateStartDateNotFuture(start, now);
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either, Option } from 'effect';
import { CycleValidationService } from './cycle.validation.service.js';
import { Cycle } from '../cycle.model.js';

describe('CycleValidationService', () => {
  const runValidation = <E, A>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(effect.pipe(Effect.provide(CycleValidationService.Default), Effect.either));

  describe('validateDateRange', () => {
    it('succeeds when end is after start', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-02');

      const result = await runValidation(CycleValidationService.validateDateRange(start, end));

      expect(Either.isRight(result)).toBe(true);
    });

    it('fails when end is before start', async () => {
      const start = new Date('2025-01-02');
      const end = new Date('2025-01-01');

      const result = await runValidation(CycleValidationService.validateDateRange(start, end));

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe('InvalidDateRangeError');
      }
    });

    it('fails when dates are equal', async () => {
      const date = new Date('2025-01-01');

      const result = await runValidation(CycleValidationService.validateDateRange(date, date));

      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe('validateNoOverlap', () => {
    it('succeeds when no existing cycle', async () => {
      const result = await runValidation(
        CycleValidationService.validateNoOverlap(Option.none(), new Date('2025-01-01')),
      );

      expect(Either.isRight(result)).toBe(true);
    });

    it('succeeds when new start is after existing end', async () => {
      const existing = new Cycle({
        id: 'cycle-123' as CycleId,
        userId: 'user-123' as UserId,
        status: 'InProgress',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-10'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await runValidation(
        CycleValidationService.validateNoOverlap(
          Option.some(existing),
          new Date('2025-01-10'), // Same as end, should be OK
        ),
      );

      expect(Either.isRight(result)).toBe(true);
    });

    it('fails when dates overlap', async () => {
      const existing = new Cycle({
        id: 'cycle-123' as CycleId,
        userId: 'user-123' as UserId,
        status: 'InProgress',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-10'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await runValidation(
        CycleValidationService.validateNoOverlap(
          Option.some(existing),
          new Date('2025-01-05'), // Before end, overlaps
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe('CycleOverlapError');
        expect(result.left.existingCycleId).toBe('cycle-123');
      }
    });
  });
});
```

## Cohesion Principle

> Validation services live with their domain module.

```
✅ Cohesive:
src/
└── cycle/
    ├── cycle.model.ts
    ├── cycle.service.ts
    └── cycle.validation.service.ts   # Lives with its domain

❌ Scattered:
src/
├── validation/
│   └── cycle.validation.service.ts   # Orphaned from domain
└── cycle/
    └── cycle.service.ts
```

## Naming Conventions

| Pattern      | Example                        |
| ------------ | ------------------------------ |
| Service name | `{Module}ValidationService`    |
| Method name  | `validate{Rule}`               |
| Return type  | `Effect.Effect<void, {Error}>` |
