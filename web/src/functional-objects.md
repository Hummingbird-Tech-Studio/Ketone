# Functional Objects Pattern

When to put methods on types vs. keep them in external services.

---

## 1. Introduction

Scala 3's [domain modeling in FP](https://docs.scala-lang.org/scala3/book/domain-modeling-fp.html) presents four strategies for organizing behavior around data types:

| Strategy                | Description                                                          | Ketone equivalent                                      |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| **Skinny objects**      | Data types are pure containers; behavior lives in external functions | `S.Class` value objects + standalone service functions |
| **Companion objects**   | Functions bundled next to the type in a namespace                    | Standalone exports co-located with the type            |
| **Modular programming** | Trait (interface) + object (implementation), separate from data      | `Effect.Service` + `Layer`                             |
| **Functional objects**  | Immutable methods defined on the data type itself                    | Methods inside `S.Class` body                          |

In Scala 3, **skinny objects** are product types (case classes) and sum types (enums) that carry no behavior:

```scala
case class Pizza(crustSize: CrustSize, crustType: CrustType, toppings: Seq[Topping])

// Behavior lives outside
def pizzaPrice(p: Pizza): Double = ...
```

**Functional objects** put behavior _on_ the type, but remain immutable — methods return new copies:

```scala
case class Pizza(crustSize: CrustSize, crustType: CrustType, toppings: Seq[Topping]):
  def addTopping(t: Topping): Pizza =
    this.copy(toppings = this.toppings :+ t)
  def price: Double = ...
```

Both approaches are pure and testable. The question is: **when does moving behavior onto the type actually improve the design?**

---

## 2. The Three Criteria

A method belongs on the type when it satisfies all three:

### Self-contained

The object has **all the information** needed to execute the operation — no external context, no form state, no actor context, no I/O.

```typescript
// Self-contained: uses only this.amount and other.amount
money.add(otherMoney);

// NOT self-contained: needs currentStartDate from form state
decideSaveTimeline(plan, currentStartDate, currentPeriods);
```

### Closed (algebraically)

The operation returns the **same type**, enabling chaining and composition.

```typescript
// Closed: Money -> Money -> Money
price.add(tax).add(shipping).multiply(quantity)

// NOT closed: PlanDetail -> SaveTimelineDecision (a different type entirely)
plan.decideSaveTimeline(...)  // no chaining possible
```

### Intrinsic

The operation describes **what the object IS**, not what happens to it in some external context. It's a property of the thing itself, not a relationship between the thing and something else.

```typescript
// Intrinsic: a DateRange knows its own duration
range.duration();

// NOT intrinsic: comparing a plan against user edits is a relationship
hasPeriodDurationsChanged(originalPeriods, currentPeriods);
```

**The deciding factor is algebraic closure.** If the type has a natural algebra — operations that are closed, composable, and self-contained — it's a functional object. If the interesting behavior is relational (between the type and external state), keep behavior in services.

---

## 3. Canonical Examples

### Money

The textbook functional object. Every operation is self-contained, closed, and intrinsic:

```typescript
class Money {
  constructor(
    readonly amount: number,
    readonly currency: Currency,
  ) {}

  add(other: Money): Money {
    // Precondition: same currency (or convert)
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    return this.amount > other.amount;
  }

  isZero(): boolean {
    return this.amount === 0;
  }
}

// Usage reads like natural language:
const total = price.add(tax).add(shipping);
const refund = total.negate();
const canAfford = wallet.isGreaterThan(total);
```

Why it works:

- `add` needs only `this` and another `Money` — no database, no API, no form state.
- Every arithmetic operation returns `Money`, so you can chain indefinitely.
- "Adding money" describes what money IS (a quantity that composes additively).

### DateRange

Another natural algebra — containment, overlap, merge, split:

```typescript
class DateRange {
  constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  overlaps(other: DateRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }

  merge(other: DateRange): DateRange {
    return new DateRange(
      new Date(Math.min(this.start.getTime(), other.start.getTime())),
      new Date(Math.max(this.end.getTime(), other.end.getTime())),
    );
  }

  duration(): number {
    return this.end.getTime() - this.start.getTime();
  }

  shift(deltaMs: number): DateRange {
    return new DateRange(new Date(this.start.getTime() + deltaMs), new Date(this.end.getTime() + deltaMs));
  }
}

// Composable:
const fullRange = morning.merge(afternoon);
const isActive = schedule.contains(new Date());
```

---

## 4. Anti-patterns

Operations that **look like** they belong on the type but don't.

### Needs external state

```typescript
// Tempting but wrong — currentStartDate comes from form state, not from this
class PlanDetail {
  decideSaveTimeline(currentStartDate: Date, currentPeriods: PlanPeriodUpdate[]): SaveTimelineDecision {
    // uses this.startDate + this.periods, but also needs external form values
  }
}
```

The operation is _about the relationship_ between the plan and the user's edits, not about the plan itself. The plan alone can't answer "what changed?" — it needs the other side of the comparison.

### Produces a different type

```typescript
// Not closed — returns SaveTimelineDecision, not PlanDetail
plan.decideSaveTimeline(...)  // SaveTimelineDecision
// No chaining possible:
// plan.decideSaveTimeline(...).???  // what would you chain here?
```

When the result is a different type (especially a decision ADT), the operation is a _decision function_ that belongs in a service, not a transformation that belongs on the type.

### Relational operations

```typescript
// Compares TWO things — neither is privileged as "this"
hasStartDateChanged(originalStartDate, currentStartDate);
hasPeriodDurationsChanged(originalPeriods, currentPeriods);
```

These are symmetric comparisons. Making one side `this` would be arbitrary and misleading — it's not "the plan changed", it's "these two values differ".

### Factory functions

```typescript
// Creates from scratch — no existing instance to be "this"
createContiguousPeriods(count, firstStartTime, fastingDuration, eatingWindow);
createContiguousPeriodsFromDurations(periods, firstStartTime);
```

Factory functions take raw parameters and produce new instances. They have no `this`. In Scala these would be companion object methods; in TypeScript they're standalone functions or static methods.

---

## 5. Ketone Domain Audit

Function-by-function verdict for the three domain services.

### plan-validation.service.ts

| Function                                       | Verdict                | Why                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasStartDateChanged(original, current)`       | External               | Relational — compares two dates, neither is `this`                                                                                                                         |
| `hasPeriodDurationsChanged(original, current)` | External               | Relational — compares plan periods against form periods. Also reused by `useTemplateEditForm`, which requires accepting any shape with `{ fastingDuration, eatingWindow }` |
| `canAddPeriod(currentCount)`                   | **Could be intrinsic** | `PlanDetail` has `periods.length` — this could be `plan.canAddPeriod()`. But it's a one-liner: `this.periods.length < MAX_PERIODS`                                         |
| `canRemovePeriod(currentCount)`                | **Could be intrinsic** | Same analysis as `canAddPeriod`                                                                                                                                            |
| `decideSaveTimeline(input)`                    | External               | Needs form state (`currentStartDate`, `currentPeriods`); produces `SaveTimelineDecision` (not closed)                                                                      |

### plan-period-calculation.service.ts

| Function                                                 | Verdict                | Why                                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createContiguousPeriods(count, start, fasting, eating)` | External               | Factory function — creates from raw parameters, no existing instance                                                                                                      |
| `createContiguousPeriodsFromDurations(periods, start)`   | External               | Factory function — same reasoning                                                                                                                                         |
| `computeNextContiguousPeriod(lastPeriod)`                | **Could be intrinsic** | Closed: `PeriodConfig -> PeriodConfig`. Self-contained: uses only `this.startTime`, `this.fastingDuration`, `this.eatingWindow`. Chainable: `period.next().next().next()` |
| `computeShiftedPeriodConfigs(configs, old, new)`         | External               | Needs external date context (old and new dates)                                                                                                                           |

### plan-template-validation.service.ts

| Function                                    | Verdict  | Why                                                                                                 |
| ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `isTemplateLimitReached(currentCount, max)` | External | The template doesn't know how many templates the user has — `currentCount` comes from actor context |
| `decideSaveTemplateLimit(input)`            | External | Same — needs external count; produces `SaveTemplateLimitDecision` (not closed)                      |

### Summary

Of ~11 functions across three services:

- **3 could be intrinsic**: `canAddPeriod`, `canRemovePeriod`, `computeNextContiguousPeriod`
- **8 must remain external**: relational comparisons, decision functions, factory functions, operations needing external context

The three intrinsic candidates are all simple — two are one-liner predicates and one operates on `PeriodConfigInput` (a plain interface, not an `S.Class`). The marginal gain of moving them onto types is small, which confirms the skinny objects pattern is the right fit for this domain.

---

## 6. Decision Rule

When modeling a new domain type, run each candidate method through this checklist:

```
For each candidate method on a type T:

  1. Does it use ONLY data from T (+ domain constants)?
     No  --> external service
     Yes --> continue

  2. Does it return T (or a boolean/derived property of T)?
     No  --> external service (decision functions, projections to other types)
     Yes --> continue

  3. Is the behavior INTRINSIC to what T represents?
     (i.e., not a comparison against external state)
     No  --> external service
     Yes --> PUT IT ON THE TYPE (functional object method)
```

Quick heuristics:

- **"Does this need form state, actor context, or another entity?"** --> External.
- **"Is this a comparison between two instances of different provenance?"** --> External (relational).
- **"Is this a factory that creates from raw params?"** --> External (static/standalone).
- **"Does this return the same type and can be chained?"** --> Strong candidate for the type.

---

## 7. When Each Pattern Shines

|                          | Functional Objects                                                        | Skinny Objects + Services                                      |
| ------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Type archetype**       | Mathematical / algebraic                                                  | Document / DTO / snapshot                                      |
| **Examples**             | `Money`, `DateRange`, `Vector2D`, `NutritionLog`                          | `PlanDetail`, `PlanTemplateDetail`, `UserProfile`              |
| **Operations**           | Closed (same type in, same type out)                                      | Produce different types (decision ADTs, API payloads)          |
| **Context needed**       | Only `this` + domain constants                                            | External state (form values, actor context, counts)            |
| **Composability**        | Value-level chaining: `a.op1().op2().op3()`                               | Program-level composition: `Effect.gen` / `pipe` / `Layer`     |
| **Where behavior lives** | On the type                                                               | In services that operate on the type from outside              |
| **Discoverability**      | `object.` + autocomplete shows all capabilities                           | Need to know which service has which function                  |
| **Cross-type reuse**     | Low — methods are bound to one type                                       | High — functions accept any matching shape                     |
| **DI compatibility**     | Methods can't have injected dependencies                                  | `Effect.Service` with `Layer` naturally supports DI            |
| **Schema decode**        | Methods don't interfere, but mixing decode + logic blurs responsibilities | Clean separation: `S.Class` = decode/validate, service = logic |

### Two levels of composition

Both patterns compose — but at different levels. Understanding this distinction prevents the false impression that skinny objects "don't compose".

#### Value-level composition (functional objects)

Each operation returns the same type, enabling method chaining with no Effect needed:

```typescript
// Money algebra: every step is Money -> Money
const total = price.add(tax).add(shipping).multiply(quantity);

// DateRange algebra: every step is DateRange -> DateRange
const fullWeek = monday.merge(tuesday).merge(wednesday).shift(oneWeekMs);
```

This is **algebraic composition** — the type is closed under its operations. You chain as many steps as you want and the result is always the same type.

#### Program-level composition (Effect services)

Services compose via `Effect.gen`, `pipe`, and `Layer`. Multiple services participate in a workflow that produces a result:

```typescript
// Composing multiple services in a single Effect program
const savePlanTimeline = (input: SaveTimelineInput) =>
  Effect.gen(function* () {
    const validation = yield* PlanValidationService;
    const calculation = yield* PlanPeriodCalculationService;

    // Step 1: FC decision (pure)
    const decision = validation.decideSaveTimeline({
      originalPlan: input.plan,
      currentStartDate: input.startDate,
      currentPeriods: input.periods,
    });

    // Step 2: branch on decision ADT
    return yield* Match.value(decision).pipe(
      Match.tag('NoChanges', () => Effect.succeed('no-op' as const)),
      Match.tag('OnlyStartDate', ({ startDate }) => gateway.updateMetadata({ planId: input.plan.id, startDate })),
      Match.tag('OnlyPeriods', ({ periods }) => gateway.updatePeriods({ planId: input.plan.id, periods })),
      Match.tag('StartDateAndPeriods', ({ startDate, periods }) =>
        gateway
          .updateMetadata({ planId: input.plan.id, startDate })
          .pipe(Effect.flatMap(() => gateway.updatePeriods({ planId: input.plan.id, periods }))),
      ),
      Match.exhaustive,
    );
  });
```

This is **monadic composition** — you sequence steps that may involve I/O, error channels, and dependency injection. The result type changes at each step (`SaveTimelineDecision` -> API response -> final result), and that's perfectly fine because Effect handles the plumbing.

#### Why this matters for the pattern choice

Functional objects compose **values**. Effect services compose **programs**. Both are powerful, but they serve different domains:

```typescript
// Value composition shines when you transform the SAME type repeatedly
const adjusted = price // Money
  .add(tax) // Money
  .multiply(quantity) // Money
  .add(shipping); // Money — still Money after 3 operations

// Program composition shines when operations cross types and boundaries
const program = Effect.gen(function* () {
  const plan = yield* gateway.fetchPlan(id); // PlanDetail
  const decision = validation.decideSaveTimeline(input); // SaveTimelineDecision
  const result = yield* gateway.updatePeriods(periods); // ApiResponse
  yield* Effect.logInfo('Timeline saved'); // void
});
// Each step produces a different type — Effect sequences them
```

In our domain, the interesting operations cross types (plan -> decision -> API response), so program-level Effect composition is the natural fit. Value-level chaining would only apply if we had operations like `PlanDetail -> PlanDetail -> PlanDetail`, which we don't — our transformations produce decision ADTs, not more plans.

### The fundamental question

> Does this type have a **natural algebra** — a set of operations that are closed, composable, and self-contained?

- **Yes** (Money arithmetic, DateRange set operations) --> Functional Object
- **No** (plan vs. edits comparison, template count vs. limit, API payload construction) --> Skinny Object + Service
