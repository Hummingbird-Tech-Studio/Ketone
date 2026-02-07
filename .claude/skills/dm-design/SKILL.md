---
name: dm-design
description: Generate a Markdown architecture document from technical specs. Creates a reviewable design document before implementing code.
model: opus
---

# Domain Design Generator

Generate a comprehensive Markdown architecture document from technical specifications. This allows human review and approval before code implementation.

## Workflow

```
Technical Spec → domain-analyzer → domain-planner → Markdown Document → Human Review → Implementation
```

## Step 1: Analyze the Specification

Use the **domain-analyzer** agent to extract domain components from the provided specification.

**Invoke with**: The technical document provided by the user.

**Capture the YAML output** containing:

- Entities, Value Objects, Literal Enums, Tagged Enums
- Semantic Wrappers, Domain Errors, Boundary Mappers
- Reified Decisions, Data Seams, Services
- Warning signs and shared types

## Step 2: Plan the Implementation

Use the **domain-planner** agent with the YAML from Step 1.

**Important**: Tell the planner to output the plan YAML only, without executing the skills.

**Capture the plan YAML** containing:

- Shared types (with location, skill, and reason)
- Ordered steps (with skill, file, args, reason)
- Dependency explanations
- Summary of skills and files

## Step 3: Generate the Design Document

Create a Markdown file at `functional-domain-design.md` in the current working directory with the following structure:

````markdown
# Functional Domain Design: {ModuleName}

> **Source**: {spec_description} | **Generated**: {date} | **Status**: Pending Review

## 1. Executive Summary

[2-3 sentence description of the domain being modeled, its purpose, and key characteristics]

## 2. Design Principles

This design adheres to the following functional domain modeling principles:

### 2.1 Closed World Assumption

All possible states are explicitly modeled. The compiler enforces completeness.

| Principle               | Implementation                                                  |
| ----------------------- | --------------------------------------------------------------- |
| Exhaustive matching     | All pattern matches use `Match.exhaustive` - no `default` cases |
| No stringly-typed enums | All enums use `S.Literal` union, never `S.String`               |
| Compile-time safety     | Adding a variant causes compile errors at all switch sites      |
| No hidden states        | No `else` branches that hide bugs                               |

### 2.2 Functional Core / Imperative Shell

Separation of pure business logic from I/O operations.

| Layer                | Responsibility                         | Characteristics                                 |
| -------------------- | -------------------------------------- | ----------------------------------------------- |
| **Functional Core**  | Business logic, validations, decisions | Pure functions, no I/O, deterministic, testable |
| **Imperative Shell** | Database, HTTP, clock, external APIs   | Effect-based, dependency injection              |

> **Clock Rule**: Shell code that needs the current time MUST use `Clock.currentTimeMillis` from Effect,
> never `new Date()`. `new Date()` is an implicit side effect that breaks testability (cannot be controlled
> with `TestClock`). Core functions receive `now: Date` as a parameter — they never access the clock directly.
>
> ```typescript
> // ✅ CORRECT (Shell): use Clock
> const now = new Date(yield * Clock.currentTimeMillis);
> const decision = decideCancellation(periods, now); // pass to Core
>
> // ❌ WRONG (Shell): implicit side effect
> const now = new Date();
> ```

**Core functions in this design**:

- {list pure functions: e.g., "calculateTotal", "assessProgress"}

**Shell operations in this design**:

- {list I/O operations: e.g., "fetchOrder", "persistCycle", "sendNotification"}

### 2.3 Validation Layers

> "Validate at the boundary, trust inside"

The architecture defines **4 mandatory validation layers**:

| Layer                       | Location            | Responsibility                  | Validates                             |
| --------------------------- | ------------------- | ------------------------------- | ------------------------------------- |
| **1. Input Schema**         | Request Schema      | Parse & transform incoming JSON | INPUT (string → Date, etc.)           |
| **2. Domain Validation**    | Functional Core     | Pure business rules             | LOGIC (no I/O)                        |
| **3. Service Coordination** | Application Service | Orchestrate validation + repo   | FLOW (returns typed errors)           |
| **4. Repository Output**    | Repository          | Validate DB returns             | OUTPUT (trust input, validate output) |

**Checklist**:

- [ ] Request schema transforms and validates input before handler
- [ ] Domain validation service contains pure business rules (testable)
- [ ] Application service coordinates validation + repository
- [ ] Repository validates output from DB, trusts input from service

### 2.4 Data Seams

Architectural boundaries where data transforms between layers.

| Seam                 | From            | To            | Transformation |
| -------------------- | --------------- | ------------- | -------------- |
| {e.g., "API→Domain"} | {external type} | {domain type} | {mapper name}  |

## 3. Type Justification

Each type must declare its category and justification using the Decision Flowchart:
````

Is it a single primitive with constraints?
→ YES: Brand.refined (dm-create-branded-type)

Is it multiple fields that always go together?
→ YES: S.Class Value Object (dm-create-value-object)

Are all variants the same shape?
→ YES: S.Literal Enum (dm-create-literal-enum)

Do variants have different data?
→ YES: Data.TaggedEnum (dm-create-tagged-enum)

Does it need identity and lifecycle?
→ YES: S.Class Entity (dm-create-entity)

````

| Type | Category | Skill | Justification |
|------|----------|-------|---------------|
| {UserId} | Brand | `dm-create-branded-type` | Single primitive (string) with UUID constraint |
| {DateRange} | Value Object | `dm-create-value-object` | Multiple fields (start, end) with cross-field validation |
| {CycleStatus} | Literal Enum | `dm-create-literal-enum` | Finite set of labels, all same structure |
| {PaymentResult} | Tagged Enum | `dm-create-tagged-enum` | Variants have different data (Approved: txId, Declined: reason) |
| {Order} | Entity | `dm-create-entity` | Has identity (OrderId) and lifecycle |

**Smart Constructors Required**:

Types with validation MUST have smart constructors (`dm-create-smart-constructors`):

| Type | Validation | Smart Constructor |
|------|------------|-------------------|
| {type with validation} | {validation rule} | `create` (Effect) / `make` (Option) |

## 4. Domain Components

### 4.1 Entities

| Entity | ID Type | Fields | Notes |
|--------|---------|--------|-------|
| {name} | {id_type} | {field_list} | {notes} |

### 4.2 Value Objects

| Value Object | Fields | Validation | Smart Constructor |
|--------------|--------|------------|-------------------|
| {name} | {fields} | {validation} | Yes/No |

### 4.3 Enumerations

#### Literal Enums (same structure for all variants)

| Enum | Values | Metadata Shape | Notes |
|------|--------|----------------|-------|
| {name} | {values} | {metadata_shape or "none"} | {notes} |

#### Tagged Enums (different data per variant)

| Enum | Variants | Notes |
|------|----------|-------|
| {name} | {variant summaries} | {notes} |

<details>
<summary>Tagged Enum Details</summary>

**{EnumName}**:
- `{VariantName}`: {field1}: {type1}, {field2}: {type2}
- ...

</details>

### 4.4 Domain Errors

| Error | Fields | Trigger |
|-------|--------|---------|
| {name} | {fields} | {when this error occurs} |

### 4.5 Contracts (Use-Case Interfaces)

Each use case that crosses a domain boundary MUST have a contract defining its input, output, and decision ADT.

> **Input Type Rule**: Contract inputs MUST use `S.Struct` with branded types, not `interface`. ID fields from domain entities use branded types (e.g., `PlanId`), IDs from external sources use `S.UUID`, enum fields use schema form (e.g., `PlanStatusSchema`), and date fields use `S.DateFromSelf`.

| Contract | Input Type | Decision ADT | Skill | File |
|----------|-----------|-------------|-------|------|
| {CreateFeatureContract} | {CreateFeatureInput} | {FeatureCreationDecision} | `dm-create-contract` | `domain/contracts/{use-case}.ts` |
| {CancelFeatureContract} | {CancelFeatureInput} | {FeatureCancellationDecision} | `dm-create-contract` | `domain/contracts/{use-case}.ts` |

<details>
<summary>Contract Details</summary>

**{ContractName}**:
- Input: `{InputType}` — {field1}: {type1}, {field2}: {type2}
- Decision variants:
  - `{CanDoAction}`: {fields for success path}
  - `{BlockedByReason}`: {fields explaining why blocked}
  - `{InvalidState}`: {fields for invalid precondition}

</details>

### 4.6 Services

#### Validation Services (Core — pure business rules)

| Service | Methods | Skill | Notes |
|---------|---------|-------|-------|
| {name}ValidationService | {method_list} | `dm-create-validation-service` | Pure: `Effect<void, DomainError>` |

#### Domain Services (Core — pure logic)

| Service | Methods | Skill | Notes |
|---------|---------|-------|-------|
| {name}Service | {method_list} | `dm-create-domain-service` | Pure functions + Effect.Service wrapper |

#### Application Services (Shell — orchestration)

| Service | Methods | Dependencies | Notes |
|---------|---------|--------------|-------|
| {name}Service | {method_list} | {deps} | Coordinates Core + Repo |

### 4.7 Functional Core Flows (Three Phases)

Each operation that involves I/O → Logic → I/O MUST document its Three Phases pattern.

| Flow | Collection (Shell) | Logic (Core) | Persistence (Shell) | Skill |
|------|-------------------|-------------|-------------------|-------|
| {createFeature} | Load from repo | Pure calculation | Persist to DB | `dm-create-functional-core-flow` |
| {cancelFeature} | Load plan + periods | Classify + decide | Cancel + create cycles | `dm-create-functional-core-flow` |

### 4.8 Additional Components

#### Semantic Wrappers
| Wrapper | Wraps | Stage | Notes |
|---------|-------|-------|-------|

#### Boundary Mappers
| Mapper | External | Domain | Skill | Notes |
|--------|----------|--------|-------|-------|
| {name} | {external type} | {domain type} | `dm-create-boundary-mapper` | At boundary |

#### Data Seams / Pipeline Stages
| Pipeline | Stages (Loader→Core→Persist) | Notes |
|----------|------------------------------|-------|

## 5. Type Diagram

```mermaid
classDiagram
    %% Entities
    class {EntityName} {
        +{IdType} id
        +{field}: {type}
    }

    %% Value Objects
    class {ValueObjectName} {
        +{field}: {type}
    }

    %% Enums
    class {EnumName} {
        <<enumeration>>
        {Value1}
        {Value2}
    }

    %% Tagged Enums
    class {TaggedEnumName} {
        <<union>>
        {Variant1}
        {Variant2}
    }

    %% Relationships
    {EntityName} --> {ValueObjectName} : contains
    {EntityName} --> {EnumName} : uses
````

## 6. Architecture Phases

This design follows the **Functional Core / Imperative Shell** architecture. Implementation proceeds in phases, each building on the previous.

### Phase 1: Functional Core (Pure Logic)

> Domain types, pure services, ADTs, contracts, reified decisions

Phase 1 steps MUST follow this order (dependencies flow top-to-bottom):

| Step | Component                 | Skill                          | File                                           | Notes                                                             |
| ---- | ------------------------- | ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| 1.a  | Constants + Branded Types | `dm-create-branded-type`       | `domain/{module}.model.ts`                     | Define named constants FIRST, then branded types referencing them |
| 1.b  | Value Objects             | `dm-create-value-object`       | `domain/{module}.model.ts`                     | Depend on branded types                                           |
| 1.c  | Tagged Enums              | `dm-create-tagged-enum`        | `domain/{module}.model.ts`                     | ADTs for decisions and classifications                            |
| 1.d  | Smart Constructors        | `dm-create-smart-constructors` | `domain/{module}.model.ts`                     | For types with cross-field validation                             |
| 1.e  | Domain Errors             | `dm-create-domain-error`       | `domain/errors.ts`                             | Typed errors for business rule violations                         |
| 1.f  | Contracts                 | `dm-create-contract`           | `domain/contracts/{use-case}.ts`               | Use-case input/output + decision ADTs                             |
| 1.g  | Validation Services       | `dm-create-validation-service` | `domain/services/{name}.validation.service.ts` | Pure business rules                                               |
| 1.h  | Domain Services           | `dm-create-domain-service`     | `domain/services/{name}.service.ts`            | Pure logic + Effect.Service                                       |

**Shared Types** (pass the Orphan Test - would still make sense if this module is deleted):

| Type   | Location | Skill   | Reason   |
| ------ | -------- | ------- | -------- |
| {name} | {file}   | {skill} | {reason} |

**Command**: `"implement phase 1"`

### Phase 2: Shell APIs (HTTP Layer)

> Request/Response schemas, handlers, validation, boundary mappers

| Step | Component                | Type            | File                         | Notes                              |
| ---- | ------------------------ | --------------- | ---------------------------- | ---------------------------------- |
| 2.1  | {Endpoint}RequestSchema  | Request Schema  | api/schemas/requests.ts      | Input validation + transformation  |
| 2.2  | {Endpoint}ResponseSchema | Response Schema | api/schemas/responses.ts     | Output shape (Date → string)       |
| 2.3  | {Error}Schema            | Error Schema    | api/schemas/errors.ts        | HTTP error schemas (S.TaggedError) |
| 2.4  | {Feature}ApiGroup        | API Definition  | api/{feature}-api.ts         | Endpoint definitions               |
| 2.5  | {Feature}ApiLive         | Handler         | api/{feature}-api-handler.ts | Error mapping with `catchTags`     |

**Handler Error Mapping** (mandatory):

```typescript
// Domain errors (Data.TaggedError) → HTTP errors (S.TaggedError)
.pipe(Effect.catchTags({
  DomainError: (e) => Effect.fail(new DomainErrorSchema({ message: e.message })),
}))
```

**Command**: `"implement phase 2"`

### Phase 3: Persistence Layer (Repository)

> Database access, output validation, record schemas

| Step | Component            | Type          | File                                | Notes                |
| ---- | -------------------- | ------------- | ----------------------------------- | -------------------- |
| 3.1  | {Entity}RecordSchema | Record Schema | repositories/schemas.ts             | DB output validation |
| 3.2  | {Entity}Repository   | Repository    | repositories/{entity}.repository.ts | CRUD operations      |

**Repository Validation Principle** (mandatory):

- **Input is trusted** - comes from validated service layer
- **Output is validated** - database could return unexpected data
- Use `S.DateFromSelf` for DB Date objects (not `S.DateFromString`)

```typescript
// Validate OUTPUT from database
return (
  yield *
  S.decodeUnknown(RecordSchema)(dbResult).pipe(
    Effect.mapError((e) => new RepositoryError({ message: '...', cause: e })),
  )
);
```

**Command**: `"implement phase 3"`

### Phase 4: Coordinator Layer (Orchestration)

> Application services, workflows, Three Phases composition

| Step | Component        | Skill                            | File                            | Notes                                                                    |
| ---- | ---------------- | -------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| 4.1  | {Feature}Service | `dm-create-functional-core-flow` | `services/{feature}.service.ts` | Three Phases: Collection → Logic → Persistence. Orchestrates Core + Repo |

The application service is the **composition point** for the Three Phases pattern:

- **Collection** (Shell): load data from repositories
- **Logic** (Core): call pure domain services from Phase 1
- **Persistence** (Shell): persist results to repositories from Phase 3

**Command**: `"implement phase 4"`

### Implementation Order

```
Phase 1 (Core)     ──────────────────────────────────►
                   Types, Errors, Pure Services

Phase 2 (API)      ──────────────────────────────────►
                   Schemas, Handlers (depends on Core types)

Phase 3 (Repo)     ──────────────────────────────────►
                   Repository (depends on Core types)

Phase 4 (Coord)    ──────────────────────────────────►
                   App Service (depends on Core + Repo)
```

### Files to Create

```
{module}/
├── domain/
│   ├── {module}.model.ts        # Constants, Branded Types, Value Objects, Tagged Enums
│   ├── errors.ts                # Domain Errors (Data.TaggedError)
│   ├── index.ts                 # Barrel: model + errors + contracts + services
│   ├── contracts/
│   │   ├── index.ts             # Barrel for all contracts
│   │   ├── {use-case}.ts        # Use-case contract + decision ADT
│   │   └── ...
│   └── services/
│       ├── index.ts             # Barrel for all domain services
│       ├── {name}.validation.service.ts  # Pure validation (Effect.Service)
│       ├── {name}.service.ts    # Pure domain logic (Effect.Service)
│       └── ...
├── api/
│   ├── {feature}-api.ts         # API endpoint definitions
│   ├── {feature}-api-handler.ts # Handler implementations
│   └── schemas/
│       ├── requests.ts          # Request schemas
│       ├── responses.ts         # Response schemas
│       └── errors.ts            # Error schemas
├── repositories/
│   ├── schemas.ts               # Record schemas (DB output)
│   └── {entity}.repository.ts   # Repository implementations
└── services/
    └── {name}.service.ts        # Application services (Shell — orchestration)
```

## 7. Closed World Checklist

Before implementation, verify:

- [ ] All enums use `S.Literal` union (not `S.String`)
- [ ] All pattern matches use `Match.exhaustive`
- [ ] No `default` or `else` cases that hide bugs
- [ ] Adding a variant causes compile errors at all switch sites
- [ ] No optional fields that depend on other fields (use Tagged Enum instead)
- [ ] No boolean discriminators with optional fields (use Tagged Enum instead)

## 8. FC/IS Implementation Checklist

When implementing each phase, verify:

**Phase 1 — Functional Core:**

- [ ] **Constants** live in model file alongside their branded types (no magic numbers)
- [ ] **Branded types** reference named constants in predicates and error messages
- [ ] **Contracts** exist for each use case with input types and decision ADTs
- [ ] **Contract inputs** use `S.Struct` with branded types (not `interface`)
- [ ] **Contract ADT variants** use branded types for entity IDs (e.g., `PlanId` not `string`)
- [ ] **Domain services** include `FUNCTIONAL CORE` documentation header with Three Phases context
- [ ] **Domain services** export pure functions both as standalone AND inside Effect.Service wrapper
- [ ] **Domain service preconditions** use pure boolean predicates (2 outcomes) or TaggedEnum ADTs (3+ outcomes) — never `Effect<void, DomainError>`
- [ ] **Validation services** are separate from domain services (single responsibility)

**Phase 2 — Shell APIs:**

- [ ] **Request Schema** validates and transforms input (strings → typed values)
- [ ] **Handler** maps domain errors to HTTP errors with `catchTags`
- [ ] **Handler** serializes responses (Date → string, etc.)
- [ ] **Response Schema** defines the response shape

**Phase 3 — Persistence:**

- [ ] **Repository** validates output from database, trusts input
- [ ] **Repository** injects domain services it uses via `yield* ServiceName` (never direct function imports)
- [ ] **Repository** `dependencies` array includes all domain service `.Default` layers

**Phase 4 — Orchestration:**

- [ ] **Application Service** coordinates validation and repository, returns typed errors
- [ ] **Application Service** follows Three Phases pattern (Collection → Logic → Persistence)
- [ ] **Application Service** uses `Clock.currentTimeMillis` for current time, never `new Date()`
- [ ] **Application Service** injects domain services via `yield* ServiceName` (never direct function imports)
- [ ] **Application Service** `dependencies` array includes all domain service `.Default` layers

## 9. Warning Signs Detected

[List any problematic patterns found in the spec that were addressed:]

- [ ] Optional fields dependent on other fields → Converted to Tagged Enum
- [ ] Boolean discriminators → Converted to Literal/Tagged Enum
- [ ] Mixed I/O and logic → Separated into functional core
- [ ] Strings/numbers that should be distinct → Use Brand.refined
- [ ] `default` cases in switches → Use Match.exhaustive
- [ ] Validation inside domain core → Move to boundary

## 10. Open Questions

[Decisions that require human input before implementation:]

1. {Question about ambiguous requirement}
2. {Question about design choice}

## 11. Next Steps

1. **Review** this document for correctness and completeness
2. **Verify** Type Justification table (Section 3) - each type has correct category
3. **Verify** Closed World Checklist (Section 7) - all items will be satisfied
4. **Verify** FC/IS Implementation Checklist (Section 8) - all layers covered
5. **Resolve** any open questions above
6. **Implement by phase**:
   - `"implement phase 1"` → Functional Core
   - `"implement phase 2"` → Shell APIs
   - `"implement phase 3"` → Persistence Layer
   - `"implement phase 4"` → Coordinator Layer
   - Or `"implement all"` / `"implement the plan"` → All phases in order

Each phase builds on the previous. Phase 1 (Core) should be implemented first as it defines the domain types used by all other phases.

---

<details>
<summary>Analysis YAML (reference)</summary>

```yaml
{ Complete YAML from domain-analyzer }
```

</details>

<details>
<summary>Plan YAML (reference)</summary>

```yaml
{ Complete YAML from domain-planner }
```

</details>
```

## Step 4: Present to User

After generating the document, inform the user:

1. The design document has been created at `functional-domain-design.md`
2. They should review all sections, especially:
   - **Design Principles** (Section 2) - Validation layers are correct
   - **Type Justification** (Section 3) - Each type has correct category and reason
   - **Architecture Phases** (Section 6) - All 4 phases have correct components
   - **Closed World Checklist** (Section 7) - All items will be satisfied
   - **FC/IS Implementation Checklist** (Section 8) - All layers covered
   - **Open Questions** (Section 10) - Need answers before implementing
3. To proceed with implementation:
   - **By phase**: `"implement phase 1"`, `"implement phase 2"`, etc.
   - **All at once**: `"implement all"` or `"implement the plan"`

## Mermaid Diagram Guidelines

When generating the type diagram:

1. **Entities**: Show as classes with their ID field and key fields
2. **Value Objects**: Show as classes with all fields
3. **Literal Enums**: Use `<<enumeration>>` stereotype with values listed
4. **Tagged Enums**: Use `<<union>>` stereotype with variant names
5. **Relationships**:
   - `-->` for composition (Entity contains Value Object)
   - `..>` for dependency (Service uses Entity)
   - `--|>` for inheritance (if applicable)
6. Keep the diagram focused on key relationships, not every field

## Smart Constructor Rules

Include `dm-create-smart-constructors` in the implementation plan when:

1. **Value Objects** have cross-field validation (e.g., `end > start` for DateRange)
2. **Branded Types** have validation (e.g., UUID format, positive number)
3. **Entities** have schema-level filters
4. Any type where `S.decodeUnknown` could fail

The smart constructor provides:

- `create`: Returns `Effect<T, ParseError>` for Effect pipelines
- `make`: Returns `Option<T>` for simple cases

## Example Invocation

```
/dm-design

## Feature: Order Processing

An order has items, shipping address, and payment info.
Orders can be: pending, paid, shipped, delivered, or cancelled.
When shipped, include tracking number.
Calculate total from items with tax and discounts.
```

## Notes

- This skill generates documentation only, no code
- The document is designed for human review before implementation
- Keep both YAMLs in collapsible sections for reference during implementation
- **Type Justification** ensures every type follows the Decision Flowchart
- **Closed World Checklist** ensures compiler-enforced completeness
- **Core/Shell separation** is explicit in the Architecture Phases (Section 6)

## Implementation Commands

When the user requests implementation, Claude should read the generated MD file and execute skills based on the command:

| Command                                    | Action                                         |
| ------------------------------------------ | ---------------------------------------------- |
| `"implement phase 1"`                      | Execute only Phase 1 steps (Functional Core)   |
| `"implement phase 2"`                      | Execute only Phase 2 steps (Shell APIs)        |
| `"implement phase 3"`                      | Execute only Phase 3 steps (Persistence Layer) |
| `"implement phase 4"`                      | Execute only Phase 4 steps (Coordinator Layer) |
| `"implement all"` / `"implement the plan"` | Execute all phases in order (1 → 2 → 3 → 4)    |

**Phase Dependencies**:

- Phase 1 has no dependencies (can always be implemented first)
- Phase 2 depends on Phase 1 types (domain types, errors)
- Phase 3 depends on Phase 1 types (entity types for record schemas)
- Phase 4 depends on Phase 1 + Phase 3 (core services + repositories)

## Implementation Protocol (MANDATORY)

**This protocol MUST be followed when implementing any phase.** Skills are the source of truth for code patterns — not ad-hoc implementation.

### Rule 1: Skills Drive Implementation

For each step in the phase table:

1. **Read the corresponding skill** (`dm-create-branded-type/SKILL.md`, `dm-create-contract/SKILL.md`, etc.)
2. **Follow the skill's output template** exactly — do not write code ad-hoc
3. **Include all required documentation blocks** defined in the skill (e.g., `FUNCTIONAL CORE` headers)
4. If the skill shows a pattern (named constants, dual export, documentation block), that pattern is **mandatory**

### Rule 2: No Magic Numbers

Branded types with range constraints MUST:

1. Define named constants (`MIN_X`, `MAX_X`) in the model file **before** the branded type
2. Reference constants in the `Brand.refined` predicate — never use hardcoded values
3. Reference constants in error messages
4. Export constants for use by validation services and tests

```typescript
// ✅ CORRECT: Named constants referenced by branded type
export const MIN_FASTING_DURATION = 1;
export const MAX_FASTING_DURATION = 168;

export const FastingDuration = Brand.refined<FastingDuration>(
  (n) => n >= MIN_FASTING_DURATION && n <= MAX_FASTING_DURATION && Number.isInteger(n * 4),
  (n) => Brand.error(`Expected ${MIN_FASTING_DURATION}-${MAX_FASTING_DURATION}h, got ${n}`),
);

// ❌ WRONG: Magic numbers
export const FastingDuration = Brand.refined<FastingDuration>(
  (n) => n >= 1 && n <= 168 && Number.isInteger(n * 4),
  (n) => Brand.error(`Expected 1-168h, got ${n}`),
);
```

### Rule 3: Domain Service Documentation

Every domain service file that contains pure functions MUST include this documentation block:

```typescript
// ============================================================================
// FUNCTIONAL CORE — Pure {description} functions (no I/O, no Effect error signaling, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection) and wrapped in the {ServiceName}
// Effect.Service below.
//
// Three Phases usage (in {ConsumerService}.{method}):
//   1. COLLECTION (Shell): {what is loaded from I/O}
//   2. LOGIC (Core):       {which pure functions are called}
//   3. PERSISTENCE (Shell): {what is persisted}
// ============================================================================
```

### Rule 4: Dual Export Pattern

Domain services that wrap pure functions MUST export both:

1. **Standalone pure functions** — for direct unit testing only
2. **Effect.Service wrapper** — for all consumers (application services, repositories) via `yield* ServiceName`

> **Important**: Consumers (application services, repositories) MUST inject via `yield* ServiceName`, never import standalone functions directly. Standalone exports exist for direct unit testing only.

```typescript
// Standalone export (for direct use)
export const calculatePeriodDates = (startDate: Date, periods: ReadonlyArray<PeriodDurationInput>): CalculatedPeriod[] => { ... };

// Effect.Service wrapper (for DI)
export class PeriodCalculationService extends Effect.Service<PeriodCalculationService>()('PeriodCalculationService', {
  effect: Effect.succeed({
    calculatePeriodDates,
  } satisfies IPeriodCalculationService),
  accessors: true,
}) {}
```

### Rule 5: Implementation Order Within Phases

**Phase 1 (Functional Core)** steps MUST be executed in this order:

1. **Constants** — named constants for all domain limits
2. **Branded Types** — `dm-create-branded-type` (reference constants)
3. **Value Objects** — `dm-create-value-object` (depend on branded types)
4. **Tagged Enums** — `dm-create-tagged-enum` (ADTs for decisions/classifications)
5. **Smart Constructors** — `dm-create-smart-constructors` (for types with validation)
6. **Domain Errors** — `dm-create-domain-error` (typed errors)
7. **Contracts** — `dm-create-contract` (use-case input/output + decision ADTs)
8. **Validation Services** — `dm-create-validation-service` (pure business rules)
9. **Domain Services** — `dm-create-domain-service` (pure logic + Effect.Service)

**Phase 4 (Coordinator)** uses `dm-create-functional-core-flow` for the application service.
The Three Phases composition (Collection → Logic → Persistence) lives in the application service because it orchestrates both Core (Phase 1) and Repository (Phase 3).

### Rule 6: Contracts Are Mandatory

Every use case that mutates state MUST have a contract in `domain/contracts/`:

- `{use-case}.ts` with input type + decision ADT (Data.TaggedEnum)
- Contract variants represent all possible outcomes (success paths + failure reasons)
- Contracts are consumed by the application service (Shell) to make decisions

If the design document lists a use case in Section 4.7 (Functional Core Flows) but has no corresponding contract in Section 4.5, the design document is **incomplete** — add the contract before implementing.

### Rule 7: Contract Input Types

Contract inputs MUST use `S.Struct` with the appropriate type for each field:

| Field Source                | Schema Type           | Example                                          |
| --------------------------- | --------------------- | ------------------------------------------------ |
| Entity ID (from domain)     | Branded type          | `PlanId`, `PeriodId`                             |
| ID (from external source)   | `S.UUID`              | `S.UUID` for user IDs from auth                  |
| Nullable ID (from external) | `S.NullOr(S.UUID)`    | `activePlanId: S.NullOr(S.UUID)`                 |
| Enum field                  | Schema form           | `PlanStatusSchema`                               |
| Date field                  | `S.DateFromSelf`      | `now: S.DateFromSelf`                            |
| Numeric field               | `S.Number` or branded | `S.Number` for counts, branded for domain values |

ADT variant fields follow the same rules — entity IDs use branded types, not `string`.

### Rule 8: Mandatory DI Consumption

Application services (Phase 4) and repositories (Phase 3) MUST consume domain services via DI — never import standalone functions directly.

```typescript
effect: Effect.gen(function* () {
  const validationService = yield* ValidationService;
  const calculationService = yield* CalculationService;
  // ...
  const decision = validationService.decide(input);
}),
dependencies: [ValidationService.Default, CalculationService.Default],
```

Standalone function exports exist for **direct unit testing only**.

```typescript
// ✅ CORRECT: S.Struct with branded types
export const PlanCancellationInput = S.Struct({
  planId: PlanId, // branded — from domain entity
  status: PlanStatusSchema, // schema form — enum
  periods: S.Array(PeriodDatesSchema),
  now: S.DateFromSelf, // date
});
export type PlanCancellationInput = S.Schema.Type<typeof PlanCancellationInput>;

// ❌ WRONG: interface with primitives
export interface PlanCancellationInput {
  readonly planId: string;
  readonly status: PlanStatus;
  readonly periods: ReadonlyArray<PeriodDates>;
  readonly now: Date;
}
```

### Rule 9: Core Precondition Pattern

Domain service functions MUST NOT return `Effect<void, DomainError>` for precondition checks.
`Effect.fail` belongs in the Shell (callers), not in the Functional Core.

Use the following decision rule:

| Possible outcomes        | Pattern                        | Example                                           |
| ------------------------ | ------------------------------ | ------------------------------------------------- |
| **2 (binary pass/fail)** | Pure boolean predicate         | `isPlanInProgress(status): boolean`               |
| **3+**                   | `Data.TaggedEnum` decision ADT | `decidePlanCreation(input): PlanCreationDecision` |

**Binary predicate** — for simple yes/no guards:

```typescript
// Core (pure): returns boolean
export const isPlanInProgress = (status: PlanStatus): boolean =>
  status === 'InProgress';

// Shell (caller): interprets and fails
if (!validationService.isPlanInProgress(plan.status)) {
  yield* Effect.fail(new PlanInvalidStateError({ ... }));
}
```

**TaggedEnum decision** — for 3+ possible outcomes with different data:

```typescript
// Core (pure): returns ADT
export const decidePlanCreation = (input): PlanCreationDecision => { ... };

// Shell (caller): matches exhaustively
yield* PlanCreationDecision.$match(decision, {
  CanCreate: () => Effect.void,
  BlockedByActivePlan: () => Effect.fail(...),
  BlockedByActiveCycle: () => Effect.fail(...),
  InvalidPeriodCount: () => Effect.fail(...),
});
```

**Never** use `Effect<void, DomainError>` in domain services — it mixes Core with Shell.
