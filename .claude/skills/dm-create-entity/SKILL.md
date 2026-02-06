---
name: dm-create-entity
description: Create a domain entity using S.Class with identity field. Use for types with lifecycle and identity.
model: opus
---

# Create Entity

Creates a domain entity using `S.Class` with an identity field (ID).

## Usage

```
/create-entity <EntityName> --id <IdType> --fields <field1:type1,field2:type2,...>
```

## Arguments

- `EntityName`: The name in PascalCase (e.g., `Cycle`, `User`, `Order`)
- `--id`: The ID type (e.g., `CycleId`, `UserId`)
- `--fields`: Comma-separated field definitions

## When to Use

Use entities when:

- The type has **identity** that persists over time
- Two instances with the same ID are considered the same entity
- The entity's lifecycle matters (created, updated, deleted)
- You need to track the entity across time/operations

Entity vs Value Object:

- **Entity**: Has identity (ID), lifecycle matters, two with same data but different IDs are different
- **Value Object**: No identity, equality is purely structural, interchangeable if same values

## Output

### Basic Entity

```typescript
import { Schema as S } from 'effect';
import { UserId } from '../shared/ids.js';

/**
 * Cycle Entity
 *
 * Represents a fasting cycle with identity.
 * Two cycles with the same ID are the same entity.
 */

// Module-specific ID (lives with the entity if orphaned when module deleted)
export const CycleId = S.UUID.pipe(S.brand('CycleId'));
export type CycleId = S.Schema.Type<typeof CycleId>;

// Status enum
export const CycleStatusSchema = S.Literal('InProgress', 'Completed');
export type CycleStatus = S.Schema.Type<typeof CycleStatusSchema>;

// Entity
export class Cycle extends S.Class<Cycle>('Cycle')({
  id: CycleId,
  userId: UserId,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {}
```

### Entity with Embedded Value Object

```typescript
import { Schema as S } from 'effect';
import { DateRange } from '../shared/date-range.js';

export class Cycle extends S.Class<Cycle>('Cycle')({
  id: CycleId,
  userId: UserId,
  status: CycleStatusSchema,
  range: DateRange, // Embedded value object
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {
  /** Convenience accessor for start date */
  get startDate(): Date {
    return this.range.start;
  }

  /** Convenience accessor for end date */
  get endDate(): Date {
    return this.range.end;
  }
}
```

### Entity with Computed Properties

```typescript
export class User extends S.Class<User>('User')({
  id: UserId,
  email: EmailSchema,
  firstName: S.String,
  lastName: S.String,
  role: S.Literal('Admin', 'User', 'Guest'),
  createdAt: S.DateFromSelf,
}) {
  /** Full name computed from first and last */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /** Check if user has admin privileges */
  get isAdmin(): boolean {
    return this.role === 'Admin';
  }
}
```

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { Effect, Equal, Schema as S } from 'effect';
import { Cycle, CycleId } from './{module}.model.js';

describe('Cycle Entity', () => {
  const validCycle = {
    id: '550e8400-e29b-41d4-a716-446655440000' as CycleId,
    userId: '550e8400-e29b-41d4-a716-446655440001',
    status: 'InProgress' as const,
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-01-02'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('construction', () => {
    it('creates valid entity', () => {
      const cycle = new Cycle(validCycle);
      expect(cycle.id).toBe(validCycle.id);
      expect(cycle.status).toBe('InProgress');
    });

    it('rejects invalid status', () => {
      expect(() => new Cycle({ ...validCycle, status: 'Invalid' as any })).toThrow();
    });
  });

  describe('identity', () => {
    it('entities with same ID are equal', () => {
      const cycle1 = new Cycle(validCycle);
      const cycle2 = new Cycle(validCycle);
      expect(Equal.equals(cycle1, cycle2)).toBe(true);
    });

    it('entities with different IDs are not equal', () => {
      const cycle1 = new Cycle(validCycle);
      const cycle2 = new Cycle({
        ...validCycle,
        id: '550e8400-e29b-41d4-a716-446655440099' as CycleId,
      });
      expect(Equal.equals(cycle1, cycle2)).toBe(false);
    });
  });

  describe('schema validation', () => {
    it('validates from unknown', async () => {
      const result = await Effect.runPromise(S.decodeUnknown(Cycle)(validCycle));
      expect(result).toBeInstanceOf(Cycle);
    });
  });
});
```

## Separate Data from Behavior

Keep entities as pure data structures. Put behavior in separate services or functions:

```typescript
// Entity (data only)
class Cycle extends S.Class<Cycle>('Cycle')({
  id: CycleId,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  status: CycleStatusSchema,
}) {}

// Derived values (pure functions or in service)
const elapsedHours = (cycle: Cycle, now: Date): number => ...
const canComplete = (cycle: Cycle): boolean => ...
const getCurrentStage = (cycle: Cycle, now: Date): FastingStage => ...
```

## Where to Put the ID

Apply the Orphan Test:

> "If I delete this module, does the ID still make sense?"

| ID Type   | Location               | Reason                           |
| --------- | ---------------------- | -------------------------------- |
| `CycleId` | `cycle/cycle.model.ts` | Orphaned if cycle module deleted |
| `UserId`  | `shared/ids.ts`        | Users exist independently        |
