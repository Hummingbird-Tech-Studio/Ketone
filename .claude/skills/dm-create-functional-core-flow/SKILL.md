---
name: dm-create-functional-core-flow
description: Create a Three Phases pattern implementation (Collection-Logic-Persistence). Use for I/O-separated flows.
model: opus
---

# Create Functional Core Flow

Creates a Three Phases pattern implementation (Collection → Logic → Persistence).

## Usage

```
/create-functional-core-flow <FlowName> --collect <data-fields> --logic <pure-function> --persist <output>
```

## Arguments

- `FlowName`: The flow name in camelCase (e.g., `processLateFees`, `createOrder`)
- `--collect`: Data fields to collect from I/O sources
- `--logic`: Pure function that processes the collected data
- `--persist`: Output to persist

## The Three Phases Pattern

Separate I/O from pure logic to improve testability, clarity, and debugging.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. COLLECTION  │ -> │    2. LOGIC     │ -> │  3. PERSISTENCE │
│   (The "How")   │    │   (The "What")  │    │  (The "Where")  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
   Effect with I/O       Pure functions         Effect with I/O
```

## When to Use

Use the Three Phases pattern when:

- Business logic is complex enough to warrant isolation
- You want to test logic independently of I/O
- Multiple data sources need to be combined before processing
- The same logic might be used with different data sources

For simple operations (CRUD with minimal logic), this pattern may be overkill.

## Output

### Complete Three Phases Implementation

```typescript
// services/late-fee.service.ts
import { Effect, Schema as S } from 'effect';
import { CustomerRepository } from '../../customer/repositories/customer.repository.js';
import { InvoiceRepository } from '../../invoice/repositories/invoice.repository.js';
import { ContractsApi } from '../../contracts/api/contracts.api.js';
import { LateFeeRepository } from '../repositories/late-fee.repository.js';
import { LateFee, LateFeeId } from '../late-fee.model.js';
import { Customer, CustomerId } from '../../customer/customer.model.js';
import { PaymentTerms } from '../../contracts/contracts.model.js';
import { Percentage } from '../../shared/quantities.js';

// ============================================================================
// DATA TYPE: What the logic needs (collected at boundaries)
// ============================================================================

/**
 * BillingData
 *
 * All data needed by the pure logic, collected from various sources.
 * This is the "contract" between collection and logic phases.
 */
class BillingData extends S.Class<BillingData>('BillingData')({
  customer: Customer,
  terms: PaymentTerms,
  feeRate: Percentage,
  today: S.DateFromSelf,
}) {}

// ============================================================================
// PHASE 1: COLLECTION (Shell - Top)
// ============================================================================

/**
 * collectBillingData
 *
 * Gather all data needed for the logic.
 * This is the only place I/O happens for data gathering.
 */
const collectBillingData = (
  customerId: CustomerId,
): Effect.Effect<BillingData, CustomerNotFoundError | ContractsApiError | FeeRateNotFoundError> =>
  Effect.gen(function* () {
    // Parallel I/O - all independent fetches
    const [customer, terms, feeRate] = yield* Effect.all([
      CustomerRepository.find(customerId),
      ContractsApi.getTerms(customerId),
      FeeRatesRepository.getRate(customerId),
    ]);

    // Combine into the data structure logic needs
    return new BillingData({
      customer,
      terms,
      feeRate,
      today: new Date(),
    });
  });

// ============================================================================
// PHASE 2: PURE LOGIC (Core - Middle)
// ============================================================================

/**
 * calculateLateFee
 *
 * Pure function: all inputs are parameters, no I/O.
 * This is the heart of the business logic.
 *
 * Easy to test: just call with different BillingData inputs.
 */
const calculateLateFee = (data: BillingData): LateFee => {
  const feeAmount = data.customer.balance * (data.feeRate / 100);
  const dueDate = addDays(data.today, data.terms.days);

  return new LateFee({
    id: generateId() as LateFeeId,
    customerId: data.customer.id,
    amount: feeAmount,
    dueDate,
    status: 'Pending',
  });
};

// ============================================================================
// PHASE 3: PERSISTENCE (Shell - Bottom)
// ============================================================================

/**
 * persistLateFee
 *
 * Save the result to the database.
 * This is the only place I/O happens for persistence.
 */
const persistLateFee = (fee: LateFee): Effect.Effect<void, PersistenceError> => LateFeeRepository.save(fee);

// ============================================================================
// COMPOSITION
// ============================================================================

/**
 * processLateFee
 *
 * The complete flow, composed from the three phases.
 * Clear structure: collect → transform → persist
 */
export const processLateFee = (customerId: CustomerId) =>
  collectBillingData(customerId).pipe(Effect.map(calculateLateFee), Effect.flatMap(persistLateFee));

// Alternative with Effect.gen for more complex flows:
export const processLateFeeVerbose = (customerId: CustomerId) =>
  Effect.gen(function* () {
    // COLLECTION
    const data = yield* collectBillingData(customerId);

    // LOGIC (pure - could be extracted for testing)
    const fee = calculateLateFee(data);

    // PERSISTENCE
    yield* persistLateFee(fee);

    return fee;
  });
```

### The Sandwich Pattern

Think of your code as a sandwich: the "bread" (shell) handles I/O, the "filling" (core) is pure logic.

```
┌─────────────────────────────────────────────────────┐
│                    SHELL (Top)                       │
│  - Load data from repositories                       │
│  - Call external APIs                                │
│  - Get current time, random values                   │
│  - Transform external DTOs → domain types            │
├─────────────────────────────────────────────────────┤
│                    CORE (Pure)                       │
│  - Business decisions                                │
│  - Calculations and transformations                  │
│  - Pattern matching on domain types                  │
│  - NO I/O, NO side effects                           │
├─────────────────────────────────────────────────────┤
│                    SHELL (Bottom)                    │
│  - Persist results to database                       │
│  - Send notifications                                │
│  - Transform domain types → external DTOs            │
│  - Emit events                                       │
└─────────────────────────────────────────────────────┘
```

### Complex Flow with Multiple Decisions

```typescript
// services/order-processing.service.ts

// Data structure for collected data
class OrderProcessingData extends S.Class<OrderProcessingData>('OrderProcessingData')({
  order: Order,
  customer: Customer,
  inventory: InventoryStatus,
  shippingRates: ShippingRates,
  today: S.DateFromSelf,
}) {}

// PHASE 1: Collection
const collectOrderData = (orderId: OrderId) =>
  Effect.gen(function* () {
    const order = yield* OrderRepository.find(orderId);
    const [customer, inventory, shippingRates] = yield* Effect.all([
      CustomerService.find(order.customerId),
      InventoryService.checkAvailability(order.items),
      ShippingApi.getRates(order.shippingAddress),
    ]);

    return new OrderProcessingData({
      order,
      customer,
      inventory,
      shippingRates,
      today: new Date(),
    });
  });

// PHASE 2: Pure logic (returns a decision ADT)
const decideOrderAction = (data: OrderProcessingData): OrderDecision => {
  // Check inventory
  if (!data.inventory.allAvailable) {
    return OrderDecision.Backorder({
      orderId: data.order.id,
      unavailableItems: data.inventory.unavailable,
    });
  }

  // Check customer credit
  const total = calculateTotal(data.order, data.shippingRates);
  if (total > data.customer.creditLimit) {
    return OrderDecision.RequiresApproval({
      orderId: data.order.id,
      amount: total,
      creditLimit: data.customer.creditLimit,
    });
  }

  // All good - fulfill
  return OrderDecision.Fulfill({
    orderId: data.order.id,
    items: data.order.items,
    shippingMethod: selectBestShipping(data.shippingRates),
    estimatedDelivery: calculateDeliveryDate(data.today, data.shippingRates),
  });
};

// PHASE 3: Persistence (interpret the decision)
const executeOrderDecision = (decision: OrderDecision) =>
  OrderDecision.$match(decision, {
    Fulfill: ({ orderId, items, shippingMethod }) =>
      Effect.gen(function* () {
        yield* InventoryService.reserve(items);
        yield* OrderRepository.updateStatus(orderId, 'Fulfilling');
        yield* ShippingService.createShipment(orderId, shippingMethod);
      }),
    Backorder: ({ orderId, unavailableItems }) =>
      Effect.gen(function* () {
        yield* OrderRepository.updateStatus(orderId, 'Backordered');
        yield* NotificationService.sendBackorderNotice(orderId, unavailableItems);
      }),
    RequiresApproval: ({ orderId, amount }) =>
      Effect.gen(function* () {
        yield* OrderRepository.updateStatus(orderId, 'PendingApproval');
        yield* ApprovalService.requestApproval(orderId, amount);
      }),
  });

// Composition
export const processOrder = (orderId: OrderId) =>
  collectOrderData(orderId).pipe(Effect.map(decideOrderAction), Effect.flatMap(executeOrderDecision));
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import { calculateLateFee, BillingData, processLateFee } from './late-fee.service.js';

describe('Late Fee Processing', () => {
  // ========================================================
  // PHASE 2 TESTS: Pure logic (no mocks needed!)
  // ========================================================

  describe('calculateLateFee (pure logic)', () => {
    it('calculates fee correctly for 5% rate', () => {
      const data = new BillingData({
        customer: new Customer({
          id: 'cust-123' as CustomerId,
          balance: 1000,
          // ...
        }),
        terms: new PaymentTerms({ days: 30 }),
        feeRate: Percentage(5),
        today: new Date('2025-01-01'),
      });

      const fee = calculateLateFee(data);

      expect(fee.amount).toBe(50); // 1000 * 0.05
      expect(fee.dueDate).toEqual(new Date('2025-01-31'));
    });

    it('calculates fee correctly for zero balance', () => {
      const data = new BillingData({
        customer: new Customer({
          id: 'cust-123' as CustomerId,
          balance: 0,
          // ...
        }),
        terms: new PaymentTerms({ days: 30 }),
        feeRate: Percentage(5),
        today: new Date('2025-01-01'),
      });

      const fee = calculateLateFee(data);

      expect(fee.amount).toBe(0);
    });

    it.each([
      [100, 5, 5], // 100 balance, 5% rate = 5
      [1000, 10, 100], // 1000 balance, 10% rate = 100
      [500, 2.5, 12.5], // 500 balance, 2.5% rate = 12.5
    ])('calculates fee for balance=%d, rate=%d%% = %d', (balance, rate, expected) => {
      const data = new BillingData({
        customer: new Customer({ id: 'cust-123' as CustomerId, balance }),
        terms: new PaymentTerms({ days: 30 }),
        feeRate: Percentage(rate),
        today: new Date('2025-01-01'),
      });

      expect(calculateLateFee(data).amount).toBe(expected);
    });
  });

  // ========================================================
  // INTEGRATION TESTS: Full flow (with test implementations)
  // ========================================================

  describe('processLateFee (integration)', () => {
    it('processes late fee end-to-end', async () => {
      // Use test implementations of repositories
      const TestLayer = Layer.mergeAll(
        TestCustomerRepository,
        TestContractsApi,
        TestFeeRatesRepository,
        TestLateFeeRepository,
      );

      const result = await Effect.runPromise(
        processLateFee('cust-123' as CustomerId).pipe(Effect.provide(TestLayer), Effect.either),
      );

      expect(Either.isRight(result)).toBe(true);
    });
  });
});
```

## Anti-Pattern: Mixed Phases

```typescript
// ❌ I/O mixed with logic - hard to test, hard to reason about
const buildLateFee = (customerId: CustomerId) =>
  Effect.gen(function* () {
    const today = new Date();                          // COLLECTION
    const customer = yield* CustomerRepo.find(id);     // COLLECTION
    const terms = yield* ContractsApi.getTerms(id);    // COLLECTION
    const rate = yield* FeesRepo.getRate(id);          // COLLECTION

    // Business logic buried in I/O noise
    const fee = customer.balance * rate;               // LOGIC
    const dueDate = addDays(today, terms);             // LOGIC

    yield* LateFeeRepo.save(new LateFee({ ... }));     // PERSISTENCE
  });
```

Problems:

- Can't test business logic without mocking I/O
- Hard to see what the logic actually does
- Can't reuse logic in different contexts

## Benefits

| Benefit         | Description                                                |
| --------------- | ---------------------------------------------------------- |
| **Testability** | Pure logic is trivial to test (no mocks needed)            |
| **Clarity**     | Each function does exactly one thing                       |
| **Debugging**   | Easy to identify if problem is data, logic, or persistence |
| **Reusability** | Logic can be used with different data sources              |
| **Atomicity**   | Side effects can be batched together                       |

## References

- functional-domain-modeling.md#1739-1882 (The Three Phases Pattern)
- functional-domain-modeling.md#1751-1775 (The Sandwich Pattern)
- functional-domain-modeling.md#1807-1831 (Anti-pattern: Mixed Phases)
- functional-domain-modeling.md#93-172 (Determinism: The Core Principle)
