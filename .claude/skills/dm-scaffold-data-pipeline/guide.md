# Scaffold Data Pipeline — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide covers data pipelines as storytelling with types, how types create architectural seams, integration with semantic wrappers, and the naming conventions for pipeline stages.

---

## Data Pipelines: Storytelling with Types

Domain modeling is not just about static structures — it's about **transformations**. Your code should read like a narrative of how data evolves through the system.

### The Pipeline Pattern

Instead of thinking in "actions", think in discrete states that data passes through:

```
RawInput → ValidatedData → DomainDecision → PersistedResult
```

Each arrow is a function, and each node is a type that tells part of the story:

```typescript
const processOrder = (raw: RawOrderInput) =>
  pipe(
    validateOrder(raw), // Effect<ValidatedOrder, ValidationError>
    Effect.map(calculateTotal), // Effect<OrderWithTotal, ...>
    Effect.flatMap(applyDiscounts), // Effect<DiscountedOrder, ...>
    Effect.flatMap(persistOrder), // Effect<PersistedOrder, ...>
  );
```

### Types as Documentation

Well-designed pipelines are self-documenting. You should be able to understand the business process from the type signatures alone:

```typescript
// The types tell the story:
// 1. Raw input needs validation
// 2. Validated orders get totals calculated
// 3. Orders with totals can have discounts applied
// 4. Discounted orders are ready for persistence

type Pipeline = (raw: RawOrderInput) => Effect<PersistedOrder, OrderError>;
```

**Rule of Thumb**: If a function's purpose isn't clear from its input/output types alone, you're missing a domain concept.

### Naming Conventions for Pipeline Types

| Stage            | Naming Pattern                               | Example                                  |
| ---------------- | -------------------------------------------- | ---------------------------------------- |
| Input            | `Raw{Concept}`                               | `RawOrder`, `RawUserInput`               |
| After validation | `Validated{Concept}`                         | `ValidatedOrder`, `ValidatedEmail`       |
| After enrichment | `Enriched{Concept}`                          | `EnrichedOrder`, `EnrichedProfile`       |
| After decision   | `{Decision}{Concept}`                        | `ApprovedLoan`, `RejectedClaim`          |
| Final            | `Persisted{Concept}` or `Completed{Concept}` | `PersistedOrder`, `CompletedTransaction` |

---

## Data Creates Architectural Seams

Well-defined data types create natural interfaces for reorganizing your system. The boundaries between types become boundaries between components.

### From Monolith to Components

```
Before: Everything in a for-loop
┌─────────────────────────────────┐
│ for each customer:              │
│   load → process → bill → save  │
└─────────────────────────────────┘

After: Independent components connected by data
┌──────────┐    ┌─────────┐    ┌──────────┐
│  Loader  │───▶│  Core   │───▶│  Biller  │
│ (async)  │    │ (pure)  │    │ (queue)  │
└──────────┘    └─────────┘    └──────────┘
     │               │
     │               ▼
     │        ┌──────────────┐
     └───────▶│  Approvals   │
              │ (microserv.) │
              └──────────────┘
```

### How Data Types Enable This

When your data is well-typed, each transformation becomes a clear interface:

```typescript
// These types define the seams
type LoadedData = { customer: Customer; invoices: Invoice[]; today: Date };
type ProcessedResult = { pastDue: PastDueInvoice[]; decisions: BillingDecision[] };
type BillingOutput = { fees: LateFee[]; notifications: Notification[] };

// Each component is independent and testable
const loader = (): Effect<LoadedData, LoaderError> => {
  /* ... */
};
const processor = (data: LoadedData): ProcessedResult => {
  /* pure */
};
const biller = (result: ProcessedResult): Effect<BillingOutput, BillerError> => {
  /* ... */
};

// Compose them
const pipeline = Effect.gen(function* () {
  const data = yield* loader();
  const result = processor(data);
  return yield* biller(result);
});
```

### Benefits of Data-Defined Seams

| Benefit                    | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| **Independent deployment** | Components can be deployed separately                |
| **Parallel development**   | Teams work on different components without conflicts |
| **Testing isolation**      | Test each component with simple input/output         |
| **Technology flexibility** | Each component can use different tech (queues, DBs)  |
| **Scaling options**        | Scale components independently based on load         |

### Real-World Example

The `assessProgress` function in the codebase demonstrates this:

```typescript
// Input type: Cycle + Date
// Output type: CycleProgressAssessment (OnTrack | Overdue | Completed)
export const assessProgress = (cycle: Cycle, now: Date): CycleProgressAssessment => ...

// This function is a "seam" — it could be:
// - Called directly in-process
// - Exposed as an API endpoint
// - Run as a serverless function
// - Processed in a queue worker
// The types define the contract, the deployment is flexible
```

---

## Integration with Semantic Wrappers

Data pipelines and semantic wrappers are complementary patterns. Semantic wrappers give pipeline stages their own types, making it impossible to pass data from the wrong stage.

### Pipeline Without Semantic Wrappers

```typescript
// ❌ All functions take/return the same Order type
// Nothing prevents calling enrich() before validate()
const validate = (order: Order): Effect<Order, ValidationError> => ...
const enrich = (order: Order): Effect<Order, EnrichmentError> => ...
const persist = (order: Order): Effect<Order, PersistError> => ...
```

### Pipeline With Semantic Wrappers

```typescript
// ✅ Each stage has its own type — wrong order is a compile error
class RawOrder extends S.Class<RawOrder>('RawOrder')({
  data: S.Unknown,
}) {}

class ValidatedOrder extends S.Class<ValidatedOrder>('ValidatedOrder')({
  order: Order,
}) {}

class EnrichedOrder extends S.Class<EnrichedOrder>('EnrichedOrder')({
  order: Order,
  customerDetails: CustomerDetails,
  shippingInfo: ShippingInfo,
}) {}

// Pipeline functions with clear signatures
const validate = (raw: RawOrder): Effect<ValidatedOrder, ValidationError> => ...
const enrich = (validated: ValidatedOrder): Effect<EnrichedOrder, EnrichmentError> => ...
const persist = (enriched: EnrichedOrder): Effect<PersistedOrder, PersistError> => ...

// Composition — the types enforce correct ordering
const pipeline = (raw: RawOrder) =>
  validate(raw).pipe(
    Effect.flatMap(enrich),
    Effect.flatMap(persist),
  );
```

### Accepting Imperfect Semantics

Not all wrapper types can self-validate completely. Sometimes the necessary context comes from outside. **A type that communicates something useful is already valuable**, even if it can't be enforced in the constructor.

```typescript
// This wrapper can't validate "pastDue" on its own (needs current date)
// But it still communicates important information in the type
class PastDueInvoice extends S.Class<PastDueInvoice>('PastDueInvoice')({
  invoice: Invoice,
  determinedAt: S.DateFromSelf, // When we determined it was past due
}) {}

// Now function signatures are precise
// ❌ Imprecise: any invoice
const createLateFee = (invoices: readonly Invoice[]): LateFee[] => ...

// ✅ Precise: only past-due invoices
const createLateFee = (invoices: readonly PastDueInvoice[]): LateFee[] => ...
```

---

## Connection to Three Phases Pattern

Data pipelines are the architectural generalization of the Three Phases pattern:

```
Three Phases:
┌─────────────┐    ┌─────────┐    ┌─────────────┐
│ COLLECTION  │ -> │  LOGIC  │ -> │ PERSISTENCE │
│  (Shell)    │    │  (Core) │    │   (Shell)   │
└─────────────┘    └─────────┘    └─────────────┘

Data Pipeline (generalized):
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐    ┌─────────┐
│  Load   │ -> │ Validate │ -> │ Enrich  │ -> │ Decide   │ -> │ Persist │
│ (I/O)   │    │  (pure)  │    │  (I/O)  │    │  (pure)  │    │  (I/O)  │
└─────────┘    └──────────┘    └─────────┘    └──────────┘    └─────────┘
```

Three Phases is Shell-Core-Shell (3 steps). A data pipeline can have N steps, alternating between I/O and pure logic as needed. The principle is the same: **types define the contracts between steps**.

### When to Use Three Phases vs Data Pipeline

| Scenario                                                                                        | Pattern       |
| ----------------------------------------------------------------------------------------------- | ------------- |
| Simple business operation (collect → decide → persist)                                          | Three Phases  |
| Multi-step process with intermediate I/O (load → validate → enrich from API → decide → persist) | Data Pipeline |
| Independent, deployable components                                                              | Data Pipeline |
| Single service method                                                                           | Three Phases  |

---

## Testing Pipelines

Each pipeline component is testable independently because the types define clear interfaces:

### Test Pure Logic (No Mocks)

```typescript
describe('processOrder (pure core)', () => {
  it('calculates correct decisions', () => {
    const input = new LoadedOrderData({
      order: testOrder,
      customer: testCustomer,
      loadedAt: new Date('2025-01-01'),
    });

    const result = processOrder(input);

    expect(result.decisions).toHaveLength(2);
    expect(result.calculatedTotal.value).toBe(150);
  });
});
```

### Test I/O Components (With Test Layer)

```typescript
describe('loadOrderData (I/O)', () => {
  it('loads and combines data', async () => {
    const result = await Effect.runPromise(loadOrderData(testOrderId).pipe(Effect.provide(TestRepositories)));

    expect(result.order.id).toBe(testOrderId);
    expect(result.customer).toBeDefined();
  });
});
```

### Test Full Pipeline (Integration)

```typescript
describe('orderProcessingPipeline', () => {
  it('flows data through all stages', async () => {
    const output = await Effect.runPromise(orderProcessingPipeline(testOrderId).pipe(Effect.provide(TestLayer)));

    expect(output.orderId).toBe(testOrderId);
    expect(output.notificationsSent).toBeGreaterThan(0);
  });
});
```
