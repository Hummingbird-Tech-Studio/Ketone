---
name: dm-create-domain-service
description: Create a domain service using Effect.Service with dependency injection. Use for business logic operations.
model: opus
---

# Create Domain Service

Creates a domain service using Effect.Service with dependency injection, pure and effectful methods.

## Usage

```
/create-domain-service <ServiceName> --methods <method1,method2,...> [--dependencies <Dep1,Dep2,...>]
```

## Arguments

- `ServiceName`: The service name in PascalCase (e.g., `CycleService`)
- `--methods`: Comma-separated method names
- `--dependencies`: Optional comma-separated service dependencies

## When to Use

Create domain services when:

- Business logic operates on domain types
- Logic needs dependencies (DateTime, other services, repositories)
- Operations need to be composed with Effect
- You want to separate stateless logic from entities

## Scope Boundary

Domain services contain ONLY pure business logic operating on domain types.
Functions producing user-facing strings belong in `utils/{feature}-formatting.ts`.

**Diagnostic**: If a function's return type is `string` and that string is meant for UI display (toast, label, confirmation dialog), it belongs in `utils/`.

## Web FC-Only Services vs Full Domain Services

Not all domain services need an `Effect.Service` wrapper. Use this decision rule:

| Service consumed by…                | Pattern                        | Effect.Service?   |
| ----------------------------------- | ------------------------------ | ----------------- |
| Composable computeds / actor guards | Standalone pure functions only | No                |
| Effect pipelines / API client services | Standalone + Effect.Service    | Yes (dual export) |

**FC-only service** — No consumers use Effect DI. Only standalone pure function exports.
Doc header says "exported as standalone functions" (no mention of Effect.Service).

**Full domain service** — Has Effect DI consumers. Dual export: standalone + Effect.Service.
Doc header says "exported both as standalone functions… and wrapped in Effect.Service below."

### FC-only doc header template

```
 * Exported as standalone pure functions for direct use in web shell
 * (actor guards, composable computeds) and unit testing.
```

### Full domain service doc header template

```
 * Exported both as standalone functions (for web shell consumers) and
 * wrapped in the {ServiceName} Effect.Service below (for Effect DI consumers).
```

```typescript
// ✅ BELONGS in domain service: pure business rule
export const isAtTemplateLimit = (count: number): boolean =>
  count >= MAX_CUSTOM_TEMPLATES;

// ✅ BELONGS in domain service: decision ADT
export const decidePlanCreation = (input: CreatePlanInput): PlanCreationDecision => { ... };

// ❌ Does NOT belong in domain service — move to utils/{feature}-formatting.ts:
// formatPeriodCountLabel(count)    → produces "1 period" / "5 periods" (presentation)
// buildDeleteConfirmMessage(name)  → produces confirmation dialog text (presentation)
// sortTemplatesByRecency(templates) → sorts for display order (presentation)
// formatLimitReachedMessage(max)   → produces toast text (presentation)
```

## Output

### Full Domain Service

```typescript
// services/cycle.service.ts
import { Effect, DateTime, Option } from 'effect';
import { Cycle, CycleProgressAssessment, CycleId } from '../cycle.model.js';
import { CreateCycleInput, CycleToCreate, CycleUpdateDecision } from '../contracts/index.js';
import { CycleValidationService } from './cycle.validation.service.js';
import { CycleNotFoundError, CycleNotInProgressError } from '../errors.js';
import { Duration, Percentage } from '../../shared/quantities.js';

/**
 * ICycleService
 *
 * Interface for cycle domain operations.
 * Documents the service contract.
 */
export interface ICycleService {
  /**
   * Calculate elapsed time for a cycle.
   * Effectful: depends on DateTime.
   */
  elapsedMs(cycle: Cycle): Effect.Effect<Duration>;

  /**
   * Check if a cycle can be completed.
   * Pure: no dependencies.
   */
  canComplete(cycle: Cycle): boolean;

  /**
   * Assess the progress of a cycle.
   * Effectful: depends on DateTime.
   */
  assessProgress(cycle: Cycle): Effect.Effect<CycleProgressAssessment>;

  /**
   * Create a new cycle (use case).
   * Returns data to persist, not the persisted entity.
   */
  createCycle(input: CreateCycleInput): Effect.Effect<CycleToCreate, InvalidDateRangeError | CycleOverlapError>;
}

/**
 * CycleService
 *
 * Domain service for cycle operations.
 */
export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    // Inject dependencies
    const validationService = yield* CycleValidationService;

    return {
      // ================================================================
      // Pure methods (no dependencies)
      // ================================================================

      canComplete: (cycle: Cycle): boolean => cycle.status === 'InProgress',

      // ================================================================
      // Effectful methods (depend on DateTime or other services)
      // ================================================================

      elapsedMs: (cycle: Cycle) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          return Duration(Math.max(0, now.getTime() - cycle.startDate.getTime()));
        }),

      assessProgress: (cycle: Cycle) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;

          // Completed cycles
          if (cycle.status === 'Completed') {
            const totalDuration = Duration(cycle.endDate.getTime() - cycle.startDate.getTime());
            return CycleProgressAssessment.Completed({ totalDuration });
          }

          const elapsed = now.getTime() - cycle.startDate.getTime();
          const target = cycle.endDate.getTime() - cycle.startDate.getTime();
          const progress = Percentage(Math.min(100, (elapsed / target) * 100));

          // Overdue
          if (now > cycle.endDate) {
            const overdue = Duration(now.getTime() - cycle.endDate.getTime());
            return CycleProgressAssessment.Overdue({ overdue, progress });
          }

          // On track
          const remaining = Duration(cycle.endDate.getTime() - now.getTime());
          return CycleProgressAssessment.OnTrack({ remaining, progress });
        }),

      // ================================================================
      // Use case methods
      // ================================================================

      createCycle: (input: CreateCycleInput) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;

          // Run validations
          yield* validationService.validateDateRange(input.startDate, input.endDate);
          yield* validationService.validateNoOverlap(input.existingActiveCycle, input.startDate);

          // Return data to persist
          return {
            userId: input.userId,
            startDate: input.startDate,
            endDate: input.endDate,
          } satisfies CycleToCreate;
        }),
    } satisfies ICycleService;
  }),
  dependencies: [CycleValidationService.Default],
  accessors: true,
}) {}
```

### Service with Multiple Dependencies

```typescript
// services/billing.service.ts
import { Effect, DateTime } from 'effect';
import { Invoice } from '../invoice.model.js';
import { BillingDecision, ProcessBillingInput } from '../contracts/index.js';
import { CustomerService } from '../../customer/services/customer.service.js';
import { FeeCalculationService } from './fee-calculation.service.js';
import { BillingValidationService } from './billing.validation.service.js';

export class BillingService extends Effect.Service<BillingService>()('BillingService', {
  effect: Effect.gen(function* () {
    const customerService = yield* CustomerService;
    const feeCalculation = yield* FeeCalculationService;
    const validationService = yield* BillingValidationService;

    return {
      processBilling: (input: ProcessBillingInput) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;

          // Collect customer data (Three Phases: Collection)
          const customer = yield* customerService.findById(input.customerId);

          // Calculate decisions (Three Phases: Logic)
          const decisions = input.invoices.map((invoice) =>
            decideBillingAction(invoice, customer, input.feeRules, now),
          );

          return { decisions, processedAt: now };
        }),
    };
  }),
  dependencies: [CustomerService.Default, FeeCalculationService.Default, BillingValidationService.Default],
  accessors: true,
}) {}

// Pure function for decision logic (no I/O)
const decideBillingAction = (invoice: Invoice, customer: Customer, rules: FeeRules, now: Date): BillingDecision => {
  const daysOverdue = daysBetween(invoice.dueDate, now);

  if (daysOverdue <= 0) {
    return BillingDecision.NoAction({
      invoiceId: invoice.id,
      reason: 'Not yet due',
    });
  }

  if (daysOverdue > rules.lateFeeThresholdDays) {
    const feeAmount = invoice.amount.multiply(rules.lateFeeRate);
    return BillingDecision.ApplyLateFee({
      invoiceId: invoice.id,
      feeAmount,
    });
  }

  return BillingDecision.SendReminder({ invoiceId: invoice.id });
};
```

## Time Access — No `new Date()`

Shell code that needs the current time MUST use `DateTime.nowAsDate` from Effect, never `new Date()`.
`new Date()` is an implicit side effect that makes the code non-deterministic and untestable
(cannot be controlled with `TestClock` in tests).

```typescript
// ✅ CORRECT: Use DateTime (injectable, testable)
const now = yield * DateTime.nowAsDate;

// ❌ WRONG: Implicit side effect (untestable)
const now = new Date();
```

**Rule**: Core (pure) functions receive `now: Date` as a parameter — they never access the clock directly.
Only Shell code (Effect.Service `effect` generators, application services) should yield `DateTime.nowAsDate`.

## Pure vs Effectful Methods

Services can have both pure and effectful methods:

```typescript
return {
  // Pure: no dependencies, instant result, synchronous
  canComplete: (cycle: Cycle): boolean => cycle.status === 'InProgress',

  isOverdue: (cycle: Cycle, now: Date): boolean => cycle.status === 'InProgress' && now > cycle.endDate,

  // Effectful: depends on DateTime or services
  elapsedMs: (cycle: Cycle): Effect.Effect<Duration> =>
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate;
      return Duration(Math.max(0, now.getTime() - cycle.startDate.getTime()));
    }),

  // Effectful: may fail with domain error
  createCycle: (input: CreateCycleInput): Effect.Effect<CycleToCreate, DomainError> =>
    Effect.gen(function* () {
      yield* validationService.validateDateRange(input.startDate, input.endDate);
      return {
        /* ... */
      };
    }),
} satisfies ICycleService;
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either, TestClock, Option } from 'effect';
import { CycleService } from './cycle.service.js';
import { CycleValidationService } from './cycle.validation.service.js';
import { Cycle } from '../cycle.model.js';

describe('CycleService', () => {
  // Helper to run effects with service layer
  const runEffect = <E, A>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(effect.pipe(Effect.provide(CycleService.Default), Effect.either));

  describe('canComplete (pure)', () => {
    it('returns true for InProgress cycle', () => {
      const cycle = new Cycle({
        id: 'cycle-123' as CycleId,
        userId: 'user-123' as UserId,
        status: 'InProgress',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-02'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Pure method can be called directly
      expect(CycleService.canComplete(cycle)).toBe(true);
    });

    it('returns false for Completed cycle', () => {
      const cycle = new Cycle({
        /* ... status: 'Completed' ... */
      });

      expect(CycleService.canComplete(cycle)).toBe(false);
    });
  });

  describe('elapsedMs (effectful)', () => {
    it('calculates elapsed time correctly', async () => {
      const program = Effect.gen(function* () {
        // Set clock to specific time
        yield* TestClock.setTime(86400000); // 1 day in ms

        const cycle = new Cycle({
          id: 'cycle-123' as CycleId,
          userId: 'user-123' as UserId,
          status: 'InProgress',
          startDate: new Date(0), // Epoch
          endDate: new Date(172800000), // 2 days
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return yield* CycleService.elapsedMs(cycle);
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(CycleService.Default), Effect.provide(TestClock.layer)),
      );

      expect(result).toBe(86400000); // 1 day elapsed
    });
  });

  describe('createCycle (use case)', () => {
    it('succeeds with valid input', async () => {
      const result = await runEffect(
        CycleService.createCycle({
          userId: 'user-123' as UserId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-02'),
          existingActiveCycle: Option.none(),
          lastCompletedCycle: Option.none(),
        }),
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.userId).toBe('user-123');
      }
    });

    it('fails with invalid date range', async () => {
      const result = await runEffect(
        CycleService.createCycle({
          userId: 'user-123' as UserId,
          startDate: new Date('2025-01-02'), // After end
          endDate: new Date('2025-01-01'),
          existingActiveCycle: Option.none(),
          lastCompletedCycle: Option.none(),
        }),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe('InvalidDateRangeError');
      }
    });
  });
});
```

## Using `accessors: true`

With `accessors: true`, you can call methods directly on the service class:

```typescript
// Without accessors - must yield the service first
const result =
  yield *
  Effect.gen(function* () {
    const service = yield* CycleService;
    return service.elapsedMs(cycle);
  });

// With accessors - call directly (uses Effect.andThen internally)
const result = yield * CycleService.elapsedMs(cycle);

// Pure methods work too
const canComplete = CycleService.canComplete(cycle);
```

## File Organization

```
{module}/
├── services/
│   ├── {module}.service.ts              # Main domain service
│   ├── {module}.validation.service.ts   # Validation rules
│   └── index.ts                         # Barrel exports
```

## References

- [guide.md](guide.md) — Extended guide: determinism principle, shell/core coordination, architectural seams, cohesion & Orphan Test, type classification
