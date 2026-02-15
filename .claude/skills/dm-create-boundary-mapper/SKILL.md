---
name: dm-create-boundary-mapper
description: Create bidirectional mappers between domain types and external DTOs. Use for system boundary integration.
model: opus
---

# Create Boundary Mapper

Creates bidirectional mappers between domain types and external DTOs at system boundaries.

## Usage

```
/create-boundary-mapper <MapperName> --domain <DomainType> --external <ExternalType>
```

## Arguments

- `MapperName`: The mapper name in PascalCase (e.g., `InvoiceEntityMapper`)
- `--domain`: The domain type (e.g., `LateFee`)
- `--external`: The external DTO type (e.g., `InvoiceEntity`)

## When to Use

Create boundary mappers when:

- Integrating with existing systems (databases, APIs, legacy services)
- External data structures differ from domain types
- You need to validate external data when entering the domain
- You want to isolate external structure changes from domain code

## The Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    Your Domain                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   LateFee   │  │  Customer   │  │   Money     │             │
│  │ (semantic)  │  │ (semantic)  │  │ (semantic)  │             │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘             │
│         │                │                                       │
│         ▼                ▼                                       │
│  ┌────────────────────────────────────┐                         │
│  │         Mapping Layer              │                         │
│  │  toInvoiceEntity(), fromEntity()   │                         │
│  └────────────────┬───────────────────┘                         │
│                   │                                              │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              External Systems                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │InvoiceEntity│  │CustomerEntity│ │Legacy APIs  │             │
│  │   (DTO)     │  │   (DTO)     │  │   (DTO)     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Output

### Full Mapper Implementation

```typescript
// mappers/invoice-entity.mapper.ts
import { Effect, Schema as S, ParseResult } from 'effect';
import { LateFee, LateFeeId, LateFeeStatusSchema } from '../late-fee.model.js';
import { CustomerId } from '../../shared/ids.js';
import { Money } from '../../shared/money.js';

/**
 * InvoiceEntity
 *
 * External entity from the legacy system.
 * Treated as a DTO - no domain behavior.
 */
export interface InvoiceEntity {
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  dueDate: string; // ISO date string
  status: string;
  // ... many other fields we don't care about
}

/**
 * fromInvoiceEntity
 *
 * External → Domain (with validation)
 * May fail if external data doesn't meet domain invariants.
 */
export const fromInvoiceEntity = (entity: InvoiceEntity): Effect.Effect<LateFee, ParseResult.ParseError> =>
  S.decodeUnknown(LateFee)({
    id: entity.invoiceId,
    customerId: entity.customerId,
    amount: { value: entity.amount, currency: entity.currency },
    dueDate: new Date(entity.dueDate),
    status: 'Pending', // Map to domain status
  });

/**
 * toInvoiceEntity
 *
 * Domain → External (always succeeds)
 * Pure function, no validation needed.
 */
export const toInvoiceEntity = (fee: LateFee): InvoiceEntity => ({
  invoiceId: fee.id,
  customerId: fee.customerId,
  amount: fee.amount.value,
  currency: fee.amount.currency,
  dueDate: fee.dueDate.toISOString(),
  status: fee.status,
});
```

### Mapper with Explicit Error Handling

```typescript
// mappers/customer-entity.mapper.ts
import { Effect } from 'effect';
import { EnrichedCustomer, CustomerRating } from '../customer.model.js';
import { CustomerId } from '../../shared/ids.js';
import { InvalidCustomerDataError } from '../errors.js';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'MXN'] as const;

/**
 * fromCustomerEntity
 *
 * External → Domain with explicit validation.
 * When the external world doesn't match your model, make the friction explicit.
 */
export const fromCustomerEntity = (entity: CustomerEntity): Effect.Effect<EnrichedCustomer, InvalidCustomerDataError> =>
  Effect.gen(function* () {
    // Validate required fields
    if (entity.rating == null) {
      return yield* Effect.fail(
        new InvalidCustomerDataError({
          field: 'rating',
          message: 'Rating is required',
        }),
      );
    }

    // Validate constraints
    if (!SUPPORTED_CURRENCIES.includes(entity.preferredCurrency as any)) {
      return yield* Effect.fail(
        new InvalidCustomerDataError({
          field: 'currency',
          message: `Unsupported currency: ${entity.preferredCurrency}`,
        }),
      );
    }

    // Construct the rich type
    return new EnrichedCustomer({
      id: CustomerId(entity.id),
      rating: entity.rating as CustomerRating,
      currency: entity.preferredCurrency as (typeof SUPPORTED_CURRENCIES)[number],
    });
  });

/**
 * toCustomerEntity
 *
 * Domain → External (always succeeds)
 */
export const toCustomerEntity = (customer: EnrichedCustomer): CustomerEntity => ({
  id: customer.id,
  rating: customer.rating,
  preferredCurrency: customer.currency,
  // Map other fields...
});
```

### Database Record Mapper

```typescript
// mappers/cycle-record.mapper.ts
import { Effect, Option, Schema as S, ParseResult } from 'effect';
import { Cycle, CycleId, CycleStatusSchema } from '../cycle.model.js';
import { UserId } from '../../shared/ids.js';

/**
 * CycleRecord
 *
 * Database record from Drizzle.
 * Note: Drizzle returns Date objects, so use S.DateFromSelf.
 */
export interface CycleRecord {
  id: string;
  userId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema for validating database records.
 * Use S.DateFromSelf since Drizzle returns JavaScript Date objects.
 */
const CycleRecordSchema = S.Struct({
  id: CycleId,
  userId: UserId,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

/**
 * fromCycleRecord
 *
 * Database record → Domain entity
 */
export const fromCycleRecord = (record: CycleRecord): Effect.Effect<Cycle, ParseResult.ParseError> =>
  S.decodeUnknown(Cycle)(record);

/**
 * toCycleRecord
 *
 * Domain entity → Database record (for inserts/updates)
 */
export const toCycleRecord = (cycle: Cycle): Omit<CycleRecord, 'createdAt' | 'updatedAt'> => ({
  id: cycle.id,
  userId: cycle.userId,
  status: cycle.status,
  startDate: cycle.startDate,
  endDate: cycle.endDate,
});
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import { fromInvoiceEntity, toInvoiceEntity, InvoiceEntity } from './invoice-entity.mapper.js';
import { LateFee } from '../late-fee.model.js';

describe('InvoiceEntityMapper', () => {
  const validEntity: InvoiceEntity = {
    invoiceId: '550e8400-e29b-41d4-a716-446655440000',
    customerId: '550e8400-e29b-41d4-a716-446655440001',
    amount: 100,
    currency: 'USD',
    dueDate: '2025-01-15T00:00:00.000Z',
    status: 'pending',
  };

  describe('fromInvoiceEntity (External → Domain)', () => {
    it('converts valid entity to domain type', async () => {
      const result = await Effect.runPromise(Effect.either(fromInvoiceEntity(validEntity)));
      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.id).toBe(validEntity.invoiceId);
        expect(result.right.amount.value).toBe(100);
      }
    });

    it('fails on invalid entity', async () => {
      const invalidEntity = { ...validEntity, invoiceId: 'not-a-uuid' };
      const result = await Effect.runPromise(Effect.either(fromInvoiceEntity(invalidEntity)));
      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe('toInvoiceEntity (Domain → External)', () => {
    it('converts domain type to entity', () => {
      const lateFee = new LateFee({
        id: '550e8400-e29b-41d4-a716-446655440000' as LateFeeId,
        customerId: '550e8400-e29b-41d4-a716-446655440001' as CustomerId,
        amount: new Money({ value: 100, currency: 'USD' }),
        dueDate: new Date('2025-01-15'),
        status: 'Pending',
      });

      const entity = toInvoiceEntity(lateFee);

      expect(entity.invoiceId).toBe(lateFee.id);
      expect(entity.amount).toBe(100);
      expect(entity.currency).toBe('USD');
    });
  });

  describe('roundtrip', () => {
    it('domain → DTO → domain preserves data', async () => {
      const original = new LateFee({
        id: '550e8400-e29b-41d4-a716-446655440000' as LateFeeId,
        customerId: '550e8400-e29b-41d4-a716-446655440001' as CustomerId,
        amount: new Money({ value: 100, currency: 'USD' }),
        dueDate: new Date('2025-01-15'),
        status: 'Pending',
      });

      const dto = toInvoiceEntity(original);
      const restored = await Effect.runPromise(fromInvoiceEntity(dto));

      expect(restored.id).toEqual(original.id);
      expect(restored.amount.value).toEqual(original.amount.value);
    });
  });
});
```

## Benefits

1. **Freedom to design**: Your domain isn't constrained by external schemas
2. **Isolation**: Changes to external systems don't ripple through your code
3. **Testability**: Test your domain with clean types, mock the mapping layer
4. **Gradual adoption**: Introduce clean types incrementally without big rewrites

## Principle

> Validate at the boundary, trust inside.

- External → Domain: Validate with Effect (may fail)
- Domain → External: Pure function (always succeeds)
- Inside the domain: No defensive validation needed

## Web: API Response → Domain

When used in the web package, boundary mappers typically convert `@ketone/shared` response schemas (DTOs) into domain entities with branded IDs. The gateway service (`dm-create-gateway-service`) applies these mappers at the HTTP boundary.

### Example: Plan Response → Domain Plan

```typescript
// In web/src/views/plan/services/plan.service.ts (gateway service)
import type { PlanResponse } from '@ketone/shared'; // Wire-format DTO (not a domain type — just the JSON shape)
import { PlanId, PeriodId, FastingDuration, EatingWindow } from '../domain'; // Domain types

/**
 * fromPlanResponse
 *
 * API DTO → Domain Entity
 * Applied inside the gateway service. Actor/composable never see the DTO.
 */
const fromPlanResponse = (dto: PlanResponse): Plan => ({
  id: PlanId(dto.id), // string → branded PlanId
  name: dto.name,
  status: dto.status as PlanStatus,
  startDate: new Date(dto.startDate), // ISO string → Date
  periods: dto.periods.map(fromPeriodResponse),
  createdAt: new Date(dto.createdAt),
});

const fromPeriodResponse = (dto: PeriodResponse): Period => ({
  id: PeriodId(dto.id),
  fastingDuration: FastingDuration(dto.fastingDurationHours), // number → branded
  eatingWindow: EatingWindow(dto.eatingWindowHours),
  startDate: new Date(dto.startDate),
  endDate: new Date(dto.endDate),
});

/**
 * toCreatePlanPayload
 *
 * Domain → API Payload (pure, always succeeds)
 */
const toCreatePlanPayload = (input: CreatePlanDomainInput) => ({
  name: input.name,
  startDate: input.startDate.toISOString(),
  periods: input.periods.map((p) => ({
    fastingDurationHours: p.fastingDuration, // branded → number (transparent)
    eatingWindowHours: p.eatingWindow,
  })),
});
```

### Asymmetric Trust (Web Context)

| Direction             | Trust Level                          | Validation                                     |
| --------------------- | ------------------------------------ | ---------------------------------------------- |
| API Response → Domain | **External** (validate on decode)    | `Brand.refined`, date parsing, enum mapping    |
| Domain → API Payload  | **Internal** (pure, always succeeds) | No validation — domain types are already valid |
| Actor → Composable    | **Internal** (trusted)               | Domain types passed through                    |
| Component → Actor     | **External** (validate via Schema)   | Input schemas in composable                    |

### Checklist (Web Boundary Mapping)

- [ ] `@ketone/shared` response schema is the DTO — never exposed past gateway
- [ ] Branded types (`PlanId`, `FastingDuration`) applied during `from*Response` decode
- [ ] Dates parsed from ISO strings in `from*Response`
- [ ] Enum values mapped to domain literals
- [ ] `to*Payload` is pure — always succeeds, no validation
- [ ] Gateway service methods return domain types, never DTOs
- [ ] Actor context and events use domain types from mapper output

## References

- [guide.md](guide.md) — Extended guide: 5 validation layers, branded types at boundaries, asymmetric trust model, repository mappers, error mapping
