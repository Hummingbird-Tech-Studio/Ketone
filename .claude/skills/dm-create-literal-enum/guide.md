# Literal Enum — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide covers evolution guidelines (when to upgrade to TaggedEnum), advanced Match patterns, the complete decision table for choosing between S.Literal and TaggedEnum, and the Match vs Map comparison.

---

## Evolution Guidelines: S.Literal → TaggedEnum

Types evolve as requirements become clearer. Understanding when to upgrade prevents costly refactoring later.

### The Three Stages

**Stage 1: Just labels — S.Literal is sufficient**

```typescript
const Status = S.Literal('active', 'inactive');
```

**Stage 2: One variant needs data — upgrade to TaggedEnum**

```typescript
type Status = Data.TaggedEnum<{
  Active: { readonly since: Date }; // Now needs data!
  Inactive: {};
}>;
```

**Stage 3: More variants diverge — TaggedEnum scales naturally**

```typescript
type Status = Data.TaggedEnum<{
  Active: { readonly since: Date };
  Inactive: {};
  Suspended: { readonly reason: string; readonly until: Date };
}>;
```

### Migration Cost

Upgrading from `S.Literal` to `TaggedEnum` requires changing **all** pattern matching code:

```typescript
// Before (S.Literal + Match):
const describe = Match.type<Status>().pipe(
  Match.when('active', () => 'Active'),
  Match.when('inactive', () => 'Inactive'),
  Match.exhaustive,
);

// After (TaggedEnum + $match) — ALL matching code must change:
const describe = Status.$match({
  Active: ({ since }) => `Active since ${since}`,
  Inactive: () => 'Inactive',
  Suspended: ({ reason }) => `Suspended: ${reason}`,
});
```

**Rule of thumb**: If you suspect variants will diverge (need different data per variant), start with `TaggedEnum` to avoid this refactoring cost.

### Decision Signals

| Signal                                          | Start with          |
| ----------------------------------------------- | ------------------- |
| Requirements are stable, purely categorical     | `S.Literal`         |
| "We might need to add data to X later..."       | `TaggedEnum`        |
| One variant already has unique data             | `TaggedEnum`        |
| All variants share identical metadata structure | `S.Literal + Array` |
| Modeling state machine or operation result      | `TaggedEnum`        |

---

## The Complete Decision Table

| Criteria               | S.Literal + Array                         | Data.TaggedEnum                                                 |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| **Metadata structure** | Same for all variants                     | Different per variant                                           |
| **Example**            | FastingStage (all have minHours/maxHours) | PaymentResult (Approved has transactionId, Declined has reason) |
| **Schema validation**  | Built-in                                  | Manual                                                          |
| **Pattern matching**   | `Match.type<T>()` or manual               | `$match` built-in                                               |
| **Construction**       | String literal (`'Digestion'`)            | Constructor (`PaymentResult.Approved({ ... })`)                 |
| **Serialization**      | String                                    | Object with `_tag`                                              |
| **Associated data**    | External (Record/Array)                   | Embedded per variant                                            |
| **Complexity**         | Low                                       | Medium                                                          |
| **Best for**           | Classifications, categories, statuses     | State machines, results with variable data                      |

### Quick Reference Flowchart

```
What are you modeling?
│
├── Simple labels/categories with NO per-variant data?
│   └── S.Literal
│       └── Do all variants share the same metadata shape?
│           ├── YES → S.Literal + metadata Array (single source of truth)
│           └── NO metadata needed → S.Literal alone
│
├── Exclusive states where variants have DIFFERENT data?
│   └── Data.TaggedEnum
│
└── Not sure yet?
    └── Will variants likely diverge later?
        ├── YES → Start with Data.TaggedEnum (avoid migration cost)
        └── NO → Start with S.Literal (simpler, upgrade later if needed)
```

---

## Match Module: Advanced Patterns

### `Match.type<T>()` — Reusable Matcher

Creates a matcher function that can be stored and reused:

```typescript
import { Match, Schema as S } from 'effect';

const StatusSchema = S.Literal('pending', 'approved', 'rejected');
type Status = S.Schema.Type<typeof StatusSchema>;

// Create once, use many times
const describeStatus = Match.type<Status>().pipe(
  Match.when('pending', () => 'Waiting for review'),
  Match.when('approved', () => 'Request approved'),
  Match.when('rejected', () => 'Request rejected'),
  Match.exhaustive,
);

describeStatus('pending'); // → 'Waiting for review'
describeStatus('approved'); // → 'Request approved'
```

### `Match.value` — Inline Matching

For one-off matches where you don't need a reusable function:

```typescript
const result = Match.value(status).pipe(
  Match.when('pending', () => sendReminder()),
  Match.when('approved', () => sendConfirmation()),
  Match.when('rejected', () => sendApology()),
  Match.exhaustive,
);
```

### Pattern Matching with Predicates

Match supports predicate functions for more complex conditions:

```typescript
import { Match } from 'effect';

const classifyNumber = Match.type<number>().pipe(
  Match.when(
    (n) => n < 0,
    () => 'negative',
  ),
  Match.when(
    (n) => n === 0,
    () => 'zero',
  ),
  Match.when(
    (n) => n > 0,
    () => 'positive',
  ),
  Match.exhaustive,
);
```

### When to Use Match vs TaggedEnum.$match

| Scenario                     | Use                                                 |
| ---------------------------- | --------------------------------------------------- |
| `S.Literal` string unions    | `Match.type<T>()`                                   |
| `Data.TaggedEnum` variants   | `TaggedEnum.$match()`                               |
| Numeric ranges or predicates | `Match.type<T>()` with `Match.when(predicate, ...)` |
| Object discrimination        | Either works; `$match` if already using TaggedEnum  |

---

## Match over Map: The Full Comparison

Maps provide no compile-time guarantees — you can forget a key and the compiler won't complain.

### The Problem with Maps

```typescript
type CustomerRating = 'Good' | 'Acceptable' | 'Poor';

// ❌ Map: no compile-time guarantee, can miss keys
const ratesMap = new Map<CustomerRating, Percentage>([
  ['Good', Percentage(5)],
  ['Acceptable', Percentage(10)],
  // Forgot 'Poor'! No compiler error.
]);

const getRateUnsafe = (rating: CustomerRating): Percentage | undefined => ratesMap.get(rating); // Returns undefined for 'Poor'
```

### The Solution with Match

```typescript
// ✅ Match: exhaustive, compiler enforces all cases
const getRate = (rating: CustomerRating): Percentage =>
  Match.value(rating).pipe(
    Match.when('Good', () => Percentage(5)),
    Match.when('Acceptable', () => Percentage(10)),
    Match.when('Poor', () => Percentage(15)),
    Match.exhaustive, // Compiler error if 'Poor' is missing
  );
```

### Comparison Table

| Aspect             | Map                           | Match                    |
| ------------------ | ----------------------------- | ------------------------ |
| Missing case       | Runtime `undefined`           | Compile-time error       |
| Adding new variant | Silent failure if not updated | Forces update everywhere |
| Type safety        | Returns `T \| undefined`      | Returns `T`              |
| Refactoring safety | Manual search for all usages  | Compiler guides you      |

**Rule of thumb**: Use `Map` for dynamic data (user-provided, loaded from DB). Use `Match` for domain logic with known variants.

---

## The Metadata Array Pattern (Deep Dive)

The metadata array pattern is the most powerful feature of `S.Literal` enums. It creates a **single source of truth** for all variant data.

### Why It Works

1. **Single source of truth** — thresholds defined once in the array
2. **Type-safe** — `satisfies` ensures array matches the enum type
3. **Schema validation** — the Schema validates input from external sources
4. **No duplication** — derived functions compute from the array, not hardcoded values

### Pattern Structure

```typescript
// 1. Define the Schema
export const FastingStageSchema = S.Literal('Digestion', 'Glycogenolysis', 'MetabolicSwitch', 'Ketosis', 'Autophagy');
export type FastingStage = S.Schema.Type<typeof FastingStageSchema>;

// 2. Define the metadata array (single source of truth)
export const STAGES = [
  { stage: 'Digestion', minHours: 0, maxHours: 4 },
  { stage: 'Glycogenolysis', minHours: 4, maxHours: 12 },
  // ...
] as const satisfies readonly { stage: FastingStage; minHours: number; maxHours: number }[];

// 3. Derive ALL functions from the array
export const calculateFastingStage = (hours: ElapsedHours): FastingStage =>
  STAGES.find((s) => hours >= s.minHours && hours < s.maxHours)?.stage ?? 'DeepRenewal';

export const getStageThresholds = (stage: FastingStage) => STAGES.find((s) => s.stage === stage)!;
```

### When This Pattern Breaks Down

If you need to add a field that only some variants have, the array pattern stops working:

```typescript
// ❌ This breaks the "same metadata for all" rule
const STAGES = [
  { stage: 'Active', since: new Date() }, // has 'since'
  { stage: 'Inactive' }, // no 'since'
  { stage: 'Suspended', reason: '', until: new Date() }, // has 'reason' + 'until'
];
```

When this happens, upgrade to `Data.TaggedEnum` where each variant has its own shape.

---

## Integration with Semantic Wrappers

`S.Literal` enums compose well with semantic wrappers for pipeline stages:

```typescript
// The enum
export const ProcessingStatus = S.Literal('Raw', 'Validated', 'Enriched', 'Persisted');
export type ProcessingStatus = S.Schema.Type<typeof ProcessingStatus>;

// Used in semantic wrappers
class RawOrder extends S.Class<RawOrder>('RawOrder')({
  data: S.Unknown,
  status: S.Literal('Raw'), // Locked to specific variant
}) {}

class ValidatedOrder extends S.Class<ValidatedOrder>('ValidatedOrder')({
  order: Order,
  status: S.Literal('Validated'),
}) {}
```

This pattern is documented in the `dm-create-semantic-wrapper` skill.
