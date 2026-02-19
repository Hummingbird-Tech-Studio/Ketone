---
name: dm-design-web
description: Generate a Markdown architecture document for web features from technical specs. Creates a reviewable design document before implementing code. Adapted for web FC/IS with 7 phases.
model: opus
---

# Web Domain Design Generator

Generate a comprehensive Markdown architecture document for **web features** from technical specifications. This allows human review and approval before code implementation.

## Architecture: Web FC/IS

```
┌────────────────────────── IMPERATIVE SHELL ──────────────────────────┐
│                                                                       │
│  ┌──────────────────┐                         ┌────────────────────┐ │
│  │ Shell: API Client  │                         │ Shell: Input       │ │
│  │ (HTTP Service)    │                         │ (Composable)       │ │
│  │                   │                         │                    │ │
│  │  ┌─ Boundary ───┐ │                         │ Schema validates   │ │
│  │  │ API DTO →    │ │                         │ raw input →        │ │
│  │  │ Domain Types │ │                         │ Domain Types       │ │
│  │  └──────────────┘ │                         │                    │ │
│  └────────┬─────────┘                         └──────────┬─────────┘ │
│           │                                               │           │
│           ▼                                               ▼           │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │              Application Service (single entrypoint)           │   │
│  │  Collection (API Client) → Logic (FC) → Persistence (API Client) │  │
│  │  Coordinates Three Phases; called by actor via programXxx()   │   │
│  └──────────────────────────┬─────────────────────────────────────┘   │
│                             │                                         │
│  ┌──────────────────────────▼─────────────────────────────────────┐   │
│  │              State Machine (Actor)                              │   │
│  │  Receives domain-typed data, manages state transitions         │   │
│  │  Calls application service programs via runWithUi              │   │
│  └──────────────────────────┬─────────────────────────────────────┘   │
│                             │                                         │
│  ┌──────────────────────────▼─────────────────────────────────────┐   │
│  │              Composable (View Model)                           │   │
│  │  Domain computeds, input validation, UI state translation      │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │              Component                                         │   │
│  │  Uses composable, never contains business logic                │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────▼───────────────────┐
          │         FUNCTIONAL CORE                │
          │  Pure functions, branded types,         │
          │  tagged enums, contracts, services      │
          │  (identical to API practices)           │
          └────────────────────────────────────────┘
```

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

Create a Markdown file at `functional-domain-design.md` inside the feature's `domain/` directory (e.g., `web/src/views/{feature}/domain/functional-domain-design.md`) with the following structure:

````markdown
# Functional Domain Design (Web): {FeatureName}

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

### 2.2 Functional Core / Imperative Shell (Web)

Separation of pure business logic from I/O and UI operations. The web adaptation has 4 shell types:

| Layer                    | Responsibility                                               | Characteristics                                                       |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Functional Core**      | Business logic, validations, decisions                       | Pure functions, no I/O, deterministic, testable                       |
| **Shell: API Client**    | HTTP services, API DTO → Domain mapping                      | Effect-based, boundary mappers, domain error mapping                  |
| **Shell: Input**         | User input → Domain types, schema validation                 | Composable validates before actor receives input                      |
| **Shell: Application**   | Three Phases coordination (Collection → Logic → Persistence) | Effect.Service, composes API client + FC, single entrypoint for actor |
| **Shell: State Machine** | State transitions, invoke application service programs       | XState actor, FC guards, domain-typed context, emissions              |
| **Shell: View Model**    | Domain → UI translation, computed derivations                | Composable exposes FC as computeds, validates input                   |

> **Clock Rule**: Shell code that needs the current time MUST use `DateTime.nowAsDate` from Effect,
> never `new Date()`. `new Date()` is an implicit side effect that breaks testability (cannot be controlled
> with `TestClock`). Core functions receive `now: Date` as a parameter — they never access the clock directly.
>
> ```typescript
> // ✅ CORRECT (Shell — API Client): use DateTime
> const now = yield * DateTime.nowAsDate;
> const decision = decideCancellation(periods, now); // pass to Core
>
> // ❌ WRONG (Actor): implicit side effect
> const now = new Date();
> ```

**Core functions in this design**:

- {list pure functions: e.g., "calculateTotal", "assessProgress"}

**Shell operations in this design**:

- {list API client operations: e.g., "fetchPlan", "savePeriods"}
- {list Application Service operations: e.g., "programDuplicateTemplate (Three Phases)", "programSaveAsTemplate (Three Phases)"}
- {list Input validations: e.g., "validateCreatePlanInput"}
- {list Actor orchestrations: e.g., "createPlanFlow", "cancelPlanFlow"}
- {list View Model derivations: e.g., "planStatusLabel", "canCompletePlan"}

### 2.3 Validation Layers (Web)

> "Validate at the boundary, trust inside"

The web architecture defines **4 mandatory validation layers**:

| Layer                      | Location                             | Responsibility                                           | Validates                          |
| -------------------------- | ------------------------------------ | -------------------------------------------------------- | ---------------------------------- |
| **1. Input Validation**    | Composable (via `input-validation/`) | Validate user input → domain types, expose errors for UI | INPUT (raw form → branded types)   |
| **2. Domain Validation**   | Functional Core                      | Pure business rules (no I/O)                             | LOGIC (can X? is Y valid?)         |
| **3. Application Service** | Application Service                  | Coordinate FC + API client, domain error handling        | FLOW (returns typed domain errors) |
| **4. API Client Output**   | API client boundary mappers          | Validate API response → domain types (decode)            | OUTPUT (DTO → domain, may fail)    |

**Checklist**:

- [ ] Input validation validates raw form data before composable sends to actor
- [ ] Domain validation service contains pure business rules (testable)
- [ ] Application service coordinates API client + FC; actor invokes application service programs
- [ ] API client boundary mappers decode API DTOs into domain types

### 2.4 Data Seams

Architectural boundaries where data transforms between layers.

| Seam                     | From           | To               | Transformation                                              |
| ------------------------ | -------------- | ---------------- | ----------------------------------------------------------- |
| API Client → Application | API DTO        | Domain Entity    | `fromApiResponse()` in API client                           |
| Application → API Client | Domain Types   | API Payload      | `toApiPayload()` in API client                              |
| Actor → Application      | Domain Events  | Program Input    | Actor passes domain-typed input to programXxx()             |
| Application → API Client | Program calls  | API Client calls | Application service yields API client methods in Effect.gen |
| Application → FC         | Domain Types   | Decision ADTs    | Application service calls FC pure functions for logic       |
| Component → Composable   | Raw Form Input | Domain Types     | Input schema validation in composable                       |
| Composable → Actor       | Domain Types   | Domain Events    | `actorRef.send()` after validation                          |
| Actor → Composable       | Domain State   | UI State         | Computed derivation via selectors                           |

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
| {Status} | Literal Enum | `dm-create-literal-enum` | Finite set of labels, all same structure |
| {Result} | Tagged Enum | `dm-create-tagged-enum` | Variants have different data |

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
| {ContractName} | {InputType} | {DecisionADT} | `dm-create-contract` | `domain/contracts/{use-case}.ts` |

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

> Domain services contain ONLY pure business rules (boolean predicates, decision ADTs, calculations).
> Functions that produce user-facing strings (labels, messages, display sorting) belong in Section 4.9 (Presentation Utils), not here.

#### Validation Services (Core — pure business rules)

| Service | Methods | Skill | Notes |
|---------|---------|-------|-------|
| {name}ValidationService | {method_list} | `dm-create-validation-service` | Pure: boolean predicates or decision ADTs |

#### Domain Services (Core — pure logic)

| Service | Methods | Skill | Notes |
|---------|---------|-------|-------|
| {name}Service | {method_list} | `dm-create-domain-service` | Pure functions + Effect.Service wrapper |

### 4.7 Functional Core Flows (Three Phases)

Each operation that involves I/O → Logic → I/O MUST document its Three Phases pattern.

| Flow | Collection (Shell) | Logic (Core) | Persistence (Shell) | Application Service |
|------|-------------------|-------------|-------------------|---------------------|
| {createFeature} | API Client: fetch dependencies | Pure calculation | API Client: POST to API | Application Service |
| {cancelFeature} | API Client: load plan + periods | Classify + decide | API Client: PATCH cancel | Application Service |

> When an application service exists, prefer it as the **single entrypoint** for all actor operations — even simple reads. This keeps imports consistent and makes it easy to add business logic later without changing the actor. The application service may pass through to the API client for simple reads.

### 4.8 Additional Components

#### Boundary Mappers (API Client)

| Mapper | API DTO (from `@ketone/shared`) | Domain Type | Direction | Notes |
|--------|---------------------------------|-------------|-----------|-------|
| {name} | {ResponseSchema} | {DomainEntity} | API → Domain | Decode with validation |
| {name} | {DomainEntity} | {PayloadType} | Domain → API | Pure, always succeeds |

#### Input Validations

| Schema | Raw Input | Domain Output | Location | Notes |
|--------|-----------|---------------|----------|-------|
| {name} | {raw form fields} | {domain types} | `input-validation/{use-case}-input.mapper.ts` | Composable validates |

### 4.9 Presentation Utils

Formatting and display-ordering functions that produce user-facing strings.
These belong in `utils/`, NOT in domain services or actor emissions.

| Function | Purpose | Notes |
|----------|---------|-------|
| {formatXxxLabel} | Display label | Spec copy: "{text}" |
| {buildYyyMessage} | Confirmation/toast message | Spec copy: "{text}" |
| {sortZzzByRecency} | Display ordering | Presentation sort, not domain logic |

> **Rule**: If a function produces user-facing strings (not domain values), it belongs in `utils/`.

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

This design follows the **Web Functional Core / Imperative Shell** architecture. Implementation proceeds in 7 phases, each building on the previous.

### Phase 0: Scaffold

> Create `domain/` folder structure with mandatory barrel files

Use `dm-scaffold-domain-module` with web path (`web/src/views/{feature}/domain/`).

| Step | Component        | File                        | Notes                                                 |
| ---- | ---------------- | --------------------------- | ----------------------------------------------------- |
| 0.1  | Domain directory | `domain/`                   | Module root                                           |
| 0.2  | Model file       | `domain/{feature}.model.ts` | Constants, types, enums                               |
| 0.3  | Errors file      | `domain/errors.ts`          | Domain errors                                         |
| 0.4  | Contracts barrel | `domain/contracts/index.ts` | Barrel for contracts                                  |
| 0.5  | Services barrel  | `domain/services/index.ts`  | Barrel for domain services                            |
| 0.6  | Domain barrel    | `domain/index.ts`           | Barrel: model + errors + contracts + services         |
| 0.7  | Input validation | `input-validation/index.ts` | Barrel for input validations (peer folder to domain/) |

**Command**: `"implement phase 0"` or `"scaffold domain"`

### Phase 1: Functional Core (Pure Logic)

> Domain types, pure services, ADTs, contracts, reified decisions. **Identical to API Phase 1** — all 13 dm-\* skills apply unchanged.

Phase 1 steps MUST follow this order (dependencies flow top-to-bottom):

| Step | Component                 | Skill                          | File                                           | Notes                                                             |
| ---- | ------------------------- | ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| 1.a  | Constants + Branded Types | `dm-create-branded-type`       | `domain/{feature}.model.ts`                    | Define named constants FIRST, then branded types referencing them |
| 1.b  | Value Objects             | `dm-create-value-object`       | `domain/{feature}.model.ts`                    | Depend on branded types                                           |
| 1.c  | Tagged Enums              | `dm-create-tagged-enum`        | `domain/{feature}.model.ts`                    | ADTs for decisions and classifications                            |
| 1.d  | Smart Constructors        | `dm-create-smart-constructors` | `domain/{feature}.model.ts`                    | For types with cross-field validation                             |
| 1.e  | Domain Errors             | `dm-create-domain-error`       | `domain/errors.ts`                             | Typed errors for business rule violations                         |
| 1.f  | Contracts                 | `dm-create-contract`           | `domain/contracts/{use-case}.ts`               | Use-case input/output + decision ADTs                             |
| 1.g  | Validation Services       | `dm-create-validation-service` | `domain/services/{name}.validation.service.ts` | Pure business rules                                               |
| 1.h  | Domain Services           | `dm-create-domain-service`     | `domain/services/{name}.service.ts`            | Pure logic + Effect.Service                                       |

**Shared Types** (pass the Orphan Test — would still make sense if this module is deleted):

| Type   | Location | Skill   | Reason   |
| ------ | -------- | ------- | -------- |
| {name} | {file}   | {skill} | {reason} |

**Command**: `"implement phase 1"`

### Phase 2: Shell — API Client Service (Repository Equivalent)

> HTTP service with boundary mappers that decode API DTOs into domain types.

Uses `dm-create-gateway-service` skill (composes on `create-service` layout; skill internally covers API Client patterns).

| Step | Component          | Skill                       | File                                     | Notes                                  |
| ---- | ------------------ | --------------------------- | ---------------------------------------- | -------------------------------------- |
| 2.a  | Boundary Mappers   | `dm-create-boundary-mapper` | `api-client/{feature}.mappers.ts`        | `fromApiResponse()` + `toApiPayload()` |
| 2.b  | API Client Errors  | (part of API client)        | `api-client/{feature}.errors.ts`         | Domain error types + helpers           |
| 2.c  | API Client Service | `dm-create-gateway-service` | `api-client/{feature}-client.service.ts` | Effect.Service + response handlers     |
| 2.d  | Barrel             | —                           | `api-client/index.ts`                    | Re-exports service + errors            |

**Boundary Mapping Checklist**:

- [ ] `fromApiResponse(dto)` decodes API DTO → Domain types (may fail with parse error)
- [ ] `toApiPayload(domain)` maps Domain → API payload (pure, always succeeds)
- [ ] DTO types are **never** exposed past the API client boundary
- [ ] Branded types are applied during decode (not after)
- [ ] All API client methods return Domain Types, never raw DTOs
- [ ] HTTP errors are mapped to domain-tagged errors (`Data.TaggedError`)
- [ ] Actor never interprets raw HTTP status codes

**Command**: `"implement phase 2"`

### Phase 2b: Shell — Application Service (Three Phases Coordinator)

> Single entrypoint for all actor I/O. Coordinates Collection (API Client) → Logic (FC) → Persistence (API Client).
> Required for features with domain modeling. Pass-through for simple reads, FC logic for mutations.

| Step | Component           | File                                        | Notes                                      |
| ---- | ------------------- | ------------------------------------------- | ------------------------------------------ |
| 2b.a | Application Service | `services/{feature}-application.service.ts` | Effect.Service composing API client + FC   |
| 2b.b | Program Exports     | (same file)                                 | `programXxx` exports for actor consumption |

**Checklist**:

- [ ] Application service imports API client + FC validation/domain services
- [ ] Each method documents its Three Phases (even if Logic phase is empty for pass-through reads)
- [ ] Application service is the single entrypoint for all actor operations (even simple reads)
- [ ] Simple reads pass through to API client (keeps imports consistent, easy to add logic later)
- [ ] Mutations apply FC validation/decisions between Collection and Persistence
- [ ] Program exports provide the full layer stack for `runWithUi`

**Command**: `"implement phase 2b"`

### Phase 2c: Presentation Utils

> Formatting and display-ordering functions that produce user-facing strings.
> These belong in `utils/`, NOT in domain services or actor emissions.

| Step | Component        | File                            | Notes                                                    |
| ---- | ---------------- | ------------------------------- | -------------------------------------------------------- |
| 2c.a | Formatting Utils | `utils/{feature}-formatting.ts` | Pure functions: format labels, messages, display sorting |

**Checklist**:

- [ ] All functions produce user-facing strings (labels, messages, display sorting)
- [ ] No domain logic in utils (boolean predicates, decision ADTs belong in domain services)
- [ ] Functions are pure — no I/O, no state, no side effects
- [ ] Referenced by composable for presentation text computeds

**Command**: `"implement phase 2c"`

### Phase 3: Shell — Input Validation (API Handler Equivalent)

> Input validations validate user form input and transform to domain types.

Uses `dm-create-input-validation-web` skill.

| Step | Component        | Skill                            | File                                          | Notes                   |
| ---- | ---------------- | -------------------------------- | --------------------------------------------- | ----------------------- |
| 3.a  | Input Validation | `dm-create-input-validation-web` | `input-validation/{use-case}-input.mapper.ts` | Raw form → domain types |

**Input Validation Flow**:

```
Component (raw form data)
    → Composable: validateInput(rawData)
        → Schema.decodeUnknownEither(InputSchema)(rawData)
            → Either<ParseError, DomainInput>
                → Left: extractSchemaErrors() → Record<string, string[]> → UI errors
                → Right: actorRef.send({ type: Event.CREATE, input: domainInput })
```

**Checklist**:

- [ ] Raw input schema defines what comes from UI (strings, numbers, no branded types)
- [ ] Domain input type has branded types and value objects
- [ ] `validateInput()` transforms and validates in one step
- [ ] `extractSchemaErrors()` produces standardized `Record<string, string[]>`
- [ ] Schema references constants from model (no magic numbers)
- [ ] Actor only receives validated domain-typed input from composable

**Command**: `"implement phase 3"`

### Phase 4: State Machine (Actor)

> XState actor consuming FC for guards/actions, application service programs for all I/O flows.

Uses `create-actor` skill with FC-integration sections.

| Step | Component        | Skill                       | File                                   | Notes                                                                                               |
| ---- | ---------------- | --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 4.a  | Actor            | `create-actor`              | `actors/{feature}.actor.ts`            | FC guards, domain-typed context                                                                     |
| 4.b  | Emission Handler | (see `create-actor` Step 3) | `composables/use{Feature}Emissions.ts` | Domain error → UI notification. Follow the emission subscription pattern from `create-actor` skill. |

**Actor FC-Integration Checklist**:

- [ ] Guards delegate to domain service pure functions (no inline business rules)
- [ ] Decision ADT transitions use `$match`/`$is` exhaustively
- [ ] Context uses domain types (branded IDs, entities), not raw `string`/`number`
- [ ] Events carry domain-typed payloads (validated by composable before send)
- [ ] No `Date.now()` in actor — use `DateTime.nowAsDate` in API client, pass as input
- [ ] Error handling uses Domain Error ADTs from `domain/errors.ts`
- [ ] `Match.orElse` is PROHIBITED for decision matching (violates closed world)
- [ ] fromCallback actors call application service programXxx() (single entrypoint for all I/O)
- [ ] Emissions carry domain-typed payloads but NO user-facing text (see Rule 16)

**Command**: `"implement phase 4"`

### Phase 5: Presentation — Composable + Component

> Composable as View Model + Component using composable.

Uses `web-create-composable` and `vue-props` skills.

| Step | Component               | Skill                   | File                          | Notes                               |
| ---- | ----------------------- | ----------------------- | ----------------------------- | ----------------------------------- |
| 5.a  | Composable (View Model) | `web-create-composable` | `composables/use{Feature}.ts` | Domain computeds + input validation |
| 5.b  | Component               | `vue-props`             | `components/{Component}.vue`  | Uses composable, no business logic  |

**Composable Responsibilities**:

| Concern              | Implementation                                          | Example                                                  |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Domain computeds     | `computed(() => domainService.canComplete(plan.value))` | `canComplete`, `isActive`                                |
| Input validation     | `validateInput(rawData)` via domain schemas             | `createFeature(rawInput)`                                |
| UI state translation | `computed(() => translateStatus(plan.value?.status))`   | `statusLabel`, `statusSeverity`                          |
| Presentation text    | Formatting utils → `computed`                           | `formatLabel(count)`, `buildMessage(name)` from `utils/` |
| Error display        | `errors: Ref<Record<string, string[]>>`                 | `errors`, `hasFieldError`, `getFieldError`               |

**Component Rules**:

- [ ] Component never contains business logic (`if (status === 'Active')` → composable computed)
- [ ] Component emits only validated domain input (raw data goes through composable first)
- [ ] All conditional rendering based on business rules uses composable computeds
- [ ] Component does not import from `domain/` directly — only through composable
- [ ] Composable uses formatting utils for presentation text
- [ ] Component/View formats toast text using utils (not from emission payload)

**Command**: `"implement phase 5"`

### Implementation Order

```
Phase 0  (Scaffold)      ──────►
                          Directory structure + barrels

Phase 1  (Core)          ──────────────────────────────────►
                          Types, Errors, Pure Services

Phase 2  (API Client)    ──────────────────────────────────►
                          HTTP + Boundary Mappers (depends on Core types)

Phase 2b (Application)   ──────────────────────────────────►
                          Three Phases coordinator (depends on Core + API client)

Phase 2c (Utils)         ──────────────────────────────────►
                          Presentation formatting (depends on Core types)

Phase 3  (Input)         ──────────────────────────────────►
                          Input Validations (depends on Core types)

Phase 4  (Actor)         ──────────────────────────────────►
                          State Machine (depends on Core + Application Service)

Phase 5  (Composable)    ──────────────────────────────────►
                          View Model + Component (depends on Core + Actor + Utils)
```

### Files to Create

```
web/src/views/{feature}/
├── domain/
│   ├── {feature}.model.ts                  # Constants, Branded Types, VOs, Entities, Enums
│   ├── errors.ts                           # Domain Errors (Data.TaggedError)
│   ├── index.ts                            # Barrel: model + errors + contracts + services
│   ├── contracts/
│   │   ├── index.ts                        # Barrel (mandatory)
│   │   └── {use-case}.contract.ts          # Input S.Struct + Decision ADTs
│   └── services/
│       ├── index.ts                        # Barrel (mandatory)
│       ├── {feature}-validation.service.ts # Pure boolean predicates / decision ADTs
│       └── {feature}-{logic}.service.ts    # Pure calculations/transformations
├── input-validation/
│   ├── index.ts                            # Barrel (mandatory)
│   └── {use-case}-input.mapper.ts          # Form input → domain types
├── api-client/
│   ├── {feature}.mappers.ts                # Boundary mappers (pure, no Effect) (Phase 2)
│   ├── {feature}.errors.ts                 # Error schemas + types + helpers (Phase 2)
│   ├── {feature}-client.service.ts         # Effect.Service + response handlers (Phase 2)
│   └── index.ts                            # Barrel exports
├── services/
│   └── {feature}-application.service.ts    # Application Service: Three Phases coordinator (Phase 2b)
├── utils/
│   └── {feature}-formatting.ts             # Presentation text + display sorting (Phase 2c)
├── actors/
│   └── {feature}.actor.ts                  # XState machine (Phase 4)
├── composables/
│   ├── use{Feature}.ts                     # View Model (Phase 5)
│   └── use{Feature}Emissions.ts            # Emission handler (Phase 4)
├── components/
│   └── {Component}.vue                     # Uses composable, no business logic (Phase 5)
└── {Feature}View.vue
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

**Phase 2 — API Client Service:**

- [ ] **Boundary mappers** decode API DTOs into domain types (`fromApiResponse`)
- [ ] **Boundary mappers** encode domain types to API payloads (`toApiPayload`)
- [ ] **DTOs never leak** past the API client boundary
- [ ] **API client methods** return domain types, never raw API response types
- [ ] **HTTP errors** are mapped to domain-tagged errors (not raw HTTP status types)
- [ ] **program exports** provide the service layer for application service consumption

**Phase 2b — Application Service:**

- [ ] **Application service** imports API Client + FC validation/domain services
- [ ] **Each method** documents its Three Phases (even if Logic phase is empty for pass-through reads)
- [ ] **Application service** is the single entrypoint for all actor operations (even simple reads)
- [ ] **Simple reads** pass through to API client (keeps imports consistent, easy to add logic later)
- [ ] **Mutations** apply FC validation/decisions between Collection and Persistence
- [ ] **Program exports** provide the full layer stack for `runWithUi`

**Phase 2c — Presentation Utils:**

- [ ] **All functions** produce user-facing strings (labels, messages, display sorting)
- [ ] **No domain logic** in utils (boolean predicates, decision ADTs belong in domain services)
- [ ] **Functions are pure** — no I/O, no state, no side effects
- [ ] **Referenced** by composable for presentation text computeds

**Phase 3 — Input Validation:**

- [ ] **Input validations** validate raw form data → domain types
- [ ] **Schema references** named constants (no magic numbers)
- [ ] **extractSchemaErrors** produces `Record<string, string[]>` for UI
- [ ] **Composable** executes validation, not the actor

**Phase 4 — State Machine:**

- [ ] **Guards** delegate to FC domain service pure functions
- [ ] **Decision ADT transitions** use `$match`/`$is` exhaustively
- [ ] **Context** uses domain types (branded IDs, entities)
- [ ] **Events** carry domain-typed payloads (validated before send)
- [ ] **No `Date.now()`** in actor — clock accessed in API client shell
- [ ] **Error handling** uses Domain Error ADTs
- [ ] **fromCallback** actors call application service programXxx() (single entrypoint for all I/O)
- [ ] **Emissions** carry domain-typed payloads but NO user-facing text (see Rule 16)
- [ ] **Emissions composable** (`use{Feature}Emissions.ts`) dispatches to callbacks

**Phase 5 — Composable + Component:**

- [ ] **Composable** exposes FC services as computeds
- [ ] **Composable** validates input with Schema before sending to actor
- [ ] **Composable** translates domain types to UI strings (only layer allowed)
- [ ] **Composable** uses formatting utils from `utils/{feature}-formatting.ts` for presentation text
- [ ] **Component** never contains business logic
- [ ] **Component** emits only validated domain input
- [ ] **Component/View** formats toast text using utils (not from emission payload)

## 9. Component Behavior Boundary

Documents which rules live in FC vs component.

| Rule / Behavior                         | Where                                                       | Why                              |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------------- |
| {e.g., "Can user complete plan?"}       | FC: `validationService.canComplete()` → composable computed | Business rule                    |
| {e.g., "What phase is current period?"} | FC: `assessPeriodPhase()` → composable computed             | State derivation                 |
| {e.g., "Status badge color"}            | Composable: `planStatusColor` computed                      | UI translation (only composable) |
| {e.g., "Form field required?"}          | Input schema constraint                                     | Structural validation            |
| {e.g., "Drag handle position"}          | Component directly                                          | UI mechanics, not business       |
| {e.g., "Button loading spinner"}        | Actor state → composable selector                           | Async state from actor           |

**Rule**: If a component introduces business-driven conditional rendering or enabling/disabling, it MUST be derived from FC services via composable computed. No business rules in `<template>` or `<script setup>`.

## 10. Type Sharing Strategy

| What                                                | Where                                                 | Reason                                     |
| --------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Wire format schemas (`PlanResponseSchema`)          | `@ketone/shared`                                      | Define JSON shape for API ↔ web           |
| Common validation (`EmailSchema`, `PasswordSchema`) | `@ketone/shared`                                      | Used by both for input validation          |
| Business constants (`MIN_FASTING_DURATION`)         | `@ketone/shared/constants/` or feature `constants.ts` | Shared business rules                      |
| Status enums in wire format (`PlanStatusSchema`)    | `@ketone/shared`                                      | Part of API response contract              |
| Branded types (`FastingDuration`, `PlanId`)         | Feature `domain/` (each side)                         | Compile-time construct, doesn't cross wire |
| Value objects, entities                             | Feature `domain/` (each side)                         | May have different shapes per context      |
| Contracts, domain services                          | Feature `domain/` (each side)                         | Feature-specific logic                     |

**Orphan Test**: If `@ketone/shared` is deleted, both sides can redefine wire schemas. If a feature's `domain/` is deleted, only that feature breaks.

## 11. Warning Signs Detected

[List any problematic patterns found in the spec that were addressed:]

- [ ] Optional fields dependent on other fields → Converted to Tagged Enum
- [ ] Boolean discriminators → Converted to Literal/Tagged Enum
- [ ] Mixed I/O and logic → Separated into functional core
- [ ] Strings/numbers that should be distinct → Use Brand.refined
- [ ] `default` cases in switches → Use Match.exhaustive
- [ ] Validation inside domain core → Move to boundary
- [ ] Business logic in component template → Move to FC service via composable
- [ ] Raw DTOs in actor context → Map through API client boundary

## 12. Open Questions

[Decisions that require human input before implementation:]

1. {Question about ambiguous requirement}
2. {Question about design choice}

## 13. Next Steps

1. **Review** this document for correctness and completeness
2. **Verify** Type Justification table (Section 3) - each type has correct category
3. **Verify** Closed World Checklist (Section 7) - all items will be satisfied
4. **Verify** FC/IS Implementation Checklist (Section 8) - all layers covered
5. **Verify** Component Behavior Boundary (Section 9) - business rules in FC, not components
6. **Verify** Type Sharing Strategy (Section 10) - nothing in `@ketone/shared` that should be local
7. **Resolve** any open questions above
8. **Implement by phase**:
   - `"implement phase 0"` → Scaffold domain directory
   - `"implement phase 1"` → Functional Core
   - `"implement phase 2"` → API Client Service
   - `"implement phase 2b"` → Application Service
   - `"implement phase 2c"` → Presentation Utils
   - `"implement phase 3"` → Input Validation
   - `"implement phase 4"` → State Machine
   - `"implement phase 5"` → Composable + Component
   - Or `"implement all"` / `"implement the plan"` → All phases in order

Each phase builds on the previous. Phase 0 (Scaffold) and Phase 1 (Core) should be implemented first as they define the domain types used by all other phases.

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

1. The design document has been created at `web/src/views/{feature}/domain/functional-domain-design.md`
2. They should review all sections, especially:
   - **Design Principles** (Section 2) - Web validation layers are correct
   - **Type Justification** (Section 3) - Each type has correct category and reason
   - **Architecture Phases** (Section 6) - All 7 phases have correct components
   - **Component Behavior Boundary** (Section 9) - Business rules are in FC, not components
   - **Type Sharing Strategy** (Section 10) - Correct split between `@ketone/shared` and `domain/`
   - **Closed World Checklist** (Section 7) - All items will be satisfied
   - **FC/IS Implementation Checklist** (Section 8) - All layers covered
   - **Open Questions** (Section 12) - Need answers before implementing
3. To proceed with implementation:
   - **By phase**: `"implement phase 0"`, `"implement phase 1"`, etc.
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
/dm-design-web

## Feature: Plan Management

A plan defines an intermittent fasting schedule with periods.
Plans can be: active, completed, or cancelled.
Users can create, cancel, or complete plans.
Periods have fasting duration and eating window with min/max constraints.
```

## Notes

- This skill generates documentation only, no code
- The document is designed for human review before implementation
- Keep both YAMLs in collapsible sections for reference during implementation
- **Type Justification** ensures every type follows the Decision Flowchart
- **Closed World Checklist** ensures compiler-enforced completeness
- **Core/Shell separation** is explicit in the Architecture Phases (Section 6)
- The FC layer (Phase 1) is **identical to API** — same skills, same patterns
- Phases 2-5 (including 2b, 2c) are web-specific shells adapted from API's Phases 2-4

## Implementation Commands

When the user requests implementation, Claude should read the generated MD file and execute skills based on the command:

| Command                                    | Action                                                        |
| ------------------------------------------ | ------------------------------------------------------------- |
| `"implement phase 0"`                      | Execute Phase 0 (Scaffold domain directory)                   |
| `"implement phase 1"`                      | Execute Phase 1 (Functional Core)                             |
| `"implement phase 2"`                      | Execute Phase 2 (API Client Service)                          |
| `"implement phase 2b"`                     | Execute Phase 2b (Application Service)                        |
| `"implement phase 2c"`                     | Execute Phase 2c (Presentation Utils)                         |
| `"implement phase 3"`                      | Execute Phase 3 (Input Validation)                            |
| `"implement phase 4"`                      | Execute Phase 4 (State Machine)                               |
| `"implement phase 5"`                      | Execute Phase 5 (Composable + Component)                      |
| `"implement all"` / `"implement the plan"` | Execute all phases in order (0 → 1 → 2 → 2b → 2c → 3 → 4 → 5) |

**Phase Dependencies**:

- Phase 0 has no dependencies (scaffold first)
- Phase 1 depends on Phase 0 (scaffold must exist)
- Phase 2 depends on Phase 1 types (domain types, errors)
- Phase 2b depends on Phase 1 + Phase 2 (core services + API client)
- Phase 2c depends on Phase 1 types (domain types for formatting)
- Phase 3 depends on Phase 1 types (branded types for input validations)
- Phase 4 depends on Phase 1 + Phase 2b (core services + application service programs)
- Phase 5 depends on Phase 1 + Phase 4 + Phase 2c (core services + actor + formatting utils)

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
// Three Phases usage (in {ApplicationServiceName}.{method}):
//   1. COLLECTION (Shell — API Client): {what is loaded via HTTP}
//   2. LOGIC (Core):                    {which pure functions are called}
//   3. PERSISTENCE (Shell — API Client): {what is sent via HTTP}
// ============================================================================
```

### Rule 4: Dual Export Pattern

Domain services that wrap pure functions MUST export both:

1. **Standalone pure functions** — for direct use in web shell (actor guards, composable computeds) and unit testing
2. **Effect.Service wrapper** — for consumers that use Effect DI (API client services, Effect pipelines)

> **Web vs API**: In the API, consumers use `yield* ServiceName` (Effect DI). In the web, actor guards and composable computeds import standalone pure functions directly — they run outside Effect context. The Effect.Service wrapper is still created for API client services that compose in Effect pipelines.

```typescript
// Standalone export (for actor guards, composable computeds, and unit testing)
export const calculatePeriodDates = (startDate: Date, periods: ReadonlyArray<PeriodDurationInput>): CalculatedPeriod[] => { ... };

// Effect.Service wrapper (for API client services using Effect DI)
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

**Phase 4 (Actor)** consumes FC services for guards and domain-typed context.
The Three Phases composition is coordinated by the Application Service.
The actor calls application service programXxx() exports as its single entrypoint for all I/O.
The application service passes through to API client for simple reads, and applies FC logic for mutations.

### Rule 6: Contracts Are Mandatory

Every use case that mutates state MUST have a contract in `domain/contracts/`:

- `{use-case}.contract.ts` with input type + decision ADT (Data.TaggedEnum)
- Contract variants represent all possible outcomes (success paths + failure reasons)
- Contracts are consumed by the actor (Shell) to make decisions

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

### Rule 8: Web Consumption Pattern

In the web shell, actor guards and composable computeds import standalone pure functions directly (they execute outside Effect context). This differs from the API where consumers use `yield* ServiceName`.

The web pattern is:

```typescript
// In composable: import standalone functions (FC is pure, no DI needed in web shell)
import { canCompletePlan, assessProgress } from '../domain';

const canComplete = computed(() => canCompletePlan(activePlan.value));
const progress = computed(() => assessProgress(activePlan.value));
```

```typescript
// In actor guard: import standalone functions
import { isPlanInProgress } from '../domain';

guards: {
  canStart: ({ context }) => isPlanInProgress(context.plan?.status),
},
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

// Shell (actor guard): interprets
guards: {
  isPlanActive: ({ context }) => isPlanInProgress(context.plan.status),
},
```

**TaggedEnum decision** — for 3+ possible outcomes with different data:

```typescript
// Core (pure): returns ADT
export const decidePlanCreation = (input): PlanCreationDecision => { ... };

// Shell (actor): matches exhaustively
const decision = decidePlanCreation(input);
PlanCreationDecision.$match(decision, {
  CanCreate: (d) => sendBack({ type: Event.ON_CREATE_APPROVED, data: d }),
  BlockedByActivePlan: (d) => sendBack({ type: Event.ON_BLOCKED, reason: d }),
  BlockedByActiveCycle: (d) => sendBack({ type: Event.ON_BLOCKED, reason: d }),
});
```

**Never** use `Effect<void, DomainError>` in domain services — it mixes Core with Shell.

### Rule 10: API Client Boundary

API client service MUST decode API responses into domain types via explicit boundary mappers. Never expose raw DTOs to actor/composable.

```typescript
// ✅ CORRECT: API client returns domain types
const fromPlanResponse = (dto: PlanResponse): Plan => ({
  id: PlanId(dto.id),
  status: dto.status as PlanStatus,
  periods: dto.periods.map(fromPeriodResponse),
});

// In service method:
list: () =>
  authenticatedClient.execute(request).pipe(
    Effect.scoped,
    Effect.flatMap(handleListResponse),
    Effect.map((dtos) => dtos.map(fromPlanResponse)), // ← boundary
  ),

// ❌ WRONG: Actor receives raw DTO
list: () =>
  authenticatedClient.execute(request).pipe(
    Effect.scoped,
    Effect.flatMap(handleListResponse), // returns raw DTO
  ),
```

### Rule 11: Actor Consumes FC for Decisions

XState guards MUST use pure predicates from FC domain services. Transitions driven by Decision ADTs MUST use `Match.exhaustive` or `$match`. No `Date.now()` in actor — use `DateTime.nowAsDate` in Effect shell (API client), pass as input.

```typescript
// ✅ CORRECT: Guard uses FC predicate
guards: {
  canComplete: ({ context }) => canCompletePlan(context.plan),
},

// ✅ CORRECT: Decision ADT in fromCallback
const createLogic = fromCallback(({ sendBack, input }) =>
  runWithUi(
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate;
      return decidePlanCreation({ ...input, now });
    }).pipe(Effect.provide(/* layers */)),
    (decision) => {
      PlanCreationDecision.$match(decision, {
        CanCreate: (d) => sendBack({ type: Event.ON_APPROVED, ...d }),
        Blocked: (d) => sendBack({ type: Event.ON_BLOCKED, ...d }),
      });
    },
    (error) => sendBack({ type: Event.ON_ERROR, error }),
  ),
);

// ❌ WRONG: Inline business rule in guard
guards: {
  canComplete: ({ context }) => context.plan.status === 'InProgress' && context.plan.periods.every(p => p.completed),
},
```

### Rule 12: Actor Receives Only Domain Types

Actor never receives raw user input. Composable validates and transforms to domain types before sending events to actor.

```typescript
// ✅ CORRECT: Composable validates, actor receives domain types
// In composable:
const createPlan = (rawInput: RawFormData) => {
  const result = S.decodeUnknownEither(CreatePlanInput)(rawInput);
  if (Either.isLeft(result)) {
    errors.value = extractSchemaErrors(result.left);
    return;
  }
  actorRef.send({ type: Event.CREATE, input: result.right }); // domain-typed
};

// ❌ WRONG: Actor receives raw form data
actorRef.send({ type: Event.CREATE, name: formName, hours: formHours }); // raw strings
```

### Rule 13: Composable Is the View Model

Composable is the ONLY layer allowed to translate domain results into UI states/strings. It exposes domain services as computeds, validates input with Schema, and translates domain errors to user-facing messages.

```typescript
// ✅ CORRECT: Composable translates domain → UI
const planStatusLabel = computed(() => {
  const status = activePlan.value?.status;
  if (!status) return '';
  return Match.value(status).pipe(
    Match.when('Active', () => 'In Progress'),
    Match.when('Completed', () => 'Done'),
    Match.when('Cancelled', () => 'Cancelled'),
    Match.exhaustive,
  );
});

// ❌ WRONG: Component contains domain → UI logic
// <span>{{ plan.status === 'Active' ? 'In Progress' : plan.status }}</span>
```

### Rule 14: Component Emits Only Validated Domain Input

Components never emit raw DTOs or unvalidated data. All component outputs pass through composable validation first.

```typescript
// ✅ CORRECT: Component calls composable method (which validates)
<Button @click="createPlan(formData)" />

// In composable: createPlan validates with Schema before sending to actor

// ❌ WRONG: Component emits raw data directly to actor
<Button @click="actorRef.send({ type: 'CREATE', ...rawFormData })" />
```

### Rule 15: No Presentation in Domain Services

Domain services must NOT contain functions that produce user-facing strings.
If a function formats text for display, builds confirmation messages, or sorts for
UI ordering, it belongs in `utils/{feature}-formatting.ts`.

**Diagnostic**: If a domain service function's return type is `string` and that
string is meant for user display, it belongs in `utils/`.

```typescript
// ✅ CORRECT: Domain service returns boolean (business rule)
export const isAtTemplateLimit = (count: number): boolean => count >= MAX_CUSTOM_TEMPLATES;

// ✅ CORRECT: Utils returns user-facing string (presentation)
// utils/plan-template-formatting.ts
export const formatLimitReachedMessage = (max: number): string =>
  `You have ${max} saved plans, which is the maximum allowed.`;

// ❌ WRONG: Domain service returns UI string
export const getLimitReachedMessage = (max: number): string =>
  `You have ${max} saved plans, which is the maximum allowed.`;
```

**Does NOT belong in domain services**:

- `formatPeriodCountLabel(count)` → produces "1 period" / "5 periods" (presentation)
- `buildDeleteConfirmationMessage(name)` → produces confirmation dialog text (presentation)
- `sortTemplatesByRecency(templates)` → sorts for display order (presentation)
- `formatLimitReachedMessage(max)` → produces toast text (presentation)

### Rule 16: Emissions Carry No UI Text

Actor emissions may carry domain-typed payloads (entities, branded IDs) but NEVER
user-facing text (formatted messages, labels, confirmation strings).
The component/view formats UI text using `utils/` functions.

**Allowed**: Domain payloads — `{ type: Emit.LOADED; template: PlanTemplateDetail }`
**Allowed**: Bare facts — `{ type: Emit.DUPLICATED }`
**Allowed**: Error strings — `{ type: Emit.ERROR; error: string }` (from API client/API)
**Forbidden**: UI text — `{ type: Emit.LIMIT_REACHED; message: "You have 20 saved plans..." }`

```typescript
// ✅ CORRECT: Emission carries domain payload
emitLoaded: emit(({ event }) => {
  assertEvent(event, Event.ON_LOAD_SUCCESS);
  return { type: Emit.TEMPLATE_LOADED, template: event.result };
}),

// ✅ CORRECT: Emission carries bare fact (no data needed)
emitDuplicated: emit(() => ({
  type: Emit.TEMPLATE_DUPLICATED,
})),

// ✅ CORRECT: Emission carries bare fact — consumer formats message
emitLimitReached: emit(() => ({
  type: Emit.TEMPLATE_LIMIT_REACHED,
})),

// ❌ WRONG: Emission carries UI text
emitLimitReached: emit(() => ({
  type: Emit.TEMPLATE_LIMIT_REACHED,
  message: formatLimitReachedMessage(MAX_CUSTOM_TEMPLATES),
})),
```
