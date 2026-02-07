# Tagged Enum — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide covers the deeper concepts behind `Data.TaggedEnum`: reifying decisions, functions as data, phantom types, evolution guidelines, and pragmatic option handling.

---

## Reifying Decisions

"Reify" means turning something abstract (a decision) into something concrete (data). Instead of acting immediately inside an `if`, **return the decision as data**.

### The Problem

```typescript
// ❌ Decisions coupled to actions, hidden in implementation
function processBilling(invoice: Invoice) {
  if (invoice.isPastDue && invoice.amount > 1000) {
    applyLateFee(invoice);
  } else if (invoice.isPastDue) {
    sendReminder(invoice);
  } else {
    // do nothing
  }
}
```

The business logic (what decision to make) is tangled with the side effects (what action to take). This makes it hard to test, reason about, or change independently.

### The Solution

Convert decisions into explicit types:

```typescript
// ✅ Decisions as data
type BillingDecision = Data.TaggedEnum<{
  ApplyLateFee: { readonly invoice: Invoice; readonly feeAmount: number };
  SendReminder: { readonly invoice: Invoice };
  NoAction: { readonly invoice: Invoice };
}>;

const BillingDecision = Data.taggedEnum<BillingDecision>();

// Decide (pure function)
const decideBilling = (invoice: Invoice): BillingDecision => {
  if (invoice.isPastDue && invoice.amount > 1000) {
    return BillingDecision.ApplyLateFee({ invoice, feeAmount: invoice.amount * 0.05 });
  }
  if (invoice.isPastDue) {
    return BillingDecision.SendReminder({ invoice });
  }
  return BillingDecision.NoAction({ invoice });
};

// Act (separate from decision)
const executeBilling = BillingDecision.$match({
  ApplyLateFee: ({ invoice, feeAmount }) => applyLateFee(invoice, feeAmount),
  SendReminder: ({ invoice }) => sendReminder(invoice),
  NoAction: () => Effect.void,
});

// Usage
const decision = decideBilling(invoice); // Pure: easy to test
const result = executeBilling(decision); // Effectful: separate concern
```

### Multiple Interpreters

The decision can be interpreted in different contexts without changing business logic:

```typescript
// Interpreter for real effects
const executeBilling = BillingDecision.$match({
  ApplyLateFee: ({ invoice, feeAmount }) => applyLateFee(invoice, feeAmount),
  SendReminder: ({ invoice }) => sendReminder(invoice),
  NoAction: () => Effect.void,
});

// Interpreter for auditing/logging (dry run)
const auditBilling = BillingDecision.$match({
  ApplyLateFee: ({ invoice, feeAmount }) => Effect.logInfo(`ApplyLateFee invoice=${invoice.id} fee=${feeAmount}`),
  SendReminder: ({ invoice }) => Effect.logInfo(`SendReminder invoice=${invoice.id}`),
  NoAction: ({ invoice }) => Effect.logInfo(`NoAction invoice=${invoice.id}`),
});

// Same decision, different interpreters
const decision = decideBilling(invoice);
yield * executeBilling(decision); // Real execution
yield * auditBilling(decision); // Audit log
```

This pattern enables:

- **Dry-run mode**: Log what would happen without side effects
- **Audit trails**: Record every decision for compliance
- **Testing**: Verify decisions without triggering real actions
- **Replay**: Re-execute historical decisions

### Benefits

| Benefit         | Description                                         |
| --------------- | --------------------------------------------------- |
| **Decoupling**  | Where the decision is made vs where it's acted upon |
| **Visibility**  | Business branching logic is explicit in types       |
| **Testability** | Test decision logic with pure functions (no mocks)  |
| **Flexibility** | Custom interpreters (logging, dry-run, replay)      |
| **Debugging**   | Inspect decisions before execution                  |

### When to Apply

Look for these signals:

- Complex `if/else` chains that mix logic with side effects
- Business rules that need to be auditable
- Decisions that might need to be logged or replayed
- Logic that's hard to test because it triggers side effects

---

## When NOT to Reify Decisions

Not every `if` should become an ADT. Use normal `if` statements when:

- **Guard clauses** that fail fast with an error (`Effect.fail`) — the error is already data in the error channel
- **Conditional validations** that don't produce multiple successful outcomes
- **No boundary crossing and no need for audit/replay**

**Rule of thumb:**

- Guard clause → `if` + `Effect.fail(TaggedError)`
- Conditional validation → `if`
- Multiple successful paths (especially crossing a boundary) → ADT

### Concrete Example in a Domain Service

```typescript
// ✅ Guard clause → if + error (error IS the reified decision)
if (Option.isNone(input.cycle) || input.cycle.value.userId !== input.userId) {
  return yield* Effect.fail(new CycleNotFoundError(...));
}

// ✅ Conditional validation → if (no branching outcome)
if (input.startDate !== undefined) {
  yield* validationService.validateStartDateNotFuture(finalStartDate);
}

// ✅ Multiple successful outcomes → ADT (shell must interpret)
if (input.startDate === undefined && input.endDate === undefined) {
  return CycleUpdateDecision.NoChanges({ cycleId: cycle.id });
}
return CycleUpdateDecision.Update({ ... });
```

---

## Functions as Data

Sometimes the correct result is not a value, but a function. When a domain concept represents a **relationship** or **transformation**, model it as a function.

### The Problem

```typescript
// ❌ Initial attempt: return a number of days
const gracePeriod = (rating: CustomerRating): number =>
  Match.value(rating).pipe(
    Match.when('Good', () => 60),
    Match.when('Acceptable', () => 30),
    Match.when('Poor', () => ???), // "end of month" is not a fixed number!
    Match.exhaustive,
  );
```

The problem is that "grace period" isn't a number — it's a **date transformation**.

### The Solution

```typescript
// ✅ Grace period IS a date → date relationship
const gracePeriod = (rating: CustomerRating): ((date: Date) => Date) =>
  Match.value(rating).pipe(
    Match.when('Good', () => (date) => addDays(date, 60)),
    Match.when('Acceptable', () => (date) => addDays(date, 30)),
    Match.when('Poor', () => (date) => lastDayOfMonth(date)),
    Match.exhaustive,
  );

// Usage reads like the requirement
const dueDate = invoice.dueDate;
const adjustedDate = gracePeriod(customer.rating)(dueDate);
const isPastGracePeriod = evaluationDate > adjustedDate;
```

### Pattern: Functions as Return Values

| Domain Concept   | Naive Model        | Better Model: Function        |
| ---------------- | ------------------ | ----------------------------- |
| Grace period     | `number` (days)    | `(Date) => Date`              |
| Discount rule    | `number` (percent) | `(Money) => Money`            |
| Validation rule  | `boolean`          | `(T) => ValidationResult`     |
| Pricing strategy | `Money`            | `(Order) => Money`            |
| Access policy    | `boolean`          | `(User, Resource) => boolean` |

### $is Returns a Predicate Function

The `$is` helper from `Data.TaggedEnum` returns a function, not a boolean:

```typescript
export const { $is, $match } = CycleProgressAssessment;

// $is('OnTrack') returns a type guard function
// (value: CycleProgressAssessment) => value is CycleProgressAssessment.OnTrack
if ($is('OnTrack')(result)) {
  console.log(result.remaining); // result is narrowed
}

// Enables composition
const onTrackResults = assessments.filter($is('OnTrack'));
```

### When to Use This Pattern

Look for these signals:

- A "value" that changes based on context (like "end of month" varying by month)
- Domain language uses verbs: "apply discount", "adjust date", "transform input"
- You find yourself passing the "value" to another function immediately after getting it
- The concept is really a **rule** or **policy**, not just data

---

## Phantom Types: When TaggedEnum Isn't Right

`TaggedEnum` is the idiomatic choice in Effect/TypeScript for most cases. However, **phantom types remain useful** when:

- All lifecycle states share the **same structure** (identical fields)
- You want compile-time state tracking without changing runtime shape
- You need APIs that are generic over state

```typescript
// Phantom type approach (when all states have same fields)
type Draft = { readonly _state: 'Draft' };
type Submitted = { readonly _state: 'Submitted' };

class Order<S extends { _state: string }> {
  constructor(
    readonly id: OrderId,
    readonly items: readonly Item[],
    readonly _phantom?: S, // Never used at runtime
  ) {}
}

// Type-safe state transitions
const submit = (order: Order<Draft>): Order<Submitted> => new Order(order.id, order.items);

// Generic over any state
const countItems = <S extends { _state: string }>(order: Order<S>): number => order.items.length;
```

**Guideline:**

- Use `TaggedEnum` when variants have **different data**
- Use phantom types for **same-shape lifecycle tracking**

Note: Effect's `S.Class` doesn't support type parameters, so phantom types in Effect are typically implemented with plain classes or interfaces, not `S.Class`.

---

## Evolution Guidelines: S.Literal → TaggedEnum

Types evolve as requirements become clearer. Here's when to upgrade:

1. **Start with S.Literal** if variants are just labels with no data
2. **Upgrade to Data.TaggedEnum** as soon as one variant needs even a single unique field
3. **If you anticipate divergence**, skip S.Literal and go straight to Data.TaggedEnum

```typescript
// Stage 1: Just labels — S.Literal is sufficient
const Status = S.Literal('active', 'inactive');

// Stage 2: One variant needs data → upgrade to TaggedEnum
type Status = Data.TaggedEnum<{
  Active: { readonly since: Date }; // Now needs data!
  Inactive: {};
}>;

// Stage 3: More variants diverge → TaggedEnum scales naturally
type Status = Data.TaggedEnum<{
  Active: { readonly since: Date };
  Inactive: {};
  Suspended: { readonly reason: string; readonly until: Date };
}>;
```

**Migration cost**: Upgrading from `S.Literal` to `TaggedEnum` requires changing all pattern matching code. If you suspect variants will diverge, start with `TaggedEnum` to avoid this refactoring cost.

### S.Literal vs TaggedEnum Decision

| Criteria               | S.Literal + Array                         | Data.TaggedEnum                                                 |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| **Metadata structure** | Same for all variants                     | Different per variant                                           |
| **Example**            | FastingStage (all have minHours/maxHours) | PaymentResult (Approved has transactionId, Declined has reason) |
| **Schema validation**  | Built-in                                  | Manual                                                          |
| **Pattern matching**   | `Match.type<T>()` or manual               | `$match` built-in                                               |
| **Construction**       | String literal (`'Digestion'`)            | Constructor (`PaymentResult.Approved({ ... })`)                 |
| **Best for**           | Classifications, categories, statuses     | State machines, results with variable data                      |

### Quick Reference

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

---

## Pragmatic Option Handling with TaggedEnum

Don't get caught in "functional vs imperative" style wars. Choose based on **what you want the reader to focus on**.

```typescript
type BillingDecision = Data.TaggedEnum<{
  Billable: { readonly invoice: Invoice };
  NotBillable: { readonly invoice: Invoice; readonly reason: string };
  NeedsApproval: { readonly invoice: Invoice };
}>;

const BillingDecision = Data.taggedEnum<BillingDecision>();

// Functional style: the "absent" case is hidden at the end
const decisionFunctional = (invoice: Invoice, approval: Option.Option<Approval>) =>
  Option.match(approval, {
    onNone: () => BillingDecision.NeedsApproval({ invoice }),
    onSome: (a) =>
      Match.value(a.status).pipe(
        Match.when('Approved', () => BillingDecision.Billable({ invoice })),
        Match.when('Denied', () => BillingDecision.NotBillable({ invoice, reason: a.reason })),
        Match.exhaustive,
      ),
  });

// Imperative style: the important case is highlighted first
const decisionImperative = (invoice: Invoice, approval: Option.Option<Approval>) =>
  Option.isNone(approval)
    ? BillingDecision.NeedsApproval({ invoice }) // ← This is the important case!
    : Match.value(approval.value.status).pipe(
        Match.when('Approved', () => BillingDecision.Billable({ invoice })),
        Match.when('Denied', () => BillingDecision.NotBillable({ invoice, reason: approval.value.reason })),
        Match.exhaustive,
      );
```

**When to use which style:**

| Style                 | Use when...                                          |
| --------------------- | ---------------------------------------------------- |
| `Option.match`        | The `Some` case is the main flow, `None` is fallback |
| `Option.isNone` check | The `None` case is interesting/important             |
| `Option.getOrElse`    | You just need a default value                        |

**Principle**: Code communicates intent. Structure to highlight what matters most.
