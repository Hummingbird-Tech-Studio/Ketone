---
name: dm-create-semantic-wrapper
description: Create semantic wrapper types for pipeline stages. Use for Raw/Validated/Enriched/Persisted patterns.
model: opus
---

# Create Semantic Wrapper

Creates semantic wrapper types for pipeline stages (Raw → Validated → Enriched → Persisted).

## Usage

```
/create-semantic-wrapper <WrapperName> --wraps <WrappedType> [--stage <stage>] [--extra-fields <field1:type1,...>]
```

## Arguments

- `WrapperName`: The wrapper name in PascalCase (e.g., `ValidatedOrder`, `PastDueInvoice`)
- `--wraps`: The type being wrapped (e.g., `Order`, `Invoice`)
- `--stage`: Optional pipeline stage (raw, validated, enriched, persisted)
- `--extra-fields`: Optional additional fields the wrapper adds

## When to Use

Use semantic wrappers when:

- You want to communicate that data has been processed or verified
- You need to distinguish data at different stages of a pipeline
- You want to "quarantine" mutable or external data
- A type's semantics change after some operation

Semantic wrappers differ from `Brand.refined`:

- **Brand.refined**: Wraps primitives with validation
- **Semantic wrapper**: Wraps complex types to communicate meaning

## Output

### Pipeline Stage Wrappers

```typescript
import { Schema as S } from 'effect';
import { Order } from './order.model.js';
import { CustomerDetails, ShippingInfo } from '../shared/types.js';

/**
 * RawOrder
 *
 * Represents unvalidated order data from external source.
 * Must be validated before processing.
 */
export class RawOrder extends S.Class<RawOrder>('RawOrder')({
  data: S.Unknown,
}) {}

/**
 * ValidatedOrder
 *
 * Represents an order that has passed validation.
 * Safe to process.
 */
export class ValidatedOrder extends S.Class<ValidatedOrder>('ValidatedOrder')({
  order: Order,
}) {}

/**
 * EnrichedOrder
 *
 * Represents a validated order enriched with external data.
 */
export class EnrichedOrder extends S.Class<EnrichedOrder>('EnrichedOrder')({
  order: Order,
  customerDetails: CustomerDetails,
  shippingInfo: ShippingInfo,
}) {}

/**
 * PersistedOrder
 *
 * Represents an order that has been saved to the database.
 * Includes persistence metadata.
 */
export class PersistedOrder extends S.Class<PersistedOrder>('PersistedOrder')({
  order: Order,
  persistedAt: S.DateFromSelf,
  version: S.Number,
}) {}
```

### Business Context Wrappers

```typescript
import { Schema as S } from 'effect';
import { Invoice } from './invoice.model.js';

/**
 * PastDueInvoice
 *
 * Represents an invoice that has been determined to be past due.
 * This wrapper can't validate "pastDue" on its own (needs current date),
 * but it communicates important information in the type.
 */
export class PastDueInvoice extends S.Class<PastDueInvoice>('PastDueInvoice')({
  invoice: Invoice,
  determinedAt: S.DateFromSelf, // When we determined it was past due
  daysOverdue: S.Number,
}) {}

/**
 * EligibleForRefund
 *
 * Represents an order that has been determined eligible for refund.
 */
export class EligibleForRefund extends S.Class<EligibleForRefund>('EligibleForRefund')({
  order: Order,
  eligibilityReason: S.String,
  maxRefundAmount: S.Number,
}) {}
```

## Pipeline Function Signatures

With semantic wrappers, pipeline functions have clear signatures:

```typescript
// Pipeline functions with clear signatures
const validate = (raw: RawOrder): Effect.Effect<ValidatedOrder, ValidationError> => ...

const enrich = (validated: ValidatedOrder): Effect.Effect<EnrichedOrder, EnrichmentError> => ...

const persist = (enriched: EnrichedOrder): Effect.Effect<PersistedOrder, PersistenceError> => ...

// Full pipeline
const processOrder = (raw: RawOrder) =>
  pipe(
    validate(raw),
    Effect.flatMap(enrich),
    Effect.flatMap(persist),
  );
```

Without wrappers, signatures are ambiguous:

```typescript
// ❌ Which Order is which? All look the same.
const validate = (order: Order): Effect.Effect<Order, ValidationError> => ...
const enrich = (order: Order): Effect.Effect<Order, EnrichmentError> => ...
const persist = (order: Order): Effect.Effect<Order, PersistenceError> => ...
```

## Naming Conventions

| Stage            | Naming Pattern                               | Example                               |
| ---------------- | -------------------------------------------- | ------------------------------------- |
| Input            | `Raw{Concept}`                               | `RawOrder`, `RawUserInput`            |
| After validation | `Validated{Concept}`                         | `ValidatedOrder`, `ValidatedEmail`    |
| After enrichment | `Enriched{Concept}`                          | `EnrichedOrder`, `EnrichedProfile`    |
| After decision   | `{Decision}{Concept}`                        | `ApprovedLoan`, `RejectedClaim`       |
| Final            | `Persisted{Concept}` or `Completed{Concept}` | `PersistedOrder`                      |
| Business context | `{Context}{Concept}`                         | `PastDueInvoice`, `EligibleForRefund` |

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { RawOrder, ValidatedOrder, EnrichedOrder, PastDueInvoice } from './{module}.model.js';

describe('Semantic Wrappers', () => {
  describe('Pipeline stages', () => {
    it('RawOrder wraps unknown data', () => {
      const raw = new RawOrder({ data: { some: 'data' } });
      expect(raw.data).toEqual({ some: 'data' });
    });

    it('ValidatedOrder wraps validated Order', () => {
      const order = new Order({
        /* ... */
      });
      const validated = new ValidatedOrder({ order });
      expect(validated.order).toBe(order);
    });

    it('EnrichedOrder adds extra context', () => {
      const order = new Order({
        /* ... */
      });
      const enriched = new EnrichedOrder({
        order,
        customerDetails: {
          /* ... */
        },
        shippingInfo: {
          /* ... */
        },
      });
      expect(enriched.order).toBe(order);
      expect(enriched.customerDetails).toBeDefined();
    });
  });

  describe('Business context wrappers', () => {
    it('PastDueInvoice captures when determination was made', () => {
      const invoice = new Invoice({
        /* ... */
      });
      const pastDue = new PastDueInvoice({
        invoice,
        determinedAt: new Date(),
        daysOverdue: 15,
      });
      expect(pastDue.daysOverdue).toBe(15);
    });
  });

  describe('Type safety in pipelines', () => {
    it('prevents passing wrong stage to function', () => {
      // This is a compile-time check - the test documents intent
      const validateOrder = (raw: RawOrder): ValidatedOrder => {
        /* ... */
      };
      const enrichOrder = (validated: ValidatedOrder): EnrichedOrder => {
        /* ... */
      };

      // validateOrder(validated) would be a type error
      // enrichOrder(raw) would be a type error
    });
  });
});
```

## Accepting Imperfect Semantics

Not all types can self-validate completely. **A type that communicates something useful is already valuable**, even if it can't be enforced in the constructor:

```typescript
// This wrapper can't validate "pastDue" on its own (needs current date)
// But it still communicates important information in the type
class PastDueInvoice extends S.Class<PastDueInvoice>('PastDueInvoice')({
  invoice: Invoice,
  determinedAt: S.DateFromSelf, // Documents when the determination was made
}) {}
```

The wrapper documents context that external validation provided.
