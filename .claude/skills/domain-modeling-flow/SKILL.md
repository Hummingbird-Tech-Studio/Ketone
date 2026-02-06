---
name: domain-modeling-flow
description: Complete functional domain modeling workflow. Use when given technical specs, requirements, or feature descriptions to generate domain code with entities, value objects, services, and tests.
model: opus
---

# Functional Domain Modeling Flow

You have been given a technical document describing a feature or domain. Execute this workflow to generate a complete functional domain model.

## Step 1: Analyze the Document

Use the **domain-analyzer** agent to analyze the provided document.

**Input**: The technical document (requirements, specs, user stories, etc.)

**Expected output**: Structured YAML with:

### Core Components

- Entities (with identity)
- Value Objects (immutable, no identity)
- Literal Enums (same structure for all variants)
- Tagged Enums (different data per variant)
- Semantic Wrappers (pipeline stages)
- Domain Errors
- Boundary Mappers (DTOs)
- Contracts (inputs/outputs)
- Services and their dependencies

### Additional Outputs

- **Reified Decisions**: Decisions modeled as ADTs (e.g., `CycleUpdateDecision` with `UpdateDates | NoChange | Invalid`)
- **Data Seams**: Architectural boundaries where data transforms between layers (API → Domain → Repository)
- **Warning Signs**: Patterns that indicate illegal states:
  - "This field only applies when..."
  - Optional fields dependent on other fields
  - Boolean flags that change behavior
  - `if (type === X)` patterns

## Decision Flowchart

When analyzing, use this flowchart to determine the right type:

```
Is it a single primitive with constraints?
  → YES: Branded Type (dm-create-branded-type)

Is it multiple fields that always go together?
  → YES: Value Object with S.Class (dm-create-value-object)

Are all variants the same shape?
  → YES: Literal Enum with S.Literal (dm-create-literal-enum)

Do variants have different data?
  → YES: Tagged Enum / ADT (dm-create-tagged-enum)

Does it need identity and lifecycle?
  → YES: Entity (dm-create-entity)
```

## Step 2: Plan and Generate Code

Use the **domain-planner** agent with the YAML analysis from Step 1.

**The planner will**:

1. Apply the Orphan Test to identify shared vs module-specific types
2. Order components by dependencies (types before services)
3. Map each component to the appropriate skill
4. Execute each skill in order to generate the code

**Skills available to the planner**:

- `dm-scaffold-domain-module` - Create module structure
- `dm-scaffold-data-pipeline` - Create data seam transformations
- `dm-create-branded-type` - IDs and constrained primitives
- `dm-create-literal-enum` - Enums with same structure
- `dm-create-value-object` - Immutable composites
- `dm-create-entity` - Objects with identity
- `dm-create-tagged-enum` - ADTs with different data per variant
- `dm-create-domain-error` - Typed errors
- `dm-create-smart-constructors` - Validated construction
- `dm-create-semantic-wrapper` - Pipeline stage types
- `dm-create-contract` - Input/Output schemas
- `dm-create-boundary-mapper` - Domain <-> DTO conversion
- `dm-create-validation-service` - Cross-field validation
- `dm-create-domain-service` - Pure business logic
- `dm-create-functional-core-flow` - Complete flows
- `dm-refactor-to-sum-type` - Transform AND-types to OR-types (illegal state elimination)

## Step 3: Review Generated Code

Use the **domain-reviewer** agent to validate the generated code.

**Review checklist**:

### Structural Health

- [ ] No optional fields that depend on other fields
- [ ] No "this field only applies when..." comments
- [ ] S.filter is INSIDE S.Class, not outside
- [ ] No defensive validation in constructors

### Closed World Assumption

- [ ] All enums use `S.Literal` union (not `S.String`)
- [ ] `Match.exhaustive` used for all pattern matching
- [ ] No `default` or `else` cases that hide bugs
- [ ] Adding a variant causes compile errors in all switch sites

### Pattern Compliance

- [ ] No `Map<K, V>` for known keys → use structs
- [ ] No boolean discriminators with optional fields → use Tagged Enum
- [ ] No `type` field with if/switch → use Tagged Enum
- [ ] Effect.Service for DI, not classes with `new`

### Architecture

- [ ] Functional core (pure domain logic)
- [ ] Imperative shell (I/O, Effects)
- [ ] Clear separation between layers
- [ ] Related types in same module (cohesion)

**Output**: Violation report with severity and suggestions.

## Step 4: Generate Tests

Use the **domain-test-generator** agent to create comprehensive tests.

**Test categories**:

- Edge cases (boundaries, empty values, limits)
- Property-based tests (invariants always hold)
- Error path tests (validations that must fail)
- Roundtrip tests (domain <-> DTO preserves data)
- Exhaustive match tests (all variants handled)

## Step 5: Refactor if Needed

If the reviewer found violations, use the **domain-refactorer** agent to fix them.

**Common refactors**:

- Optional fields dependent on others → Tagged Enum (AND → OR)
- Validation in constructor → Smart Constructor with S.filter
- Boolean discriminators → Literal Enum
- Mixed I/O and logic → Separate into functional core
- `Map<string, T>` with known keys → Struct with explicit fields
- `default` case in switch → Exhaustive match with `Match.exhaustive`

---

## Usage

Provide the technical document after invoking this skill:

```
/domain-modeling-flow

[Your technical document here]
```

Or describe what you want:

```
Analyze this feature spec and generate the domain model:

[Feature specification]
```
