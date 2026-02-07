# Refactor to Sum Type — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide provides the philosophical foundation for why product types with conditional fields are dangerous, the warning signs to detect them, and the design principles that guide the refactoring.

---

## The Implicit AND Problem

> "Make illegal states unrepresentable." — The goal of domain modeling.

Every field in a class is connected by an implicit AND. When you write:

```typescript
class Order {
  status: 'pending' | 'shipped' | 'delivered';
  trackingNumber?: string;
  deliveredAt?: Date;
}
```

You're saying: an Order has a status AND maybe a tracking number AND maybe a delivery date. But this allows invalid combinations:

- `status: 'pending'` with a `trackingNumber` (pending orders don't have tracking)
- `status: 'shipped'` without a `trackingNumber` (shipped orders must have tracking)
- `status: 'delivered'` without `deliveredAt` (delivered orders must have a date)

### When to Break into OR (Sum Types)

If a field only applies in certain contexts, it doesn't belong in a product type. Look for these signals:

- **Optional fields that depend on other fields** — "tracking number is required when shipped"
- **Fields that are mutually exclusive** — "either error message OR result, never both"
- **Comments explaining when fields apply** — `// Only set when status is 'completed'`
- **Null checks before using fields** — `if (order.trackingNumber) { ... }`

When you see these patterns, refactor from product types (AND) to sum types (OR):

```typescript
// ❌ Before: Product type with contextual fields
class Order {
  status: 'pending' | 'shipped' | 'delivered';
  trackingNumber?: string;
  deliveredAt?: Date;
}

// ✅ After: Sum type where each variant has exactly what it needs
type Order = Data.TaggedEnum<{
  Pending: { readonly items: readonly Item[] };
  Shipped: { readonly items: readonly Item[]; readonly trackingNumber: string };
  Delivered: {
    readonly items: readonly Item[];
    readonly trackingNumber: string;
    readonly deliveredAt: Date;
  };
}>;
```

Now it's impossible to have a `Shipped` order without a `trackingNumber` — the type system enforces the invariant.

---

## Warning Signs (Comprehensive)

These symptoms indicate your model likely allows illegal states.

### 1. Defensive Programming in Constructors

If you need validation logic in constructors, your model permits invalid combinations:

```typescript
// ❌ Warning sign: defensive validation
class Order extends S.Class<Order>('Order')({
  status: S.Literal('pending', 'shipped'),
  trackingNumber: S.optionalWith(S.String, { nullable: true }),
}) {
  constructor(props: typeof Order.fields.Type) {
    super(props);
    // ⚠️ If you write this, the model is wrong
    if (props.status === 'shipped' && !props.trackingNumber) {
      throw new Error('Shipped orders must have tracking');
    }
  }
}
```

**Diagnosis**: If you're writing `if` statements in the constructor to validate field combinations, your types are too broad.

### 2. Contextual Fields

Fields that "only apply when..." are a major red flag:

```typescript
// ❌ Warning signs in comments and code
class Task extends S.Class<Task>('Task')({
  status: S.Literal('pending', 'completed'),
  completedBy: S.optionalWith(S.String, { nullable: true }), // Only when completed
  completedAt: S.optionalWith(S.DateFromSelf, { nullable: true }), // Only when completed
}) {}

// ❌ Warning sign: null checks before using fields
function showCompletion(task: Task) {
  if (task.completedBy && task.completedAt) {
    // ...
  }
}
```

**Solution**: Refactor to `Data.TaggedEnum` where each variant has exactly the fields it needs.

### 3. The "Easy Attribute" Trap

Each field you add **multiplies** the possible states (Cartesian product):

```typescript
// Requirement 1: "We need to know if it's completed"
class Status {
  isCompleted: boolean;
} // 2 states

// "Just add two more fields, it's easy..."
class Status {
  isCompleted: boolean; // × 2
  completedBy?: User; // × 2 (present/absent)
  completedOn?: Date; // × 2 (present/absent)
} // = 8 states, most illegal!
```

**Before adding a field, ask**: Does this field apply ALWAYS or only in CERTAIN CONTEXTS?

### Checklist of Symptoms

- [ ] Fields that can be `null` depending on context
- [ ] Booleans that determine which other fields are valid
- [ ] Multiple `if` validations in constructors
- [ ] Comments explaining "this field only applies when..."
- [ ] Methods like `getCompletedByOrNull()` or `isCompletedByPresent()`
- [ ] Guard clauses checking field combinations at runtime

---

## The Design Principles Behind Refactoring

### Be Careful with DRY

Don't refactor code — refactor meaning. Sometimes repetition is correct:

```typescript
// ❌ Wrong DRY: different meanings forced into same structure
type Action = Data.TaggedEnum<{
  Complete: { readonly by: User; readonly at: Date };
  Skip: { readonly by: User; readonly at: Date }; // "Same" structure
}>;
// But "by" means "completed by" vs "skipped by" — different meanings!

// ✅ Correct: repetition is fine when meanings differ
type Action = Data.TaggedEnum<{
  Complete: { readonly completedBy: User; readonly completedAt: Date };
  Skip: {
    readonly skippedBy: User;
    readonly skippedAt: Date;
    readonly reason: string;
  };
}>;
```

**Principle**: Refactor when the meaning is the same. If the meaning is different, the "duplication" is accidental, and forcing DRY makes the design worse.

### Introduce Types Liberally

When code is confusing, introduce more types to clarify intent. The "else" branch is often a sign that a concept is missing:

```typescript
// ❌ The "else" doesn't say what it means
const applyFee = (total: Money, rules: Rules): Money => {
  if (total < rules.minimumThreshold) {
    return Money.zero;
  } else if (total > rules.maximumThreshold) {
    return rules.maximumFee;
  } else {
    return total.multiply(rules.feeRate); // What is "else"?
  }
};

// ✅ Give each case a name
type Assessment = 'BelowMinimum' | 'AboveMaximum' | 'WithinRange';

const assessTotal = (total: Money, rules: Rules): Assessment =>
  total < rules.minimumThreshold ? 'BelowMinimum' : total > rules.maximumThreshold ? 'AboveMaximum' : 'WithinRange'; // Now it has a name!

const applyFee = (total: Money, rules: Rules): Money =>
  Match.value(assessTotal(total, rules)).pipe(
    Match.when('BelowMinimum', () => Money.zero),
    Match.when('AboveMaximum', () => rules.maximumFee),
    Match.when('WithinRange', () => total.multiply(rules.feeRate)),
    Match.exhaustive,
  );
```

**Benefits of introducing types:**

- The "else" branch now has a name (`WithinRange`)
- Each case is explicit and documented
- Adding a new case requires handling it everywhere (exhaustive matching)
- The assessment logic is testable separately from the fee calculation

**Rule of thumb**: If you have an `else` branch that's doing meaningful work, it probably deserves a name.

### Listen to Type Friction

When something feels "wrong" while working with types, it's feedback about your design. Pay attention to:

```typescript
// 🚨 Type friction: forcing a conversion that might not be valid
const computeTotal = (invoices: PastDueInvoice[]): USD =>
  invoices.reduce((sum, inv) => sum.add(new USD(inv.lineItems.map((li) => li.charges))), USD.zero);
// What if it's not USD?
```

**Options when you feel type friction:**

1. **Document and defer**: Create an issue, add a TODO

   ```typescript
   /**
    * TODO: Validate currency at system entry point
    * See: backlog/issue-1234
    */
   const unsafeGetChargesInUSD = (item: LineItem): USD => {
     if (item.currency !== 'USD') {
       throw new UnexpectedCurrencyError(item.currency);
     }
     return new USD(item.charges);
   };
   ```

2. **Defend explicitly**: Add validation with clear error handling

   ```typescript
   const getChargesInUSD = (item: LineItem): Effect<USD, CurrencyMismatchError> =>
     item.currency === 'USD'
       ? Effect.succeed(new USD(item.charges))
       : Effect.fail(new CurrencyMismatchError({ expected: 'USD', actual: item.currency }));
   ```

3. **Refactor the model**: Prevent illegal states at the type level

   ```typescript
   class USDInvoice extends S.Class<USDInvoice>('USDInvoice')({
     id: InvoiceId,
     amount: USDAmount, // Can only be USD by construction
   }) {}
   ```

**The friction is information**: It's telling you where your model doesn't match reality. Use it to improve the design.

---

## The Expanded Refactoring Process

### Step 1: Identify the Discriminator Field

Usually a boolean or enum:

```typescript
class Order {
  isPaid: boolean; // ← Discriminator
  paidAt?: Date; // Only if isPaid=true
  paymentRef?: string; // Only if isPaid=true
}
```

### Step 2: List the Variants and Their Fields

| Variant | Fields               |
| ------- | -------------------- |
| Unpaid  | (common fields only) |
| Paid    | paidAt, paymentRef   |

### Step 3: Create a Sum Type with the Variants

```typescript
type Order = Data.TaggedEnum<{
  Unpaid: { readonly items: readonly Item[] };
  Paid: {
    readonly items: readonly Item[];
    readonly paidAt: Date;
    readonly paymentRef: string;
  };
}>;
```

### Step 4: Remove the Discriminator

The `isPaid` boolean is gone — the variant tag (`_tag: 'Paid'` or `_tag: 'Unpaid'`) carries that information.

### Step 5: Update Consuming Code to Use Pattern Matching

```typescript
// ❌ Before
if (order.isPaid) {
  console.log(order.paidAt); // might be undefined!
}

// ✅ After
Order.$match(order, {
  Unpaid: () => console.log('Not yet paid'),
  Paid: ({ paidAt }) => console.log(paidAt), // guaranteed to exist
});
```

---

## Compose Types Hierarchically

Sum types compose naturally with branded types and value objects:

```typescript
// Primitives (Brand.refined)
type Duration = number & Brand.Brand<'Duration'>;
type Percentage = number & Brand.Brand<'Percentage'>;

// Value Objects (S.Class)
class DateRange extends S.Class<DateRange>('DateRange')({
  start: S.DateFromSelf,
  end: S.DateFromSelf,
}) {}

// ADTs (TaggedEnum) using the above
type Progress = Data.TaggedEnum<{
  OnTrack: { remaining: Duration; progress: Percentage };
  Overdue: { overdue: Duration };
  Completed: { duration: Duration };
}>;

// Entities (S.Class) composing everything
class Cycle extends S.Class<Cycle>('Cycle')({
  id: CycleId,
  range: DateRange,
  status: CycleStatusSchema,
}) {}
```

---

## Design Checklist for Sum Types

### Structural Health

- [ ] **All fields always apply?** If not → use TaggedEnum to split by variant
- [ ] **No defensive validation in constructors?** If yes → types are too broad
- [ ] **No "this field only applies when..." comments?** If present → split types
- [ ] **No optional fields that depend on other fields?** If present → use TaggedEnum

### Illegal State Prevention

- [ ] **Can represent "Completed" without "CompletionDate"?** If yes → refactor
- [ ] **Can mix incompatible IDs?** (e.g., UserId where OrderId expected) If yes → use Brand.refined
- [ ] **Are domain constraints encoded in types?** (percentages 0-100, positive amounts, etc.)

### Evolution Readiness

- [ ] **Will variants likely need different data later?** If yes → start with TaggedEnum, not S.Literal
- [ ] **Is the type easy to extend?** TaggedEnum scales better than growing optional fields
