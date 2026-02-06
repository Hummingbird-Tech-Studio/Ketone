---
name: dm-scaffold-domain-module
description: Create the base directory structure for a new domain module following functional patterns.
model: opus
---

# Scaffold Domain Module

Creates the base directory structure for a new domain module following the functional domain modeling patterns.

## Usage

```
/scaffold-domain-module <module-name>
```

## Arguments

- `module-name`: The name of the module in kebab-case (e.g., `cycle`, `fasting-stage`, `late-fee`)

## Output Structure

```
{module}/
├── {module}.model.ts           # Entity, Value Objects, Enums, ADTs
├── contracts/
│   └── index.ts                # Barrel exports for contracts
├── services/
│   └── index.ts                # Barrel exports for services
├── errors.ts                   # Domain errors
└── index.ts                    # Module barrel exports
```

## Generated Files

### {module}.model.ts

```typescript
/**
 * {ModuleName} Domain Model
 *
 * This file contains:
 * - Entity: Main domain entity with identity
 * - Value Objects: Immutable types without identity
 * - Enums: Finite sets of values (S.Literal)
 * - ADTs: Discriminated unions with variant data (Data.TaggedEnum)
 */
import { Data, Schema as S } from 'effect';

// ============================================================================
// Branded Types (IDs specific to this module)
// ============================================================================

// Example: Module-specific ID
// export const {ModuleName}Id = S.UUID.pipe(S.brand('{ModuleName}Id'));
// export type {ModuleName}Id = S.Schema.Type<typeof {ModuleName}Id>;

// ============================================================================
// Enums (S.Literal)
// ============================================================================

// Example: Status enum
// export const {ModuleName}StatusSchema = S.Literal('Active', 'Completed');
// export type {ModuleName}Status = S.Schema.Type<typeof {ModuleName}StatusSchema>;

// ============================================================================
// Value Objects (S.Class)
// ============================================================================

// Example: Value object with validation
// export class {ValueObject} extends S.Class<{ValueObject}>('{ValueObject}')(
//   S.Struct({
//     field: S.String,
//   })
// ) {}

// ============================================================================
// Entity
// ============================================================================

// Example: Main entity
// export class {ModuleName} extends S.Class<{ModuleName}>('{ModuleName}')({
//   id: {ModuleName}Id,
//   // ... other fields
// }) {}

// ============================================================================
// ADTs (Data.TaggedEnum)
// ============================================================================

// Example: Assessment/Result ADT
// export type {ModuleName}Assessment = Data.TaggedEnum<{
//   Success: { readonly result: Result };
//   Failure: { readonly reason: string };
// }>;
// export const {ModuleName}Assessment = Data.taggedEnum<{ModuleName}Assessment>();
// export const { $is, $match } = {ModuleName}Assessment;
```

### contracts/index.ts

```typescript
/**
 * {ModuleName} Contracts
 *
 * Use-case inputs and outputs. These define:
 * - What data enters a use case (Input)
 * - What decisions/results exit a use case (Output/Decision)
 *
 * Contracts change when the operation interface changes,
 * NOT when the domain model changes.
 */

// Re-export all contracts
// export * from './create-{module}.js';
// export * from './update-{module}.js';
```

### services/index.ts

```typescript
/**
 * {ModuleName} Services
 *
 * Domain services using Effect.Service pattern.
 * Services contain business logic that operates on domain types.
 */

// Re-export all services
// export * from './{module}.service.js';
// export * from './{module}.validation.service.js';
```

### errors.ts

```typescript
/**
 * {ModuleName} Domain Errors
 *
 * Typed errors for domain rule violations.
 * Use Data.TaggedError for structured error handling.
 */
import { Data } from 'effect';

// Example domain errors:
// export class {ModuleName}NotFoundError extends Data.TaggedError('{ModuleName}NotFoundError')<{
//   readonly id: {ModuleName}Id;
// }> {}

// export class Invalid{ModuleName}Error extends Data.TaggedError('Invalid{ModuleName}Error')<{
//   readonly reason: string;
// }> {}
```

### index.ts

```typescript
/**
 * {ModuleName} Module
 *
 * Barrel exports for the {module-name} domain module.
 */
export * from './{module}.model.js';
export * from './contracts/index.js';
export * from './services/index.js';
export * from './errors.js';
```

## Implementation Steps

1. Create the module directory at the appropriate location (e.g., `packages/cycle-domain/src/{module}/`)
2. Create each file with the template content above
3. Replace `{module}` with the kebab-case module name
4. Replace `{ModuleName}` with the PascalCase module name
5. Uncomment and customize the example code as needed

## Cohesion Principle

> Things that change together, live together.

- Module-specific IDs (e.g., `CycleId`) live in `{module}.model.ts`
- Shared IDs (e.g., `UserId`) live in `shared/ids.ts`
- Validation services live in `services/` with their domain module
- Domain errors live in `errors.ts` with their domain module

## The Orphan Test

> If I delete this module, what becomes orphaned?

Everything that would become orphaned belongs inside the module. Apply this test to every type, error, and helper when deciding where code belongs.

## Example

```bash
/scaffold-domain-module late-fee
```

Creates:

```
late-fee/
├── late-fee.model.ts
├── contracts/
│   └── index.ts
├── services/
│   └── index.ts
├── errors.ts
└── index.ts
```

## References

- functional-domain-modeling.md#1896-2014 (Service Architecture)
- functional-domain-modeling.md#2003-2014 (Cohesion Principle)
