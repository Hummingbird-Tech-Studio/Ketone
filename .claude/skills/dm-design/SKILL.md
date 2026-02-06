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

```markdown
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
```

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

### 4.5 Services

| Service | Layer | Methods | Dependencies | Notes |
|---------|-------|---------|--------------|-------|
| {name} | Core/Shell | {method_list} | {deps} | {notes} |

### 4.6 Additional Components

#### Semantic Wrappers
| Wrapper | Wraps | Stage | Notes |
|---------|-------|-------|-------|

#### Boundary Mappers
| Mapper | External | Domain | Validation |
|--------|----------|--------|------------|
| {name} | {external type} | {domain type} | At boundary |

#### Reified Decisions
| Decision | Variants | Context | Notes |
|----------|----------|---------|-------|

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

> Domain types, pure services, ADTs, reified decisions

| Step | Component | Skill         | File   | Notes   |
| ---- | --------- | ------------- | ------ | ------- |
| 1.1  | {type}    | `dm-create-*` | {file} | {notes} |

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

> Application services, workflows, effect composition

| Step | Component        | Type                | File                          | Notes                    |
| ---- | ---------------- | ------------------- | ----------------------------- | ------------------------ |
| 4.1  | {Feature}Service | Application Service | services/{feature}.service.ts | Orchestrates Core + Repo |

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
│   ├── {module}.model.ts        # Entities, Value Objects, Enums
│   ├── errors.ts                # Domain Errors
│   └── contracts/
│       └── {use-case}.ts        # Use-case contracts
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
    ├── {name}.service.ts        # Application services (Shell)
    └── {name}.core.ts           # Pure functions (Core)
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

- [ ] **Request Schema** validates and transforms input (strings → typed values)
- [ ] **Domain Validation Service** contains pure business rules (no I/O)
- [ ] **Application Service** coordinates validation and repository, returns typed errors
- [ ] **Repository** validates output from database, trusts input
- [ ] **Handler** maps domain errors to HTTP errors with `catchTags`
- [ ] **Handler** serializes responses (Date → string, etc.)
- [ ] **Response Schema** defines the response shape

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
