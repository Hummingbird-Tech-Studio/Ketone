# Web FC/IS Architecture

> Cross-cutting architecture overview for the Ketone web package.
> Feature-specific designs live in each feature's `domain/functional-domain-design.md`.
> Reference implementation: `web/src/views/planTemplates/`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Domain Layer (Functional Core + Boundary Artifacts)](#2-domain-layer-functional-core--boundary-artifacts)
3. [Shell Layers Breakdown](#3-shell-layers-breakdown)
4. [Complete Data Flow Diagrams](#4-complete-data-flow-diagrams)
5. [Responsibility Matrix](#5-responsibility-matrix)
6. [API - Web Analogy Table](#6-api--web-analogy-table)
7. [The FC Delegation Rule](#7-the-fc-delegation-rule)
8. [Key Architectural Rules](#8-key-architectural-rules)
9. [Directory Structure Reference](#9-directory-structure-reference)
10. [Decision Flowchart: Where Does This Logic Go?](#10-decision-flowchart-where-does-this-logic-go)
11. [Glossary](#11-glossary)
12. [FC/IS Compliance Checklist](#12-fcis-compliance-checklist)

---

## 1. Architecture Overview

### Two Shell Families

Unlike a backend (one shell wrapping the core), the web has **two families of shell layers**
flanking a central Functional Core. Each family groups related sublayers that share the same
I/O concern:

- **API-side shells** (Gateway, Application Service): communicate with the backend API over HTTP
- **UI-side shells** (Actor, Composable, Component): communicate with the Vue framework and the user

```
    API-SIDE SHELLS                          UI-SIDE SHELLS

  +-------------------------+              +--------------------------+
  |   API Client Service    |              |       Component          |
  |       (Gateway)         |              |      (.vue files)        |
  +-----------+-------------+              +------------+-------------+
              |                                         |
              v                                         v
  +-------------------------+              +--------------------------+
  |  Application Service    |<-------------|      Composable          |
  |   (Three Phases)        |  Actor calls |     (View Model)         |
  +-----------+-------------+  programs    +------------+-------------+
              |                                         |
              v                                         v
       +============+                      +--------------------------+
       ||          ||<---------------------+         Actor            |
       ||    FC    ||  guards, decisions   |    (State Machine)       |
       ||          ||                      +--------------------------+
       +============+
```

### Why Two Families?

| Concern      | API-side shells (Gateway, App Service) | UI-side shells (Actor, Composable, Component) |
| ------------ | -------------------------------------- | --------------------------------------------- |
| I/O type     | HTTP requests to backend API           | Reactive Vue bindings to DOM                  |
| State format | Effect programs, domain errors         | XState states, Vue refs                       |
| Error shape  | `Data.TaggedError` domain errors       | User-facing toast messages                    |
| Boundary     | DTO (wire format) <-> Domain types     | Domain types <-> UI strings                   |

The FC sits in the middle with **zero I/O, zero state, zero framework coupling**. Both shells
orchestrate it. This separation keeps each layer testable in isolation.

---

## 2. Domain Layer (Functional Core + Boundary Artifacts)

The `domain/` directory is **primarily** the Functional Core, but it also houses boundary
artifacts (contracts and schemas) that define the interface between Shell and Core. These
boundary artifacts contain no I/O, but they are not pure logic either -- they define the
**shape** of data crossing the FC boundary.

| Subdirectory         | Classification | Why it lives in `domain/`                   |
| -------------------- | -------------- | ------------------------------------------- |
| `services/`          | **Pure FC**    | Pure functions, zero I/O                    |
| `{feature}.model.ts` | **Pure FC**    | Branded types, VOs, ADTs                    |
| `errors.ts`          | **Pure FC**    | Domain error definitions                    |
| `contracts/`         | **Boundary**   | Defines what operations need (domain-typed) |
| `schemas/`           | **Boundary**   | Transforms raw input to domain types        |

### 2.1 Directory Layout

```
views/{feature}/domain/
  +-- {feature}.model.ts       Constants, branded types, VOs, ADTs, smart constructors  [FC]
  +-- errors.ts                Domain errors (Data.TaggedError)                         [FC]
  +-- contracts/               Use-case input interfaces (one per mutation)             [Boundary]
  +-- schemas/                 Raw input -> domain type transformers (one per form)     [Boundary]
  +-- services/                Pure functions (validation, calculation, decisions)       [FC]
  +-- index.ts                 Barrel re-exports
```

### 2.2 Contract vs Schema vs Model

These three artifacts cause the most confusion. Here is how they differ:

```
  User types        Schema validates       Contract defines       Model represents
  in a form  ---->  and transforms   ---->  what the use-case ---> the domain
  (raw strings)     to domain types         needs to execute       entities
```

| Aspect            | Model                                        | Contract                                    | Schema                                                    |
| ----------------- | -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| **Purpose**       | "What IS"                                    | "What an operation NEEDS"                   | "How to transform UI -> Domain"                           |
| **Defines**       | Branded types, VOs, ADTs, smart constructors | Use-case input interface with branded types | Validation + transformation from raw to branded           |
| **Used by**       | All layers                                   | Application Service (Three Phases)          | Composable (before sending to actor)                      |
| **Changes when**  | Business concepts change                     | Use-case requirements change                | Form/UI changes                                           |
| **Contains I/O?** | Never                                        | Never                                       | Never                                                     |
| **Example**       | `PlanDetail`, `SaveTimelineDecision`         | `CreatePlanInput { name: PlanName }`        | `validateCreatePlanInput(raw) -> Either<CreatePlanInput>` |

Key distinction: **Schema** is the bridge between raw UI data and the **Contract**.
The **Contract** is the bridge between the composable/actor and the Application Service.
The **Model** defines the domain vocabulary that both Contract and Schema use.

### 2.3 Models -- Branded Types, Value Objects, ADTs

The model file (`{feature}.model.ts`) is the domain vocabulary. It contains:

**Constants** -- Named limits, never magic numbers:

```typescript
export const MIN_PLAN_NAME_LENGTH = 1;
export const MAX_PLAN_NAME_LENGTH = 100;
```

**Branded Types** -- Primitives with domain constraints:

```typescript
export type PlanName = string & Brand.Brand<'PlanName'>;
export const PlanName = Brand.refined<PlanName>(
  (s) => s.length >= MIN_PLAN_NAME_LENGTH && s.length <= MAX_PLAN_NAME_LENGTH,
  (s) => Brand.error(`Expected plan name between ${MIN_PLAN_NAME_LENGTH}-${MAX_PLAN_NAME_LENGTH} chars`),
);
```

**Value Objects** -- Multiple fields that always travel together (via `S.Class`):

```typescript
export class PlanPeriodUpdate extends S.Class<PlanPeriodUpdate>('PlanPeriodUpdate')({
  id: S.optional(PeriodId),
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
}) {}
```

**Decision ADTs** -- Reified business decisions with variant-specific data:

```typescript
export type SaveTimelineDecision = Data.TaggedEnum<{
  NoChanges: {};
  OnlyStartDate: { readonly startDate: Date };
  OnlyPeriods: { readonly periods: ReadonlyArray<PlanPeriodUpdate> };
  StartDateAndPeriods: { readonly startDate: Date; readonly periods: ReadonlyArray<PlanPeriodUpdate> };
}>;
export const SaveTimelineDecision = Data.taggedEnum<SaveTimelineDecision>();
export const { $match: matchSaveTimelineDecision } = SaveTimelineDecision;
```

**Smart Constructors** -- Parse unknown values into branded types:

```typescript
export const createPlanId = (value: unknown): Effect.Effect<PlanId, ParseResult.ParseError> =>
  S.decodeUnknown(PlanId)(value);
export const makePlanId = (value: unknown): Option.Option<PlanId> => Effect.runSync(Effect.option(createPlanId(value)));
```

#### Type Decision Flowchart

```
Is it a single primitive with constraints?      --> Brand.refined
Is it multiple fields that always go together?  --> S.Class (Value Object)
Are all variants the same shape?                --> S.Literal union (enum)
Do variants carry different data?               --> Data.TaggedEnum (ADT)
Does it need identity and lifecycle?            --> S.Class (Entity)
```

### 2.4 Contracts -- Use-Case Interfaces

A contract defines **what a mutation needs** using already-branded domain types.
One contract per mutating use case.

Contracts are defined as `S.Struct` schemas with a derived type alias:

```typescript
// domain/contracts/create-plan.contract.ts
export const CreatePlanInput = S.Struct({
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  startDate: S.DateFromSelf,
  periods: S.Array(
    S.Struct({
      fastingDuration: FastingDurationSchema,
      eatingWindow: EatingWindowSchema,
    }),
  ),
});
export type CreatePlanInput = S.Schema.Type<typeof CreatePlanInput>;
```

**When to create a contract:**

- Every mutating operation (create, update, delete, cancel, complete) gets one
- Read-only operations (get, list) typically don't need one
- If the contract includes context the actor merges in (e.g. `currentCount`), document it

Contracts may include fields the UI does NOT provide -- the actor merges them from context:

```typescript
// Contract needs currentCount (from actor context, not from UI)
export const CreateFromPlanInput = S.Struct({
  planId: S.UUID,
  currentCount: S.Number, // Merged by actor
  maxTemplates: S.Number, // Merged by actor
});
export type CreateFromPlanInput = S.Schema.Type<typeof CreateFromPlanInput>;
```

### 2.5 Schemas -- Input Validation and Transformation

Each form gets an input schema with two mandatory parts, plus an optional shared error
extraction utility where the feature needs field-level error display:

```
1. Raw Input class       - S.Class with branded schemas from model              [mandatory]
2. Validation function   - Transforms raw -> contract type, returns Either      [mandatory]
3. Error extraction      - ParseError -> Record<string, string[]>               [optional, shared]
```

The Raw Input class uses **branded schemas directly** from the model (`PlanNameSchema`,
`PlanDescriptionSchema`, `PeriodUpdateInputSchema`, etc.), so validation and branding
happen in a single decode step. No `as` casts are needed -- the decoded fields are
already domain-typed:

```typescript
// domain/schemas/create-plan-input.schema.ts
export class CreatePlanRawInput extends S.Class<CreatePlanRawInput>('CreatePlanRawInput')({
  name: PlanNameSchema,
  description: PlanDescriptionSchema,
  startDate: S.DateFromSelf,
  periods: S.Array(PeriodUpdateInputSchema).pipe(
    S.minItems(MIN_PERIODS, { message: () => `At least ${MIN_PERIODS} period required` }),
    S.maxItems(MAX_PERIODS, { message: () => `At most ${MAX_PERIODS} periods allowed` }),
  ),
}) {}

export const validateCreatePlanInput = (raw: unknown): Either.Either<CreatePlanInput, ParseError> =>
  S.decodeUnknownEither(CreatePlanRawInput)(raw).pipe(
    Either.map(
      (validated): CreatePlanInput => ({
        name: validated.name,
        description: validated.description.trim() === '' ? null : validated.description,
        startDate: validated.startDate,
        periods: validated.periods.map((p) => ({
          fastingDuration: p.fastingDuration,
          eatingWindow: p.eatingWindow,
        })),
      }),
    ),
  );
```

The schema **transforms** raw UI values into branded domain types:

- `"My Plan"` -> `PlanName("My Plan")` (validated)
- `""` (empty description) -> `null`
- `[{ fastingDuration: 16, eatingWindow: 8 }]` -> `[{ fastingDuration: FastingDuration(16), eatingWindow: EatingWindow(8) }]`

Note: `CreatePlanInput` periods do **not** include `order` -- the API assigns order server-side.
Other contracts like `UpdateTemplateInput` include order via `TemplatePeriodConfig`.

### 2.6 Domain Functions and Service Adapters

Each `domain/services/` file contains two distinct artifacts:

| Artifact             | What it is                                            | Primary consumers                                  |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| **Domain Functions** | Standalone pure functions -- the actual FC logic      | Composables (`computed()`), Actors (guards), tests |
| **Service Adapter**  | `Effect.Service` that wraps the same functions for DI | Application Services (via `yield*`)                |

**The domain functions are the primary export.** They are plain TypeScript functions with
no Effect dependency, no I/O, no error channel, and no async behavior. They are consumed
directly by composables and actors because those consumers are synchronous:

```
  Actor guard              must return boolean synchronously   --> direct function call
  Composable computed()    must return value synchronously     --> direct function call
  Application Service      already in Effect.gen               --> either works (DI or direct)
```

**The Service Adapter is secondary.** It exists so Application Services can declare FC
dependencies explicitly via `yield*`, maintaining the pattern that all dependencies are visible
in the service constructor. The adapter adds no logic -- it just re-exports the same functions
through Effect's DI system.

#### Why not wrap domain functions in Effect?

These functions are pure, synchronous, deterministic, and dependency-free. Effect's
capabilities solve problems they don't have:

| Effect capability          | Needed? | Why not                                      |
| -------------------------- | ------- | -------------------------------------------- |
| Error channel (`E`)        | No      | They return values/booleans/ADTs, never fail |
| Dependency injection (`R`) | No      | They are pure -- no deps to inject           |
| Async/fiber runtime        | No      | They are synchronous                         |
| Composition (`Effect.gen`) | No      | They compose with plain function calls       |

Adding `Effect.runSync` in every `computed()` and making guards return `Effect<boolean>`
would add ceremony with zero benefit. XState guards cannot even use Effect -- they must
return a synchronous boolean.

The composition layer is the **Application Service** (Three Phases). Domain functions are
the atoms; the Application Service composes them with I/O.

#### Two categories

| Category    | Purpose                              | Example functions                                                |
| ----------- | ------------------------------------ | ---------------------------------------------------------------- |
| Validation  | Boolean predicates and Decision ADTs | `decideSaveTimeline()`, `isTemplateLimitReached()`               |
| Calculation | Date math, period generation         | `computeNextContiguousPeriod()`, `computeShiftedPeriodConfigs()` |

#### Consumer map

```
  domain/services/plan-validation.service.ts
    |
    |-- isValidStartDate()          <-- usePlanEditForm.ts (computed)
    |-- hasStartDateChanged()       <-- usePlanEditForm.ts (computed)
    |-- hasPeriodDurationsChanged() <-- usePlanEditForm.ts, useTemplateEditForm.ts (computed)
    |-- canAddPeriod()              <-- usePeriodManager.ts (guard)
    |-- canRemovePeriod()           <-- usePeriodManager.ts (guard)
    |-- decideSaveTimeline()        <-- PlanApplicationService (via DI adapter)
    |
    +-- PlanValidationService       <-- Effect.Service adapter for Application Service
```

#### Mandatory FC header

Every domain function file must include:

```typescript
/**
 * FUNCTIONAL CORE -- Plan Validation Service
 *
 * Pure validation functions (no I/O, no Effect error signaling, deterministic).
 *
 * Consumers:
 *   - usePlanEditForm (composable):   hasStartDateChanged, hasPeriodDurationsChanged
 *   - usePeriodManager (composable):  canAddPeriod, canRemovePeriod
 *   - PlanApplicationService (via DI): decideSaveTimeline
 */
```

#### File structure (both artifacts in one file)

```typescript
// ============================================================================
// Domain Functions (primary -- the actual FC logic)
// ============================================================================

export const isValidStartDate = (startDate: Date, lastCycleEndDate: Date | null): boolean =>
  lastCycleEndDate === null || startDate.getTime() >= lastCycleEndDate.getTime();

export const decideSaveTimeline = (input: {
  /* ... */
}): SaveTimelineDecision => {
  // Pure decision logic...
};

// ============================================================================
// Service Adapter (secondary -- DI wrapper for Application Services)
// ============================================================================

export interface IPlanValidationService {
  isValidStartDate(startDate: Date, lastCycleEndDate: Date | null): boolean;
  decideSaveTimeline(input: {
    /* ... */
  }): SaveTimelineDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    isValidStartDate,
    decideSaveTimeline,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
```

### 2.7 Errors -- Data.TaggedError vs S.TaggedError

| Error Kind   | Mechanism          | Location           | Purpose                          |
| ------------ | ------------------ | ------------------ | -------------------------------- |
| Domain Error | `Data.TaggedError` | `domain/errors.ts` | In-memory business failures      |
| Schema Error | `S.TaggedError`    | API schemas        | Wire-format HTTP response errors |

```typescript
// Domain error (used in gateway + application service)
export class PlanNotFoundError extends Data.TaggedError('PlanNotFoundError')<{
  planId: string;
}> {}

// Schema error (used in API handlers for HTTP responses)
export class PlanNotFoundErrorSchema extends S.TaggedError<PlanNotFoundErrorSchema>()('PlanNotFoundError', {
  message: S.String,
}) {}
```

In the web package, domain errors use `Data.TaggedError`. `S.TaggedError` lives on the API side.
Note that infrastructure errors (HTTP transport failures, auth errors, body parse errors) also
flow through the gateway -- these are not domain errors but are part of the error union types
returned by gateway methods.

---

## 3. Shell Layers Breakdown

### 3.1 API Client Service (Gateway)

**File:** `services/{feature}-api-client.service.ts`

The web equivalent of the API's Repository layer. Handles all HTTP communication and
DTO <-> Domain boundary mapping.

**Responsibility:**

- Make HTTP requests via `AuthenticatedHttpClient`
- Apply **boundary mappers** to transform DTOs to domain types (and vice versa)
- Map HTTP errors to domain errors using `Match.value` patterns
- Return only domain types -- never raw DTOs

**Legitimate logic:**

- `fromPlanResponse(dto)` -> `PlanSummary` (boundary mapper, list endpoints)
- `fromPlanWithPeriodsResponse(dto)` -> `PlanDetail` (boundary mapper, detail endpoints)
- `toCreatePlanPayload(input)` -> API payload (boundary mapper, encode direction)
- HTTP status code -> domain error mapping

**Anti-patterns:**

- Business validation (belongs in domain functions)
- Caching or retry logic (belongs in HTTP layer)
- Formatting for display (belongs in composable)

**Structure:**

```typescript
export class PlanApiClientService extends Effect.Service<PlanApiClientService>()(
  'PlanApiClientService',
  {
    effect: Effect.gen(function* () {
      const authenticatedClient = yield* AuthenticatedHttpClient;
      return {
        getActivePlan: (): Effect.Effect<PlanDetail, GetActivePlanError> => /* ... */,
        createPlan: (input: CreatePlanInput): Effect.Effect<PlanDetail, CreatePlanError> => /* ... */,
      };
    }),
    dependencies: [AuthenticatedHttpClient.Default],
    accessors: true,
  },
) {}
```

### 3.2 Application Service (Three Phases)

**File:** `services/{feature}-application.service.ts`

The orchestration layer that sits between XState actors and the API client + domain functions.
Follows the Three Phases pattern.

**The Three Phases:**

```
  Phase 1: COLLECTION          Phase 2: LOGIC             Phase 3: PERSISTENCE
  (Shell -- Gateway)           (Core -- Domain Fn)        (Shell -- Gateway)
  +-------------------+        +-------------------+      +-------------------+
  | Fetch data from   | -----> | Pure decision     | ---> | Write to API      |
  | API or caller     |        | function returns  |      | based on the      |
  | input             |        | Decision ADT      |      | decision variant  |
  +-------------------+        +-------------------+      +-------------------+
```

**Responsibility:**

- Coordinate Collection -> Logic -> Persistence
- Compose API Client + domain functions (via Service Adapter or direct import)
- Export `program*` helpers as single entrypoint for actors

**Legitimate logic:**

- Calling domain decision functions and branching on ADT variants
- Sequencing multiple gateway calls (e.g. update metadata THEN periods)
- Pass-through delegation for simple operations

**Anti-patterns:**

- Direct HTTP calls (belongs in gateway)
- Business rules (belongs in FC)
- UI formatting (belongs in composable)

**Three Phases example (saveTimeline):**

```typescript
saveTimeline: (input: SaveTimelineInput) =>
  Effect.gen(function* () {
    // Logic phase -- FC pure decision
    const decision = validationSvc.decideSaveTimeline({
      originalPlan: input.originalPlan,
      currentStartDate: input.currentStartDate,
      currentPeriods: input.currentPeriods,
    });

    // Persistence phase -- based on decision
    return yield* matchSaveTimelineDecision(decision, {
      NoChanges: () => Effect.succeed(null),
      OnlyStartDate: ({ startDate }) =>
        gateway.updatePlanMetadata({ planId: input.planId, startDate }),
      OnlyPeriods: ({ periods }) =>
        gateway.updatePlanPeriods({ planId: input.planId, periods }),
      StartDateAndPeriods: ({ startDate, periods }) =>
        Effect.gen(function* () {
          yield* gateway.updatePlanMetadata({ planId: input.planId, startDate });
          return yield* gateway.updatePlanPeriods({ planId: input.planId, periods });
        }),
    });
  }),
```

**Program exports** provide the single entrypoint for actors, with all layers pre-provided:

```typescript
export const programSaveTimeline = (input: SaveTimelineInput) =>
  PlanApplicationService.saveTimeline(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to save timeline', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );
```

### 3.3 Actor (State Machine)

**File:** `actors/{feature}.actor.ts`

XState state machines that orchestrate async operations. The actor is a "dumb coordinator" --
it knows WHAT to do but delegates decisions to the FC.

**Responsibility:**

- Manage async state transitions (Loading -> Success / Error)
- Invoke `program*` helpers via `fromCallback` + `runWithUi`
- Store domain-typed context (never DTOs)
- Emit domain-typed events for composable consumption
- Use FC predicates as guards

**Legitimate logic:**

- State transition definitions
- `fromCallback` wiring to `runWithUi`
- Guard conditions using FC predicates
- Merging context data into contract inputs (e.g. adding `currentCount`)

**Anti-patterns:**

- Business rules inline (delegate to FC)
- DTO transformations (belongs in gateway)
- UI formatting (belongs in composable)
- Direct HTTP calls (belongs in application service)

**Structure:**

```typescript
enum State {
  Idle = 'Idle',
  Loading = 'Loading',
  Ready = 'Ready',
}
enum Event {
  LOAD = 'LOAD',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}
enum Emit {
  ERROR = 'ERROR',
  LOADED = 'LOADED',
}

const loadLogic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programListTemplates(),
    (templates) => sendBack({ type: Event.ON_SUCCESS, templates }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

export const featureMachine = setup({
  types: { context: {} as Context, events: {} as Events, emitted: {} as Emits },
  actors: { loadLogic },
  guards: {
    canDuplicate: ({ context }) => !isTemplateLimitReached(context.templates.length, MAX_PLAN_TEMPLATES), // FC predicate
  },
}).createMachine({
  /* state definitions */
});
```

### 3.4 Composable (View Model)

**File:** `composables/use{Feature}.ts`

The composable is the **View Model** -- the only layer that translates between domain types
and UI presentation. There are typically two kinds per feature:

| Kind                      | Purpose                                | Example                 |
| ------------------------- | -------------------------------------- | ----------------------- |
| **View Model Composable** | Derives presentation state from actor  | `usePlanTemplates()`    |
| **Form Composable**       | Manages local draft state + validation | `useTemplateEditForm()` |

**Responsibility:**

- Expose actor state via `useSelector` (computed derivations)
- Call domain functions in `computed()` for presentation logic
- Validate raw input through schemas before sending to actor
- Translate domain types to UI strings (via FC or utils)
- Handle emissions from actor (toasts, navigation)

**Legitimate logic:**

- `computed(() => isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES))`
- `computed(() => formatPeriodCountLabel(template.periodCount))`
- Schema validation: `validateCreatePlanInput(rawInput.value)`
- Clock access: `Effect.runSync(DateTime.nowAsDate)` when needed
- ID generation: `crypto.randomUUID()` for new entities

**Anti-patterns:**

- Inline business rules (delegate to FC)
- Direct HTTP calls (delegate to actor)
- Direct state machine manipulation (use `send()`)

**View Model example:**

```typescript
export function usePlanTemplates() {
  const { send, actorRef } = useActor(planTemplatesMachine);
  const templates = useSelector(actorRef, (s) => s.context.templates);

  // FC-derived presentation computeds
  const cards = computed(() =>
    sortTemplatesByRecency(templates.value).map((t) => ({
      id: t.id,
      name: t.name,
      periodCountLabel: formatPeriodCountLabel(t.periodCount),
    })),
  );
  const isLimitReached = computed(() => isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES));

  return { cards, isLimitReached, loadTemplates: () => send({ type: Event.LOAD }) };
}
```

**Form Composable example:**

```typescript
export function useTemplateEditForm(template: Ref<PlanTemplateDetail>) {
  const nameInput = ref('');
  const periodConfigs = ref<PeriodConfig[]>([]);

  // Reactive validation via schema
  const validationResult = computed(() => validateUpdateTemplateInput(rawInput.value));
  const validationErrors = computed(() => extractErrors(validationResult.value));

  // FC-derived change detection
  const hasChanges = computed(() => hasPeriodDurationsChanged(originalPeriods.value, periodConfigs.value));

  return { nameInput, periodConfigs, validationErrors, hasChanges };
}
```

### 3.5 Component (.vue)

**File:** `{Feature}View.vue` or `components/{ComponentName}.vue`

Zero **business** logic. Components do orchestrate composables, lifecycle, and side effects
(toasts, navigation), but never make domain decisions.

There are two kinds of `.vue` files with different roles:

| Kind                  | Examples                   | Orchestration level                                                                       |
| --------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| **View** (page-level) | `PlanTemplateEditView.vue` | Wires composables, subscribes to emissions, triggers toasts/navigation, manages lifecycle |
| **Child Component**   | `PlanTemplateCard.vue`     | Pure presentation: props in, events out, no composable wiring                             |

**View responsibilities:**

- Wire up composables (view model + form + emissions)
- Subscribe to actor emissions for side effects (toasts, router navigation)
- Lifecycle triggers (`onMounted(() => loadTemplate(id))`)
- Build payloads from composable data for actor events
- Coordinate dialogs (open/close via actor state)

**Child component responsibilities:**

- Render pre-formatted data from props
- Emit user events (`$emit('edit')`, `$emit('delete')`)
- Local UI state only (hover, focus, open/closed)
- Styling and layout

**Anti-patterns (both kinds):**

- Any `if` that involves domain rules
- Any computation on domain data (formatting, filtering, sorting)
- Any HTTP or async call
- Any import from `domain/services/`

**Structure:**

```vue
<template>
  <div class="feature">
    <div v-for="card in cards" :key="card.id" class="feature__card">
      {{ card.name }}
      <span>{{ card.periodCountLabel }}</span>
      <!-- Pre-formatted by composable -->
    </div>
  </div>
</template>

<script setup lang="ts">
const { cards, isLimitReached, loadTemplates } = usePlanTemplates();
onMounted(() => loadTemplates());
</script>
```

---

## 4. Complete Data Flow Diagrams

### 4.1 Create Plan (Full Journey)

```
Component             Composable              Actor              App Service          Gateway
    |                     |                     |                     |                  |
    | click "Create"      |                     |                     |                  |
    |-------------------->|                     |                     |                  |
    |                     | validate(raw)       |                     |                  |
    |                     | via Schema          |                     |                  |
    |                     | raw -> PlanName,    |                     |                  |
    |                     |   {fasting,eating}[]|                     |                  |
    |                     |-------------------->|                     |                  |
    |                     | send(CREATE,        |                     |                  |
    |                     |   domainInput)      |                     |                  |
    |                     |                     | fromCallback +      |                  |
    |                     |                     | runWithUi(program)  |                  |
    |                     |                     |-------------------> |                  |
    |                     |                     |                     | (server validates|
    |                     |                     |                     |  conflicts)       |
    |                     |                     |                     |----------------->|
    |                     |                     |                     |                  | POST /plans
    |                     |                     |                     |                  | boundary map:
    |                     |                     |                     |                  | DTO -> PlanDetail
    |                     |                     |                     |<-----------------|
    |                     |                     |<--------------------|  PlanDetail      |
    |                     |                     | sendBack(ON_CREATED)|                  |
    |                     |                     | emit PLAN_CREATED   |                  |
    |                     |<--------------------|                     |                  |
    |                     | emission handler:   |                     |                  |
    |                     | toast + navigate    |                     |                  |
    |<--------------------|                     |                     |                  |
    | re-render           |                     |                     |                  |
```

### 4.2 Save Timeline (Decision ADT with Branching Persistence)

This flow demonstrates the Three Phases pattern with a Decision ADT:

```
Component             Composable              Actor              App Service          Gateway
    |                     |                     |                     |                  |
    | click "Save"        |                     |                     |                  |
    |-------------------->|                     |                     |                  |
    |                     | validate via schema |                     |                  |
    |                     | build SaveTimeline  |                     |                  |
    |                     |   Input (branded)   |                     |                  |
    |                     |-------------------->|                     |                  |
    |                     | send(SAVE_TIMELINE, |                     |                  |
    |                     |   validatedInput)   |                     |                  |
    |                     |                     | runWithUi(          |                  |
    |                     |                     |   programSave...)   |                  |
    |                     |                     |-------------------> |                  |
    |                     |                     |                     |                  |
    |                     |                     |          Phase 1: COLLECTION           |
    |                     |                     |          (from caller input)           |
    |                     |                     |                     |                  |
    |                     |                     |          Phase 2: LOGIC (FC)           |
    |                     |                     |          decideSaveTimeline() returns: |
    |                     |                     |          one of 4 ADT variants         |
    |                     |                     |                     |                  |
    |                     |                     |          Phase 3: PERSISTENCE          |
    |                     |                     |          match on decision:            |
    |                     |                     |                     |                  |
    |                     |                     |  NoChanges:         | (skip)           |
    |                     |                     |  OnlyStartDate:     |--PATCH metadata->|
    |                     |                     |  OnlyPeriods:       |--PUT periods---->|
    |                     |                     |  StartDateAndPeriods|--PATCH then PUT->|
    |                     |                     |                     |                  |
    |                     |                     |<--------------------|  PlanDetail|null |
    |                     |                     | sendBack(ON_SAVED)  |                  |
    |                     |                     | emit TIMELINE_SAVED |                  |
    |                     |<--------------------|                     |                  |
    |                     | emission handler:   |                     |                  |
    |                     | syncFromServer()    |                     |                  |
    |                     | toast success       |                     |                  |
    |<--------------------|                     |                     |                  |
```

---

## 5. Responsibility Matrix

### Actor

| YES                                          | NO                                |
| -------------------------------------------- | --------------------------------- |
| State transitions (Idle -> Loading -> Ready) | Business rules (`if count >= 20`) |
| `fromCallback` + `runWithUi` for HTTP        | Direct HTTP calls                 |
| FC predicates in guards                      | Inline validation logic           |
| Domain-typed context (`PlanDetail`)          | Raw DTOs in context               |
| Emit structured events                       | Format strings for UI             |
| Merge context into contract inputs           | DTO <-> Domain mapping            |

### Composable

| YES                                     | NO                            |
| --------------------------------------- | ----------------------------- |
| `useSelector` for actor state           | Direct HTTP calls             |
| Domain functions in `computed()`        | Inline business rules         |
| Schema validation before actor          | State machine definitions     |
| Domain -> UI string translation         | Raw DTO manipulation          |
| Emission handlers (toast, navigate)     | Actor state mutation          |
| Clock access via `DateTime.nowAsDate`   | `new Date()` for current time |
| ID generation via `crypto.randomUUID()` | Database writes               |

### View (Page-Level Component)

| YES                                         | NO                             |
| ------------------------------------------- | ------------------------------ |
| Wire composables (view model + form + emit) | Any `if` with domain rules     |
| Subscribe to emissions (toast, navigate)    | Business computations          |
| Lifecycle triggers (`onMounted`)            | Import from `domain/services/` |
| Build payloads from composable data         | Format domain values inline    |
| Coordinate dialogs via actor state          | Direct HTTP calls              |

### Child Component

| YES                                   | NO                             |
| ------------------------------------- | ------------------------------ |
| `v-if`, `v-for` on props              | Any `if` with domain rules     |
| `@click` -> `$emit('action')`         | Direct actor `send()`          |
| Local UI refs (hover, focus)          | Business computations          |
| Scoped SCSS with BEM                  | Import from `domain/services/` |
| Props from composable (pre-formatted) | Format domain values inline    |
| `$emit` user events                   | HTTP calls of any kind         |

---

## 6. API <-> Web Analogy Table

| API Concept           | Web Equivalent           | Web File Location                   | Shared Purpose             |
| --------------------- | ------------------------ | ----------------------------------- | -------------------------- |
| Handler               | Actor                    | `actors/*.actor.ts`                 | Orchestrates the operation |
| Repository            | API Client (Gateway)     | `services/*-api-client.service.ts`  | Talks to external system   |
| Application Service   | Application Service      | `services/*-application.service.ts` | Three Phases coordinator   |
| Request Schema        | Input Schema             | `domain/schemas/*-input.schema.ts`  | Validates incoming data    |
| Response Schema       | Boundary Mapper (decode) | Inside gateway service              | Transforms wire -> domain  |
| Domain Service        | Domain Service           | `domain/services/*.service.ts`      | Pure business logic        |
| Domain Error          | Domain Error             | `domain/errors.ts`                  | Typed failures             |
| Contract              | Contract                 | `domain/contracts/*.contract.ts`    | Use-case interface         |
| `Effect.annotateLogs` | `Effect.annotateLogs`    | All services                        | Structured logging         |

### Key Differences

| Concern                 | API                        | Web                           |
| ----------------------- | -------------------------- | ----------------------------- |
| External I/O            | Database (PostgreSQL)      | HTTP API (backend)            |
| State management        | Stateless (per-request)    | Stateful (XState machines)    |
| Output boundary         | JSON HTTP response         | Reactive Vue interface        |
| UUID generation         | Repository (authoritative) | Trusts API (except temp IDs)  |
| Time for business logic | Service (`DateTime.now`)   | Trusts API (server-side)      |
| Time for UI display     | N/A                        | Composable or view (UI shell) |
| Error presentation      | Error codes in response    | Toast messages via composable |

---

## 7. The FC Delegation Rule

### The Practical Test

Before writing an `if/else` or comparison in a composable, actor, or component, ask:

> "Is this a **business decision** (rules about the domain) OR a **shell concern**
> (rules about I/O, state transitions, or UI mechanics)?"

**If it is a business decision, extract it as a domain function** (`domain/services/`).

### Examples

| Code                                   | Current Location | Correct Location                         | Why                                  |
| -------------------------------------- | ---------------- | ---------------------------------------- | ------------------------------------ |
| `templates.length >= 20`               | Composable       | FC: `isTemplateLimitReached(count, max)` | Business rule (template cap)         |
| `state.matches('Loading')`             | Composable       | Composable                               | Shell concern (state check)          |
| `startDate !== originalStartDate`      | Actor            | FC: `hasStartDateChanged(a, b)`          | Business decision (change detection) |
| `hover.value = true`                   | Component        | Component                                | UI mechanics (local state)           |
| `period.fasting + period.eating`       | Actor            | FC: `calculatePeriodDates()`             | Domain calculation                   |
| `sendBack({ type: Event.ON_SUCCESS })` | Actor            | Actor                                    | Shell concern (state transition)     |

### Anti-Pattern Gallery

**1. Inline business rule in composable:**

```typescript
// WRONG -- business rule embedded in shell
const canSave = computed(() => templates.value.length < 20);

// RIGHT -- delegate to FC
const canSave = computed(() => !isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES));
```

**2. Change detection duplicated in form composable:**

```typescript
// WRONG -- reimplements what FC already provides
const hasChanges = computed(() =>
  periodConfigs.value.some(
    (p, i) =>
      p.fastingDuration !== original.value[i]?.fastingDuration || p.eatingWindow !== original.value[i]?.eatingWindow,
  ),
);

// RIGHT -- delegate to FC
const hasChanges = computed(() => hasPeriodDurationsChanged(original.value, periodConfigs.value));
```

**3. Domain transformation in actor (known tech debt in `planTemplateEdit.actor.ts:105`):**

```typescript
// CURRENT -- PeriodOrder(i + 1) is domain logic in the actor
// This exists in planTemplateEdit.actor.ts and is recognized tech debt.
periods: input.periods.map(
  (p, i) =>
    new TemplatePeriodConfig({
      order: PeriodOrder(i + 1),
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    }),
);

// IDEAL -- domain function or schema handles order assignment
// The schema or composable assigns order before sending to actor
```

**4. Date calculation in composable:**

```typescript
// WRONG -- domain math in shell
const addPeriod = () => {
  const last = periodConfigs.value.at(-1)!;
  const duration = (last.fastingDuration + last.eatingWindow) * 60 * 60 * 1000;
  const nextStart = new Date(last.startDate.getTime() + duration);
  // ...
};

// RIGHT -- delegate to FC
const addPeriod = () => {
  const next = computeNextContiguousPeriod(periodConfigs.value.at(-1)!);
  periodConfigs.value = [...periodConfigs.value, { id: crypto.randomUUID(), ...next }];
};
```

### Boolean vs Decision ADT: Choosing the Right Form

Domain functions return either a **boolean** or a **Decision ADT** (`Data.TaggedEnum`).
Currently, Decision ADTs live in the FC and are consumed in the Application Service
(e.g. `SaveTimelineDecision`, `SaveTemplateLimitDecision`). But the same pattern can apply
anywhere in actors and composables when the conditions are right.

#### When to use each form

```
Is the outcome binary (yes/no) with no variant-specific data?
  YES --> Domain function returning boolean
          Example: isTemplateLimitReached(count, max) -> boolean

Does the outcome have 3+ variants, each with different data?
  YES --> Decision ADT
          Example: SaveTimelineDecision { NoChanges | OnlyStartDate | OnlyPeriods | Both }

Is it shell mechanics (null check, concurrency, initialization)?
  YES --> Plain if in actor/composable (not a domain concern)
```

A Decision ADT earns its keep when **all three conditions** are met:

1. The decision has **3+ outcomes** (a boolean is not enough)
2. Each outcome drives a **different action** in the consumer (not just show/hide)
3. The variants carry **different data** (not just a flag)

#### Classification of conditionals in actors and composables

**Shell mechanics -- must stay as plain `if`:**

These are infrastructure concerns with no domain meaning:

| Pattern              | Example                                   | Why it stays as `if`             |
| -------------------- | ----------------------------------------- | -------------------------------- |
| Null safety          | `if (!template.value) return null`        | Defensive check, not a decision  |
| Concurrency          | `if (loadedCount === 2 && !hasError)`     | Coordination of parallel loads   |
| Initialization       | `if (!t \|\| isInitialized.value) return` | One-time setup guard             |
| Watch guard          | `if (newPlan && !saving)`                 | Prevent sync during save         |
| Validation routing   | `Either.isLeft(result)`                   | Type narrowing, not domain logic |
| Event discrimination | `if (event.type === Event.LOAD)`          | XState event routing             |

**Boolean business rules -- domain function returning `boolean`:**

These are domain rules with binary outcomes and no variant-specific data:

| Current code              | Domain function                      | Consumed by                          |
| ------------------------- | ------------------------------------ | ------------------------------------ |
| `templates.length >= MAX` | `isTemplateLimitReached(count, max)` | Composable `computed()`, Actor guard |
| `startDate !== original`  | `hasStartDateChanged(a, b)`          | Composable `computed()`              |
| `durations differ`        | `hasPeriodDurationsChanged(a, b)`    | Composable `computed()`              |
| `length >= MAX_PERIODS`   | `canAddPeriod(count)`                | usePeriodManager (guard)             |

A `CanAddPeriodDecision { CanAdd, LimitReached }` ADT would add ceremony with zero
value over a boolean -- the consumer only needs yes/no.

**Decision ADTs -- multi-variant with different data:**

These exist today in the Application Service:

| ADT                         | Variants                                                           | Consumed in         | Why ADT is justified                                      |
| --------------------------- | ------------------------------------------------------------------ | ------------------- | --------------------------------------------------------- |
| `SaveTimelineDecision`      | `NoChanges`, `OnlyStartDate`, `OnlyPeriods`, `StartDateAndPeriods` | Application Service | 4 variants drive 4 different API call patterns            |
| `SaveTemplateLimitDecision` | `CanSave`, `LimitReached`                                          | Application Service | `LimitReached` carries `currentCount`/`maxTemplates` data |

**Error routing -- already pattern-matched on tagged types:**

Error handling in actors uses `Match.value(error).pipe(Match.when(...))` on
`Data.TaggedError` types. This is already exhaustive-style matching on tagged types --
not a candidate for a new Decision ADT.

#### When a Decision ADT helps in composables

If a composable needs to expose **different UI states** based on a multi-variant domain
decision, a Decision ADT makes the variants explicit and compiler-enforced:

```typescript
// domain/services/plan-progress.service.ts
type PlanProgressView = Data.TaggedEnum<{
  ShowProgress: { completedCount: number; totalCount: number };
  ReadyToComplete: { planId: PlanId };
  ShowSummary: { completedAt: Date };
}>;

export const decidePlanProgressView = (plan: PlanDetail): PlanProgressView => {
  if (plan.status === 'Completed') return PlanProgressView.ShowSummary({ ... });
  if (allPeriodsComplete(plan)) return PlanProgressView.ReadyToComplete({ ... });
  return PlanProgressView.ShowProgress({ ... });
};
```

```typescript
// composable
const progressView = computed(() => decidePlanProgressView(plan.value));

// component -- each variant renders differently with variant-specific data
```

This adds value because: 3 variants, different data per variant, different UI per variant.

#### When a Decision ADT helps in actors

If an actor needs to **route to different states** based on a multi-variant domain decision,
the ADT makes the branching explicit:

```typescript
// In actor -- domain function decides, actor routes
const decision = decideSomething(context);
matchDecision(decision, {
  VariantA: () => sendBack({ type: Event.A }),
  VariantB: (data) => sendBack({ type: Event.B, ...data }),
  VariantC: () => sendBack({ type: Event.C }),
});
```

Note: XState **guards** must return a boolean. For guard conditions, a boolean domain
function is the only option. Decision ADTs are useful in **actions** and **callback logic**
where you can match on the variants.

#### Comparison table

|                                | Decision ADT                                          | Boolean domain function    | Plain `if`      |
| ------------------------------ | ----------------------------------------------------- | -------------------------- | --------------- |
| **Exhaustive matching**        | Yes (compiler catches missing cases)                  | N/A                        | No              |
| **Self-documenting**           | Yes (variant names = domain language)                 | Moderate (function name)   | No              |
| **Different data per variant** | Yes                                                   | No                         | No              |
| **Works in XState guards**     | No (guards must return boolean)                       | Yes                        | Yes             |
| **Works in `computed()`**      | Yes (match in computed or expose directly)            | Yes (direct)               | Yes             |
| **Ceremony**                   | High (type + constructor + match)                     | Low (one function)         | None            |
| **Best for**                   | 3+ outcomes with different data and different actions | Binary yes/no domain rules | Shell mechanics |

---

## 8. Key Architectural Rules

### 8.1 Clock Rule

This rule applies to **getting the current time** (`now`). Using `new Date(existingValue)` for
parsing or cloning an existing date is fine -- it is not a clock access.

| Usage                         | Rule                           | Example                              |
| ----------------------------- | ------------------------------ | ------------------------------------ |
| `new Date()` (current time)   | **Forbidden** in UI-side shell | Use `DateTime.nowAsDate` in services |
| `new Date(isoString)` (parse) | **Allowed** anywhere           | Parsing API response dates           |
| `new Date(timestamp)` (clone) | **Allowed** anywhere           | Cloning for immutability             |

For getting the current time:

| Layer               | Can Access Time? | How                                            |
| ------------------- | ---------------- | ---------------------------------------------- |
| Component           | Avoid            | Delegate to composable or service              |
| Composable          | If needed        | `Effect.runSync(DateTime.nowAsDate)` preferred |
| Actor               | Avoid            | Delegate to application service                |
| Application Service | YES              | `DateTime.nowAsDate` from Effect               |
| Gateway             | YES              | `DateTime.nowAsDate` from Effect               |
| Domain Function     | NEVER            | Receives `now: Date` as parameter              |

> **Known debt:** `PlanTemplateEditView.vue:315` uses `new Date()` for the plan start date in
> `handleCreatePlan`. This should be moved to a composable or service.

### 8.2 Domain-Typed Actor Context

Actor context stores **only domain types**, never raw DTOs from the API:

```typescript
// WRONG
type Context = { plan: PlanWithPeriodsResponse | null }; // DTO leaking

// RIGHT
type Context = { plan: PlanDetail | null }; // Domain type (gateway mapped)
```

### 8.3 Composable Validates Before Actor

The composable validates raw input through schemas BEFORE sending to the actor.
The actor receives only domain-typed input:

```typescript
// In composable
const handleSave = () => {
  const result = validateUpdateTemplateInput(rawInput.value);
  if (Either.isRight(result)) {
    send({ type: Event.SAVE, input: result.right }); // Domain-typed
  }
};
```

### 8.4 Component Has Zero Business Logic

Components render pre-formatted data from composables. They emit events but never
make domain decisions:

```typescript
// WRONG -- business logic in component
<span>{{ template.periodCount === 1 ? '1 period' : `${template.periodCount} periods` }}</span>

// RIGHT -- composable provides pre-formatted string
<span>{{ card.periodCountLabel }}</span>  // "3 periods" already computed
```

### 8.5 HTTP Requests Only Through Actors

ALL HTTP requests MUST flow through XState actors via `fromCallback` + `runWithUi`.
Never call Effect programs directly in components or composables.

```typescript
// WRONG -- direct call in composable
onMounted(() => {
  runWithUi(
    programGetData(),
    (result) => {
      data.value = result;
    },
    (error) => {
      /* ... */
    },
  );
});

// RIGHT -- through actor
const loadLogic = fromCallback(({ sendBack }) =>
  runWithUi(programGetData(), (r) => sendBack({ type: Event.ON_SUCCESS, r }) /* ... */),
);
// Composable: send({ type: Event.LOAD })
```

### 8.6 runWithUi Bridge

`runWithUi` bridges Effect's success/error channels to UI callbacks for XState integration:

```typescript
export function runWithUi<A, E>(
  eff: Effect.Effect<A, E>,
  onSuccess: (value: A) => void,
  onFailure: (error: E) => void,
): () => void {
  const fiber = Effect.runFork(
    eff.pipe(
      Effect.matchEffect({
        onSuccess: (value) => Effect.sync(() => onSuccess(value)),
        onFailure: (err) => Effect.sync(() => onFailure(err)),
      }),
    ),
  );
  return () => {
    Effect.runFork(Fiber.interruptFork(fiber));
  };
}
```

The returned cleanup function interrupts the fiber. `fromCallback` in XState uses it
as the actor's cleanup handler.

---

## 9. Directory Structure Reference

```
web/src/views/{feature}/
  |
  |-- {Feature}View.vue                           # Main view component
  |-- {Feature}EditView.vue                       # Edit view (if applicable)
  |
  |-- actors/
  |   |-- {feature}.actor.ts                      # List/main state machine
  |   +-- {feature}Edit.actor.ts                  # Edit-specific state machine
  |
  |-- services/
  |   |-- {feature}-api-client.service.ts         # Gateway: HTTP + boundary mappers
  |   +-- {feature}-application.service.ts        # Three Phases coordinator + programs
  |
  |-- composables/
  |   |-- use{Feature}.ts                         # View Model: list/main
  |   |-- use{Feature}Edit.ts                     # View Model: edit
  |   |-- use{Feature}EditForm.ts                 # Form: draft state + validation
  |   |-- use{Feature}Emissions.ts                # Emission handler: list/main
  |   +-- use{Feature}EditEmissions.ts            # Emission handler: edit
  |
  |-- components/
  |   +-- {ComponentName}.vue                     # Feature-specific components
  |
  |-- domain/
  |   |-- {feature}.model.ts                      # Constants, brands, VOs, ADTs
  |   |-- errors.ts                               # Domain errors (Data.TaggedError)
  |   |-- functional-domain-design.md             # Feature-specific FC/IS design doc
  |   |-- index.ts                                # Barrel re-exports
  |   |
  |   |-- contracts/
  |   |   |-- {use-case}.contract.ts              # One per mutation
  |   |   +-- index.ts
  |   |
  |   |-- schemas/
  |   |   |-- {use-case}-input.schema.ts          # One per form
  |   |   +-- index.ts
  |   |
  |   +-- services/
  |       |-- {feature}-validation.service.ts     # Domain functions + Service Adapter
  |       |-- {feature}-calculation.service.ts    # Domain functions (pure date/math)
  |       +-- index.ts
  |
  +-- utils/                                      # Formatting, presentation helpers
      +-- {feature}-formatting.ts
```

---

## 10. Decision Flowchart: Where Does This Logic Go?

```
START: "I need to write some logic..."
  |
  |-- Does it involve HTTP requests?
  |     YES --> Is it raw HTTP + DTO mapping?
  |               YES --> Gateway (api-client.service.ts)
  |               NO  --> Is it coordinating Collection/Logic/Persistence?
  |                         YES --> Application Service
  |                         NO  --> Program export (for actor consumption)
  |
  |-- Does it involve state transitions?
  |     YES --> Actor (XState machine)
  |
  |-- Is it a business rule or domain calculation?
  |     YES --> Can it be a pure function (no I/O, deterministic)?
  |               YES --> Domain Function (domain/services/)
  |               NO  --> Re-examine: extract the pure part to FC,
  |                       keep I/O in Application Service
  |
  |-- Does it transform raw UI input to domain types?
  |     YES --> Input Schema (domain/schemas/)
  |
  |-- Does it transform domain types to UI display?
  |     YES --> Composable computed (using domain functions or utils)
  |
  |-- Does it validate form input reactively?
  |     YES --> Form Composable (with schema validation)
  |
  |-- Is it local UI mechanics (hover, focus, open/close)?
  |     YES --> Component
  |
  |-- Does it handle side effects from actor emissions?
  |     YES --> Emission Composable (toast, navigation)
  |
  |-- None of the above?
        --> Re-examine: you may be conflating concerns.
            Split it into a pure part (FC) and an I/O part (Shell).
```

---

## 11. Glossary

| Term                      | Definition                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FC**                    | Functional Core. Pure functions with no I/O, no state, no framework coupling. The `domain/` folder hosts FC plus boundary artifacts (contracts, schemas). |
| **IS**                    | Imperative Shell. Everything outside the FC that orchestrates I/O and state.                                                                              |
| **Shell**                 | Synonym for IS. In the web, there are two families: API-side (Gateway, App Service) and UI-side (Actor, Composable, Component).                           |
| **Gateway**               | The API Client Service. Web equivalent of a Repository. HTTP + boundary mappers.                                                                          |
| **Three Phases**          | Application Service pattern: Collection -> Logic -> Persistence.                                                                                          |
| **Contract**              | Interface defining what a use-case operation needs. Uses domain-typed fields.                                                                             |
| **Schema (Input)**        | Validator that transforms raw UI input into domain-typed contract input.                                                                                  |
| **Decision ADT**          | A `Data.TaggedEnum` that reifies a business decision as data (e.g. `SaveTimelineDecision`).                                                               |
| **Branded Type**          | A primitive refined with domain constraints via `Brand.refined` (e.g. `PlanName`).                                                                        |
| **Value Object**          | An `S.Class` with multiple fields, no identity. Compared by value.                                                                                        |
| **Smart Constructor**     | A function that parses unknown values into branded types, returning `Effect` or `Option`.                                                                 |
| **Boundary Mapper**       | A function in the gateway that converts between DTO (wire format) and domain types.                                                                       |
| **Clock Rule**            | For current time: shell uses `DateTime.nowAsDate`; FC receives `now: Date` as param. `new Date(value)` for parsing/cloning is fine.                       |
| **Domain Function**       | Standalone pure function in `domain/services/`. The primary FC export. Used directly by composables and actors.                                           |
| **Service Adapter**       | `Effect.Service` wrapper that re-exports domain functions for DI in Application Services. Secondary, adds no logic.                                       |
| **Program Export**        | A `program*` function from Application Service with all layers pre-provided. Single entrypoint for actors.                                                |
| **Emission**              | An event emitted by an XState actor, handled by an emission composable (toasts, navigation).                                                              |
| **Form Composable**       | Manages local draft state, reactive schema validation, and change detection.                                                                              |
| **View Model Composable** | Derives presentation state from actor using `useSelector` + FC computeds.                                                                                 |
| **runWithUi**             | Helper that bridges Effect success/error channels to UI callbacks for XState.                                                                             |

---

## 12. FC/IS Compliance Checklist

Use this checklist when reviewing a feature for FC/IS compliance.

### Domain Layer (Functional Core)

- [ ] All domain constants are **named** (no magic numbers in predicates or error messages)
- [ ] Branded types reference constants in predicates and error messages
- [ ] Value Objects use `S.Class`, compared by value, no identity for pre-persistence objects
- [ ] Decision ADTs use `Data.TaggedEnum` with exhaustive matching (`$match`)
- [ ] Smart constructors return `Effect` (effectful) or `Option` (synchronous)
- [ ] Every mutating use-case has a **contract** in `domain/contracts/`
- [ ] Every form has an **input schema** in `domain/schemas/` with validate function (error extraction optional, shared)
- [ ] Domain function files have the **mandatory FC header** with Three Phases context
- [ ] **Domain functions** are standalone pure functions (primary export, no Effect dependency)
- [ ] **Service adapter** wraps domain functions in `Effect.Service` for Application Service DI
- [ ] Domain functions contain **zero I/O** -- no HTTP, no clock, no randomness
- [ ] Domain errors use `Data.TaggedError`

### Gateway (API Client Service)

- [ ] Returns **only domain types**, never raw DTOs
- [ ] Boundary mappers handle both directions (decode: DTO -> Domain, encode: Domain -> DTO)
- [ ] HTTP errors mapped to domain errors using `Match.value`
- [ ] Uses `AuthenticatedHttpClient` dependency
- [ ] Error type aliases defined per operation

### Application Service

- [ ] Every method documents its **Three Phases** in comments
- [ ] FC decision functions called in **Logic phase** (not inline rules)
- [ ] `program*` exports provide all layers via `Effect.provide`
- [ ] Error logging via `Effect.tapError` + `Effect.annotateLogs`
- [ ] Dependencies: API Client + Service Adapters (or direct domain function imports)

### Actor (State Machine)

- [ ] Context stores **domain types only** (no DTOs)
- [ ] Guards use **FC predicates** (not inline conditions with magic numbers)
- [ ] HTTP calls go through `fromCallback` + `runWithUi` + `program*`
- [ ] Actor emits domain-typed events
- [ ] No business logic inline -- delegates to FC or Application Service

### Composable (View Model)

- [ ] Validates input through **schemas before sending to actor**
- [ ] Presentation logic uses **domain functions in computed()** or utils
- [ ] No direct HTTP calls
- [ ] Current time uses `DateTime.nowAsDate`, not `new Date()` (`new Date(value)` for parse/clone is fine)
- [ ] ID generation uses `crypto.randomUUID()` only in the shell

### Component (.vue)

- [ ] **Zero business logic** -- all domain rules come from composable
- [ ] Views orchestrate composables, emissions, and lifecycle (no domain decisions)
- [ ] Child components render pre-formatted props, emit user events
- [ ] No imports from `domain/services/`
- [ ] No domain computations or formatting inline

### Cross-Cutting

- [ ] No `new Date()` for current time outside Effect services (`new Date(value)` for parse/clone is fine)
- [ ] `Match.exhaustive` for closed ADTs (Decision types); `Match.orElse` allowed for open error unions with infrastructure errors
- [ ] Feature has a `domain/functional-domain-design.md`
- [ ] All error handling uses typed `Data.TaggedError`, not string matching
