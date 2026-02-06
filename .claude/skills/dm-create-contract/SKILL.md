---
name: dm-create-contract
description: Create use-case contracts with inputs/outputs and optional decision ADTs. Use for defining operation interfaces.
model: opus
---

# Create Contract

Creates use-case contracts (inputs and outputs) with optional decision ADTs for reified decisions.

## Usage

```
/create-contract <ContractName> --input <field1:type1,...> [--output <OutputType>] [--decision <Variant1:fields|Variant2:fields>]
```

## Arguments

- `ContractName`: The contract name in PascalCase (e.g., `CreateCycle`, `UpdateCycleDates`)
- `--input`: Comma-separated input field definitions
- `--output`: Optional simple output type
- `--decision`: Optional decision ADT variants for reified decisions

## When to Use

Create contracts when:

- Defining the interface for a use case
- Separating "what enters" from "what exits" a use case
- Reifying decisions as data (multiple successful outcomes)
- The operation needs explicit input/output types

## Domain Model vs Operation Contract

| Concept                | Lives in            | Description                            | Changes when...                   |
| ---------------------- | ------------------- | -------------------------------------- | --------------------------------- |
| **Domain Model**       | `{module}.model.ts` | Things that _exist_ in the domain      | The domain concept itself changes |
| **Operation Contract** | `contracts/`        | Things that _enter or exit_ a use case | The operation's interface changes |

**The litmus test:** If adding a new variant to the output wouldn't require changing the main entity, it's a contract, not part of the model.

## Output

### Simple Contract (Input + Output)

```typescript
// contracts/create-cycle.ts
import { Schema as S } from 'effect';
import { Cycle } from '../cycle.model.js';
import { UserId } from '../../shared/ids.js';

/**
 * CreateCycleInput
 *
 * Data required to execute the create cycle use case.
 */
export const CreateCycleInput = S.Struct({
  userId: UserId,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  existingActiveCycle: S.OptionFromSelf(Cycle),
  lastCompletedCycle: S.OptionFromSelf(Cycle),
});
export type CreateCycleInput = S.Schema.Type<typeof CreateCycleInput>;

/**
 * CycleToCreate
 *
 * Data produced by the create cycle use case (to be persisted).
 */
export const CycleToCreate = S.Struct({
  userId: UserId,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
});
export type CycleToCreate = S.Schema.Type<typeof CycleToCreate>;
```

### Contract with Decision ADT

```typescript
// contracts/update-cycle-dates.ts
import { Data, Schema as S } from 'effect';
import { Cycle, CycleId } from '../cycle.model.js';
import { UserId } from '../../shared/ids.js';

/**
 * UpdateCycleDatesInput
 *
 * Data required to execute the update cycle dates use case.
 */
export const UpdateCycleDatesInput = S.Struct({
  userId: UserId,
  cycle: S.OptionFromSelf(Cycle),
  startDate: S.optional(S.DateFromSelf),
  endDate: S.optional(S.DateFromSelf),
  lastCompletedCycle: S.OptionFromSelf(Cycle),
});
export type UpdateCycleDatesInput = S.Schema.Type<typeof UpdateCycleDatesInput>;

/**
 * CycleUpdateDecision
 *
 * Reified decision from the update cycle dates use case.
 * The domain service decides WHAT to do, the shell decides HOW.
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
export const { $is: isUpdateDecision, $match: matchUpdateDecision } = CycleUpdateDecision;
```

### Contract with Complex Decision

```typescript
// contracts/process-billing.ts
import { Data, Schema as S } from 'effect';
import { Invoice, InvoiceId } from '../invoice.model.js';
import { CustomerId } from '../../shared/ids.js';
import { Money } from '../../shared/money.js';

/**
 * ProcessBillingInput
 */
export const ProcessBillingInput = S.Struct({
  customerId: CustomerId,
  invoices: S.Array(Invoice),
  currentDate: S.DateFromSelf,
  feeRules: FeeRulesSchema,
});
export type ProcessBillingInput = S.Schema.Type<typeof ProcessBillingInput>;

/**
 * BillingDecision
 *
 * Reified decision - separates "what to do" from "how to do it".
 */
export type BillingDecision = Data.TaggedEnum<{
  ApplyLateFee: {
    readonly invoiceId: InvoiceId;
    readonly feeAmount: Money;
  };
  SendReminder: {
    readonly invoiceId: InvoiceId;
  };
  NoAction: {
    readonly invoiceId: InvoiceId;
    readonly reason: string;
  };
}>;

export const BillingDecision = Data.taggedEnum<BillingDecision>();
export const { $is: isBillingDecision, $match: matchBillingDecision } = BillingDecision;

/**
 * ProcessBillingOutput
 *
 * Collection of decisions for all invoices.
 */
export const ProcessBillingOutput = S.Struct({
  decisions: S.Array(BillingDecisionSchema),
  processedAt: S.DateFromSelf,
});
export type ProcessBillingOutput = S.Schema.Type<typeof ProcessBillingOutput>;
```

## Reifying Decisions Pattern

When to reify (convert to data):

- Complex `if/else` chains that mix logic with side effects
- Business rules that need to be auditable
- Decisions that might need to be logged or replayed
- Multiple successful paths (not just success/failure)

When NOT to reify:

- Guard clauses that fail with an error (error IS the reified decision)
- Conditional validations that don't produce multiple outcomes
- No boundary crossing and no need for audit/replay

```typescript
// In domain service
const decideCycleUpdate = (input: UpdateCycleDatesInput): Effect.Effect<CycleUpdateDecision, ...> =>
  Effect.gen(function* () {
    // Guard clause → if + Effect.fail (error IS reified)
    if (Option.isNone(input.cycle)) {
      return yield* Effect.fail(new CycleNotFoundError({ ... }));
    }

    // Multiple successful outcomes → ADT (shell must interpret)
    if (input.startDate === undefined && input.endDate === undefined) {
      return CycleUpdateDecision.NoChanges({ cycleId: input.cycle.value.id });
    }

    return CycleUpdateDecision.Update({
      cycleId: input.cycle.value.id,
      startDate: input.startDate ?? input.cycle.value.startDate,
      endDate: input.endDate ?? input.cycle.value.endDate,
    });
  });
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Option } from 'effect';
import {
  CreateCycleInput,
  CycleToCreate,
  UpdateCycleDatesInput,
  CycleUpdateDecision,
  matchUpdateDecision,
} from './contracts/index.js';

describe('CreateCycle Contract', () => {
  it('input contains all required fields', () => {
    const input: CreateCycleInput = {
      userId: 'user-123' as UserId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
      existingActiveCycle: Option.none(),
      lastCompletedCycle: Option.none(),
    };
    expect(input.userId).toBeDefined();
  });

  it('output contains fields to persist', () => {
    const output: CycleToCreate = {
      userId: 'user-123' as UserId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
    };
    expect(output.userId).toBeDefined();
  });
});

describe('CycleUpdateDecision', () => {
  it('NoChanges contains cycleId', () => {
    const decision = CycleUpdateDecision.NoChanges({
      cycleId: 'cycle-123' as CycleId,
    });
    expect(decision._tag).toBe('NoChanges');
    expect(decision.cycleId).toBe('cycle-123');
  });

  it('Update contains new dates', () => {
    const decision = CycleUpdateDecision.Update({
      cycleId: 'cycle-123' as CycleId,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-01-02'),
    });
    expect(decision._tag).toBe('Update');
  });

  it('matchUpdateDecision is exhaustive', () => {
    const decisions = [
      CycleUpdateDecision.NoChanges({ cycleId: 'c1' as CycleId }),
      CycleUpdateDecision.Update({
        cycleId: 'c2' as CycleId,
        startDate: new Date(),
        endDate: new Date(),
      }),
    ];

    const messages = decisions.map((d) =>
      matchUpdateDecision(d, {
        NoChanges: ({ cycleId }) => `No changes for ${cycleId}`,
        Update: ({ cycleId }) => `Updating ${cycleId}`,
      }),
    );

    expect(messages).toEqual(['No changes for c1', 'Updating c2']);
  });
});
```

## File Organization

```
{module}/
├── contracts/
│   ├── create-{module}.ts    # Create use case input/output
│   ├── update-{module}.ts    # Update use case input/decision
│   └── index.ts              # Barrel exports
```

## References

- functional-domain-modeling.md#1920-2170 (Domain Model vs Operation Contracts)
- functional-domain-modeling.md#869-1010 (Reifying Decisions)
- functional-domain-modeling.md#2121-2170 (Contract file examples)
