---
name: dm-refactor-to-sum-type
description: Transform product types with conditional fields into sum types using Data.TaggedEnum.
model: opus
---

# Refactor to Sum Type

Transforms product types (AND) with conditional fields into sum types (OR) using Data.TaggedEnum.

## Usage

```
/refactor-to-sum-type <TypeName>
```

## Arguments

- `TypeName`: The product type to refactor (e.g., `Order`, `Task`)

## When to Use

Use when you detect these **Warning Signs**:

- Fields that "only apply when..." another field has certain value
- Optional fields that are always set together
- Booleans that determine which other fields are valid
- Defensive validation in constructors checking field combinations
- Comments like `// Only set when status is 'shipped'`

## Input → Output Examples

### Optional Fields Dependent on Status

**Input:**

```typescript
class Order extends S.Class<Order>('Order')({
  status: S.Literal('pending', 'shipped'),
  trackingNumber: S.optionalWith(S.String, { nullable: true }),
  shippedAt: S.optionalWith(S.DateFromSelf, { nullable: true }),
}) {}
```

**Output:**

```typescript
type Order = Data.TaggedEnum<{
  Pending: { readonly items: readonly Item[] };
  Shipped: {
    readonly items: readonly Item[];
    readonly trackingNumber: string;
    readonly shippedAt: Date;
  };
}>;

const Order = Data.taggedEnum<Order>();
export const { $is, $match } = Order;
```

### Boolean Discriminator Pattern

**Input:**

```typescript
class Task {
  isCompleted: boolean;
  completedAt?: Date;
  completedBy?: User;
}
```

**Output:**

```typescript
type Task = Data.TaggedEnum<{
  Pending: { readonly title: string; readonly assignee: User };
  Completed: {
    readonly title: string;
    readonly assignee: User;
    readonly completedBy: User;
    readonly completedAt: Date;
  };
}>;

const Task = Data.taggedEnum<Task>();
```

### Constructor Validation

**Input:**

```typescript
class Account extends S.Class<Account>('Account')({
  type: S.Literal('checking', 'savings'),
  overdraftLimit: S.optionalWith(S.Number, { nullable: true }),
  interestRate: S.optionalWith(S.Number, { nullable: true }),
}) {
  constructor(props: typeof Account.fields.Type) {
    super(props);
    if (props.type === 'checking' && props.interestRate) {
      throw new Error('Checking accounts cannot have interest');
    }
    if (props.type === 'savings' && props.overdraftLimit) {
      throw new Error('Savings accounts cannot have overdraft');
    }
  }
}
```

**Output:**

```typescript
type Account = Data.TaggedEnum<{
  Checking: { readonly balance: Money; readonly overdraftLimit: Money };
  Savings: { readonly balance: Money; readonly interestRate: Percentage };
}>;

const Account = Data.taggedEnum<Account>();
// Impossible to create invalid combinations!
```

## Refactoring Checklist

1. **Identify the discriminator** - The field that determines which other fields apply
2. **Group fields by variant** - Which fields belong to which state
3. **Extract common fields** - Fields that apply to ALL variants
4. **Define TaggedEnum** - Create variant for each state
5. **Update consuming code** - Use `$match` for exhaustive handling

## Test Template

```typescript
describe('Order (refactored)', () => {
  it('Pending variant has no tracking', () => {
    const order = Order.Pending({ items: [] });
    expect(order._tag).toBe('Pending');
    // @ts-expect-error - trackingNumber doesn't exist on Pending
    order.trackingNumber;
  });

  it('Shipped variant requires tracking', () => {
    const order = Order.Shipped({
      items: [],
      trackingNumber: 'TRACK-123',
      shippedAt: new Date(),
    });
    expect(order.trackingNumber).toBe('TRACK-123');
  });

  it('exhaustive match handles all variants', () => {
    const getMessage = Order.$match({
      Pending: () => 'Waiting...',
      Shipped: ({ trackingNumber }) => `Shipped: ${trackingNumber}`,
    });
    // Compiler error if variant missing!
  });
});
```

## References

- functional-domain-modeling.md#275-352 (Warning Signs)
- functional-domain-modeling.md#44-89 (Illegal States)
- functional-domain-modeling.md#770-796 (Refactoring from Optional Fields)
