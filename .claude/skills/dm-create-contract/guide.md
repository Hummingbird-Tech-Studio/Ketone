# Create Contract — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide covers the philosophy of reifying decisions, the interpreter pattern, detailed criteria for when to reify vs when not to, and how contracts evolve over time.

---

## Reifying Decisions: The Full Picture

"Reify" means turning something abstract (a decision) into something concrete (data). In the context of contracts, this means the **output** of a use case is often a **decision ADT** rather than a simple value.

### Why Decisions Are Data

When a domain service makes a decision, the service should only decide — never act on that decision. The shell interprets the decision and acts.

```typescript
// ❌ Decision coupled to action inside the service
const processBilling = (invoice: Invoice) =>
  Effect.gen(function* () {
    if (invoice.isPastDue && invoice.amount > 1000) {
      yield* applyLateFee(invoice); // Side effect inside decision logic!
    } else if (invoice.isPastDue) {
      yield* sendReminder(invoice); // Side effect inside decision logic!
    }
  });

// ✅ Decision as data — service only decides
const decideBilling = (invoice: Invoice): BillingDecision => {
  if (invoice.isPastDue && invoice.amount > 1000) {
    return BillingDecision.ApplyLateFee({ invoice, feeAmount: invoice.amount * 0.05 });
  }
  if (invoice.isPastDue) {
    return BillingDecision.SendReminder({ invoice });
  }
  return BillingDecision.NoAction({ invoice });
};
```

---

## The Interpreter Pattern

Once a decision is data, you can write multiple **interpreters** — functions that act on the decision in different ways:

### Production Interpreter

```typescript
const executeBilling = BillingDecision.$match({
  ApplyLateFee: ({ invoice, feeAmount }) => applyLateFee(invoice, feeAmount),
  SendReminder: ({ invoice }) => sendReminder(invoice),
  NoAction: () => Effect.void,
});
```

### Audit/Logging Interpreter (Dry Run)

```typescript
const auditBilling = BillingDecision.$match({
  ApplyLateFee: ({ invoice, feeAmount }) => Effect.logInfo(`ApplyLateFee invoice=${invoice.id} fee=${feeAmount}`),
  SendReminder: ({ invoice }) => Effect.logInfo(`SendReminder invoice=${invoice.id}`),
  NoAction: ({ invoice }) => Effect.logInfo(`NoAction invoice=${invoice.id}`),
});
```

### Test Interpreter (Collecting Decisions)

```typescript
const collectDecisions = (decisions: BillingDecision[]): DecisionSummary => ({
  lateFees: decisions.filter(BillingDecision.$is('ApplyLateFee')).length,
  reminders: decisions.filter(BillingDecision.$is('SendReminder')).length,
  noAction: decisions.filter(BillingDecision.$is('NoAction')).length,
});
```

### Using Multiple Interpreters Together

```typescript
const decision = decideBilling(invoice);
yield * auditBilling(decision); // Always log the decision
yield * executeBilling(decision); // Then execute it
```

This enables:

- **Dry-run mode**: Log what would happen without side effects
- **Audit trails**: Record every decision for compliance
- **Testing**: Verify decisions without triggering real actions
- **Replay**: Re-execute historical decisions

---

## When to Reify (Detailed Criteria)

### Reify When:

1. **Complex `if/else` chains that mix logic with side effects**
   - The decision logic is testable separately from the effect execution

2. **Business rules that need to be auditable**
   - You need to log or store what was decided before acting

3. **Decisions that might need to be logged or replayed**
   - Compliance requirements, debugging needs

4. **Multiple successful paths (not just success/failure)**
   - The use case can succeed in different ways (Update vs NoChanges)
   - The shell needs to know WHICH kind of success to handle differently

5. **The decision crosses a boundary**
   - Domain service → application service → handler
   - Each layer might react differently to the decision

### Do NOT Reify When:

1. **Guard clauses that fail with an error**
   - The error IS already the reified decision (it's data in the error channel)

   ```typescript
   // ✅ Guard clause: error is the decision
   if (Option.isNone(input.cycle)) {
     return yield* Effect.fail(new CycleNotFoundError({ ... }));
   }
   ```

2. **Conditional validations that don't produce multiple outcomes**
   - There's only one successful path; failure is an error

   ```typescript
   // ✅ Conditional validation: single success path
   if (input.startDate !== undefined) {
     yield * validationService.validateStartDateNotFuture(finalStartDate);
   }
   ```

3. **No boundary crossing and no need for audit/replay**
   - The decision and action happen in the same place with no external visibility needed

### The Decision Matrix

| Scenario               | Technique                  | Why                           |
| ---------------------- | -------------------------- | ----------------------------- |
| Invalid input → fail   | `Effect.fail(TaggedError)` | Error IS the reified data     |
| One success path       | No ADT needed              | Just return the result        |
| Multiple success paths | Decision ADT               | Shell interprets each path    |
| Need audit trail       | Decision ADT               | Log/store before executing    |
| Boundary crossing      | Decision ADT               | Each layer reacts differently |

---

## Contract Evolution Path

Contracts evolve as requirements become clearer. Here's the typical progression:

### Stage 1: Simple Input/Output

The simplest contract — data goes in, data comes out:

```typescript
// contracts/create-cycle.ts
export const CreateCycleInput = S.Struct({
  userId: UserId,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  existingActiveCycle: S.OptionFromSelf(Cycle),
  lastCompletedCycle: S.OptionFromSelf(Cycle),
});
export type CreateCycleInput = S.Schema.Type<typeof CreateCycleInput>;

export const CycleToCreate = S.Struct({
  userId: UserId,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
});
export type CycleToCreate = S.Schema.Type<typeof CycleToCreate>;
```

### Stage 2: Add a Decision ADT

When the use case can succeed in multiple ways:

```typescript
// contracts/update-cycle-dates.ts

// Input stays the same pattern
export const UpdateCycleDatesInput = S.Struct({ ... });

// Output becomes a Decision ADT
export type CycleUpdateDecision = Data.TaggedEnum<{
  NoChanges: { readonly cycleId: CycleId };
  Update: {
    readonly cycleId: CycleId;
    readonly startDate: Date;
    readonly endDate: Date;
  };
}>;
```

### Stage 3: Complex Decision with Multiple Paths

When business rules produce several distinct outcomes:

```typescript
// contracts/process-billing.ts
export type BillingDecision = Data.TaggedEnum<{
  ApplyLateFee: { readonly invoiceId: InvoiceId; readonly feeAmount: Money };
  SendReminder: { readonly invoiceId: InvoiceId };
  NoAction: { readonly invoiceId: InvoiceId; readonly reason: string };
}>;
```

### How to Know When to Escalate

- **Stage 1 → Stage 2**: When you realize the shell needs to react differently to different success cases
- **Stage 2 → Stage 3**: When there are 3+ distinct successful outcomes, especially if they cross boundaries

---

## The Litmus Test (Expanded)

The SKILL.md says: "If adding a new variant to the output wouldn't require changing the main entity, it's a contract, not part of the model."

### More Examples

**Is `CancellationResult` a contract output or part of the model?**

- Question: "If I add a `CancellationResult.Rejected` variant, does the `Plan` entity need to change?"
- Answer: No — `Plan` doesn't know about cancellation outcomes.
- Conclusion: It's a **contract output** (lives in `contracts/plan-cancellation.ts`).

**Is `PlanStatus` a contract or part of the model?**

- Question: "If I add a `PlanStatus.Paused` variant, does the `Plan` entity need to change?"
- Answer: Yes — `Plan` has a `status` field that uses this enum.
- Conclusion: It's **part of the model** (lives in `plan.model.ts`).

**Is `PeriodPhase` a contract or part of the model?**

- Question: "Does `PeriodPhase` describe something that exists in the domain, or something that enters/exits a use case?"
- Answer: It describes what phase a period is in — an intrinsic property.
- Conclusion: It's **part of the model**.

### The Rule

| If it describes...                            | It lives in...      |
| --------------------------------------------- | ------------------- |
| Something that **exists** in the domain       | `{module}.model.ts` |
| Something that **enters or exits** a use case | `contracts/`        |
| A **decision** the domain service makes       | `contracts/`        |

---

## How Contracts Connect to Three Phases

Contracts define the interfaces between the Three Phases:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. COLLECTION  │ -> │    2. LOGIC     │ -> │  3. PERSISTENCE │
│   (The "How")   │    │   (The "What")  │    │  (The "Where")  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │
        ▼                      ▼                      ▼
  Collects data to       Takes ContractInput     Interprets the
  build ContractInput    Returns Decision ADT    Decision ADT
```

```typescript
// PHASE 1: Build the contract input
const input: UpdateCycleDatesInput = {
  userId: currentUser.userId,
  cycle: Option.fromNullable(activeCycle),
  startDate: payload.startDate,
  endDate: payload.endDate,
  lastCompletedCycle: Option.fromNullable(lastCompleted),
};

// PHASE 2: Domain service decides (pure)
const decision = yield * cycleService.updateDates(input);

// PHASE 3: Interpret the decision
yield *
  matchUpdateDecision(decision, {
    NoChanges: () => Effect.void,
    Update: ({ cycleId, startDate, endDate }) => repository.updateDates(cycleId, startDate, endDate),
  });
```

---

## Testing Contracts

Contracts enable focused testing at every level:

### Test the Decision Logic (Unit Test — No Mocks)

```typescript
describe('decideCycleUpdate', () => {
  it('returns NoChanges when no dates provided', () => {
    const input: UpdateCycleDatesInput = {
      userId: testUserId,
      cycle: Option.some(testCycle),
      startDate: undefined,
      endDate: undefined,
      lastCompletedCycle: Option.none(),
    };

    const decision = decideCycleUpdate(input);
    expect(decision._tag).toBe('NoChanges');
  });

  it('returns Update when dates change', () => {
    const input: UpdateCycleDatesInput = {
      userId: testUserId,
      cycle: Option.some(testCycle),
      startDate: new Date('2025-02-01'),
      endDate: undefined,
      lastCompletedCycle: Option.none(),
    };

    const decision = decideCycleUpdate(input);
    expect(decision._tag).toBe('Update');
  });
});
```

### Test the Interpreter (Integration Test)

```typescript
describe('executeUpdateDecision', () => {
  it('persists when Update', async () => {
    const decision = CycleUpdateDecision.Update({
      cycleId: testCycleId,
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-02-02'),
    });

    await Effect.runPromise(executeUpdateDecision(decision).pipe(Effect.provide(TestLayer)));

    // Verify repository was called
  });
});
```
