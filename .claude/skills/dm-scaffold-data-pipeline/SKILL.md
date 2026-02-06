---
name: dm-scaffold-data-pipeline
description: Create typed data pipeline with clear architectural seams between components.
model: opus
---

# Scaffold Data Pipeline

Creates typed data pipeline with clear architectural seams between components.

## Usage

```
/scaffold-data-pipeline <PipelineName> --stages <stage1,stage2,stage3,...>
```

## Arguments

- `PipelineName`: The name of the pipeline (e.g., `OrderProcessing`, `BillingPipeline`)
- `--stages`: Comma-separated stage names (e.g., `load,process,persist`)

## When to Use

Use when:

- Breaking a monolithic process into independent components
- Defining clear interfaces between pipeline stages
- Enabling independent deployment, testing, or scaling of components
- Making pure business logic separable from I/O

## Output

### Pipeline Types (Seams)

```typescript
// pipeline/order-processing.types.ts
import { Schema as S, Effect } from 'effect';
import { Order, Customer } from '../domain/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Loaded Data (output of Loader)
// ─────────────────────────────────────────────────────────────────────────────

export class LoadedOrderData extends S.Class<LoadedOrderData>('LoadedOrderData')({
  order: Order,
  customer: Customer,
  loadedAt: S.DateFromSelf,
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Processed Result (output of Core logic)
// ─────────────────────────────────────────────────────────────────────────────

export class ProcessedOrderResult extends S.Class<ProcessedOrderResult>('ProcessedOrderResult')({
  order: Order,
  decisions: S.Array(BillingDecision),
  calculatedTotal: Money,
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Persisted Output (output of Persister)
// ─────────────────────────────────────────────────────────────────────────────

export class PersistedOrderOutput extends S.Class<PersistedOrderOutput>('PersistedOrderOutput')({
  orderId: OrderId,
  persistedAt: S.DateFromSelf,
  notificationsSent: S.Number,
}) {}
```

### Pipeline Components

```typescript
// pipeline/order-processing.pipeline.ts
import { Effect } from 'effect';
import { LoadedOrderData, ProcessedOrderResult, PersistedOrderOutput } from './order-processing.types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Component 1: Loader (async I/O)
// ─────────────────────────────────────────────────────────────────────────────

export const loadOrderData = (orderId: OrderId): Effect.Effect<LoadedOrderData, LoaderError> =>
  Effect.gen(function* () {
    const order = yield* OrderRepository.find(orderId);
    const customer = yield* CustomerRepository.find(order.customerId);
    return new LoadedOrderData({
      order,
      customer,
      loadedAt: new Date(),
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Component 2: Core Logic (PURE - no I/O!)
// ─────────────────────────────────────────────────────────────────────────────

export const processOrder = (data: LoadedOrderData): ProcessedOrderResult => {
  const decisions = calculateBillingDecisions(data.order, data.customer);
  const total = calculateTotal(data.order, decisions);
  return new ProcessedOrderResult({
    order: data.order,
    decisions,
    calculatedTotal: total,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Component 3: Persister (async I/O)
// ─────────────────────────────────────────────────────────────────────────────

export const persistOrderResult = (result: ProcessedOrderResult): Effect.Effect<PersistedOrderOutput, PersisterError> =>
  Effect.gen(function* () {
    yield* OrderRepository.updateTotal(result.order.id, result.calculatedTotal);
    const notificationCount = yield* NotificationService.sendAll(result.decisions);
    return new PersistedOrderOutput({
      orderId: result.order.id,
      persistedAt: new Date(),
      notificationsSent: notificationCount,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Composition
// ─────────────────────────────────────────────────────────────────────────────

export const orderProcessingPipeline = (orderId: OrderId) =>
  loadOrderData(orderId).pipe(
    Effect.map(processOrder), // Pure transformation
    Effect.flatMap(persistOrderResult),
  );
```

## Architectural Benefits

| Benefit                    | Description                               |
| -------------------------- | ----------------------------------------- |
| **Independent deployment** | Each component can be deployed separately |
| **Parallel development**   | Teams work on different components        |
| **Testing isolation**      | Test pure logic without mocks             |
| **Technology flexibility** | Each component can use different tech     |
| **Scaling options**        | Scale components independently            |

## Test Template

```typescript
describe('Order Processing Pipeline', () => {
  describe('processOrder (pure core)', () => {
    it('calculates decisions without I/O', () => {
      const loadedData = new LoadedOrderData({
        order: testOrder,
        customer: testCustomer,
        loadedAt: new Date(),
      });

      const result = processOrder(loadedData);

      expect(result.decisions).toHaveLength(2);
      expect(result.calculatedTotal).toBe(Money(150));
    });
  });

  describe('pipeline composition', () => {
    it('flows data through all stages', async () => {
      const output = await Effect.runPromise(
        orderProcessingPipeline(testOrderId).pipe(Effect.provide(TestRepositories)),
      );

      expect(output.orderId).toBe(testOrderId);
      expect(output.notificationsSent).toBeGreaterThan(0);
    });
  });
});
```

## References

- [guide.md](guide.md) — Extended guide: storytelling with types, architectural seams, semantic wrappers integration, naming conventions, Three Phases vs Pipeline
