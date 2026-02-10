---
name: create-actor
description: Create a new XState actor with composable for Vue integration. Use when asked to create, add, or implement a new state machine, actor, or feature flow.
---

# Create XState Actor with Composable

Create a new XState actor for feature: **$ARGUMENTS**

When creating a new XState actor, follow this structure and patterns exactly.

## File Structure

For a new actor in feature `{feature}`:

```
web/src/views/{feature}/
├── actors/
│   └── {feature}.actor.ts                 # State machine
├── composables/
│   ├── use{Feature}.ts                    # Vue composable (view model)
│   └── use{Feature}Emissions.ts           # Emission handler
├── services/
│   ├── {feature}.service.ts               # API Client (HTTP + boundary mappers)
│   └── {feature}-application.service.ts   # Application Service (Three Phases)
└── utils/
    └── {feature}-formatting.ts            # Presentation text
```

## Step 1: Create Actor (`actors/{feature}.actor.ts`)

```typescript
import { assertEvent, assign, emit, fromCallback, setup } from 'xstate';
import type { EventObject } from 'xstate';
import { runWithUi } from '@/utils/effects/helpers';
import { extractErrorMessage } from '@/utils/errors';
// Import programs from application service (single entrypoint for all actor I/O)
// For features WITHOUT domain modeling, import directly from API client service instead
import { programList{Resources}, programSave{Resource} } from '../services/{feature}-application.service';

// ============================================
// 1. ENUMS
// ============================================

export enum {Feature}State {
  Idle = 'Idle',
  Loading = 'Loading',
  Loaded = 'Loaded',
  Saving = 'Saving',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  SAVE = 'SAVE',
  RESET = 'RESET',
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_LOAD_ERROR = 'ON_LOAD_ERROR',
  ON_SAVE_SUCCESS = 'ON_SAVE_SUCCESS',
  ON_SAVE_ERROR = 'ON_SAVE_ERROR',
}

export enum Emit {
  {FEATURE}_LOADED = '{FEATURE}_LOADED',
  {FEATURE}_SAVED = '{FEATURE}_SAVED',
  {FEATURE}_ERROR = '{FEATURE}_ERROR',
}

// ============================================
// 2. TYPES
// ============================================

type EventType =
  | { type: Event.LOAD }
  | { type: Event.SAVE; data: SaveData }
  | { type: Event.RESET }
  | { type: Event.ON_LOAD_SUCCESS; result: {Resource} }
  | { type: Event.ON_LOAD_ERROR; error: string }
  | { type: Event.ON_SAVE_SUCCESS; result: {Resource} }
  | { type: Event.ON_SAVE_ERROR; error: string };

export type EmitType =
  | { type: Emit.{FEATURE}_LOADED; result: {Resource} }    // domain payload OK
  | { type: Emit.{FEATURE}_SAVED }                         // bare fact when no data needed
  | { type: Emit.{FEATURE}_LIMIT_REACHED }                 // bare fact — NO UI text
  | { type: Emit.{FEATURE}_ERROR; error: string };          // error string is the exception

// Rule: Emissions may carry domain-typed payloads (entities, IDs) but NEVER
// user-facing text (formatted messages, labels). The consumer (composable/component)
// formats UI text using `utils/` functions.

type Context = {
  {resource}: {Resource} | null;
  error: string | null;
};

// ============================================
// 3. ACTORS (fromCallback)
// ============================================

// Read operation — calls application service programListXxx() (pass-through to API client)
const load{Resource}Logic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programList{Resources}(),
    (result) => {
      sendBack({ type: Event.ON_LOAD_SUCCESS, result });
    },
    (error) => {
      sendBack({ type: Event.ON_LOAD_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

// Mutation with logic — calls application service programSaveXxx() (FC validation + API client)
const save{Resource}Logic = fromCallback<EventObject, { data: SaveData }>(
  ({ sendBack, input }) =>
    runWithUi(
      programSave{Resource}(input.data),
      (result) => {
        sendBack({ type: Event.ON_SAVE_SUCCESS, result });
      },
      (error) => {
        sendBack({ type: Event.ON_SAVE_ERROR, error: extractErrorMessage(error) });
      },
    ),
);

// ============================================
// 4. MACHINE
// ============================================

export const {feature}Machine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    // Context updates
    set{Resource}: assign(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return { {resource}: event.result, error: null };
    }),
    setUpdated{Resource}: assign(({ event }) => {
      assertEvent(event, Event.ON_SAVE_SUCCESS);
      return { {resource}: event.result, error: null };
    }),
    setError: assign(({ event }) => {
      assertEvent(event, [Event.ON_LOAD_ERROR, Event.ON_SAVE_ERROR]);
      return { error: event.error };
    }),
    resetContext: assign(() => ({
      {resource}: null,
      error: null,
    })),

    // Emissions
    emitLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return { type: Emit.{FEATURE}_LOADED, result: event.result };
    }),
    emitSaved: emit(({ event }) => {
      assertEvent(event, Event.ON_SAVE_SUCCESS);
      return { type: Emit.{FEATURE}_SAVED, result: event.result };
    }),
    emitError: emit(({ event }) => {
      assertEvent(event, [Event.ON_LOAD_ERROR, Event.ON_SAVE_ERROR]);
      return { type: Emit.{FEATURE}_ERROR, error: event.error };
    }),
  },
  actors: {
    load{Resource}Actor: load{Resource}Logic,
    save{Resource}Actor: save{Resource}Logic,
  },
}).createMachine({
  id: '{feature}',
  context: {
    {resource}: null,
    error: null,
  },
  initial: {Feature}State.Idle,
  states: {
    [{Feature}State.Idle]: {
      on: {
        [Event.LOAD]: {Feature}State.Loading,
      },
    },
    [{Feature}State.Loading]: {
      invoke: {
        id: 'load{Resource}Actor',
        src: 'load{Resource}Actor',
      },
      on: {
        [Event.ON_LOAD_SUCCESS]: {
          actions: ['set{Resource}', 'emitLoaded'],
          target: {Feature}State.Loaded,
        },
        [Event.ON_LOAD_ERROR]: {
          actions: ['setError', 'emitError'],
          target: {Feature}State.Error,
        },
      },
    },
    [{Feature}State.Loaded]: {
      on: {
        [Event.SAVE]: {Feature}State.Saving,
        [Event.RESET]: {
          actions: 'resetContext',
          target: {Feature}State.Idle,
        },
      },
    },
    [{Feature}State.Saving]: {
      invoke: {
        id: 'save{Resource}Actor',
        src: 'save{Resource}Actor',
        input: ({ event }) => {
          assertEvent(event, Event.SAVE);
          return { data: event.data };
        },
      },
      on: {
        [Event.ON_SAVE_SUCCESS]: {
          actions: ['setUpdated{Resource}', 'emitSaved'],
          target: {Feature}State.Loaded,
        },
        [Event.ON_SAVE_ERROR]: {
          actions: ['setError', 'emitError'],
          target: {Feature}State.Loaded,
        },
      },
    },
    [{Feature}State.Error]: {
      on: {
        [Event.LOAD]: {Feature}State.Loading,
        [Event.RESET]: {
          actions: 'resetContext',
          target: {Feature}State.Idle,
        },
      },
    },
  },
});
```

## Step 2: Create Composable (`composables/use{Feature}.ts`)

> **Note**: For features with domain modeling (`domain/` directory), use `web-create-composable` instead. It extends this pattern with domain computeds, input validation, and UI state translation.

```typescript
import { computed } from 'vue';
import { useActorRef, useSelector } from '@xstate/vue';
import { {feature}Machine, {Feature}State, Event, Emit, type EmitType } from '../actors/{feature}.actor';

export function use{Feature}() {
  // ============================================
  // 1. ACTOR INITIALIZATION
  // ============================================
  const actorRef = useActorRef({feature}Machine);

  // ============================================
  // 2. STATE SELECTORS
  // ============================================
  const idle = useSelector(actorRef, (state) => state.matches({Feature}State.Idle));
  const loading = useSelector(actorRef, (state) => state.matches({Feature}State.Loading));
  const loaded = useSelector(actorRef, (state) => state.matches({Feature}State.Loaded));
  const saving = useSelector(actorRef, (state) => state.matches({Feature}State.Saving));
  const error = useSelector(actorRef, (state) => state.matches({Feature}State.Error));

  // ============================================
  // 3. CONTEXT DATA
  // ============================================
  const {resource} = useSelector(actorRef, (state) => state.context.{resource});
  const errorMessage = useSelector(actorRef, (state) => state.context.error);

  // ============================================
  // 4. COMPUTED HELPERS
  // ============================================
  const isLoading = computed(() => loading.value || saving.value);
  const showSkeleton = computed(() => loading.value && !{resource}.value);
  const canSave = computed(() => loaded.value && !saving.value);

  // ============================================
  // 5. ACTIONS
  // ============================================
  const load = () => {
    actorRef.send({ type: Event.LOAD });
  };

  const save = (data: SaveData) => {
    actorRef.send({ type: Event.SAVE, data });
  };

  const reset = () => {
    actorRef.send({ type: Event.RESET });
  };

  // ============================================
  // 6. RETURN
  // ============================================
  return {
    // State checks
    idle,
    loading,
    loaded,
    saving,
    error,

    // Computed helpers
    isLoading,
    showSkeleton,
    canSave,

    // Context data
    {resource},
    errorMessage,

    // Actions
    load,
    save,
    reset,

    // Actor ref for emissions
    actorRef,
  };
}
```

## Step 3: Handle Emissions with Emissions Composable

Extract emission handling into a dedicated composable (`composables/use{Feature}Emissions.ts`). The component/view provides callbacks, and formats UI text from `utils/`.

### Emissions Composable (`composables/use{Feature}Emissions.ts`)

```typescript
import { onUnmounted } from 'vue';
import { Match } from 'effect';
import type { ActorRefFrom } from 'xstate';
import { Emit, type EmitType, type {feature}Machine } from '../actors/{feature}.actor';

type {Feature}EmissionCallbacks = {
  onLoaded: (emit: Extract<EmitType, { type: Emit.{FEATURE}_LOADED }>) => void;
  onSaved: () => void;
  onLimitReached: () => void;
  onError: (error: string) => void;
};

export function use{Feature}Emissions(
  actorRef: ActorRefFrom<typeof {feature}Machine>,
  callbacks: {Feature}EmissionCallbacks,
) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.{FEATURE}_LOADED }, (emit) => {
        callbacks.onLoaded(emit);
      }),
      Match.when({ type: Emit.{FEATURE}_SAVED }, () => {
        callbacks.onSaved();
      }),
      Match.when({ type: Emit.{FEATURE}_LIMIT_REACHED }, () => {
        callbacks.onLimitReached();
      }),
      Match.when({ type: Emit.{FEATURE}_ERROR }, (emit) => {
        callbacks.onError(emit.error);
      }),
      Match.exhaustive,
    );
  }

  const subscriptions = Object.values(Emit).map((e) =>
    actorRef.on(e, handleEmit),
  );

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
```

### Component Uses Emissions Composable + Utils for UI Text

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import { use{Feature} } from './composables/use{Feature}';
import { use{Feature}Emissions } from './composables/use{Feature}Emissions';
// UI text comes from utils — NOT from emissions
import { formatSavedMessage, formatLimitReachedMessage } from './utils/{feature}-formatting';

const toast = useToast();
const {
  loading,
  {resource},
  load,
  save,
  actorRef,
} = use{Feature}();

const serviceError = ref<string | null>(null);

// Emissions composable dispatches to callbacks
use{Feature}Emissions(actorRef, {
  onLoaded: () => {
    serviceError.value = null;
  },
  onSaved: () => {
    serviceError.value = null;
    toast.add({ severity: 'success', summary: formatSavedMessage() });
  },
  onLimitReached: () => {
    toast.add({ severity: 'warn', summary: formatLimitReachedMessage() });
  },
  onError: (error) => {
    serviceError.value = error;
  },
});

onMounted(() => {
  load();
});
</script>

<template>
  <Skeleton v-if="loading" />
  <div v-else-if="{resource}">
    <!-- Render content -->
  </div>
  <Message v-if="serviceError" severity="error" :text="serviceError" />
</template>
```

## Common Patterns

### Actor with Input (for operations that need parameters)

```typescript
const createLogic = fromCallback<EventObject, { startDate: Date; endDate: Date }>(
  ({ sendBack, input }) =>
    runWithUi(
      programCreate(input.startDate, input.endDate),
      (result) => sendBack({ type: Event.ON_SUCCESS, result }),
      (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
    ),
);

// In machine invoke:
invoke: {
  src: 'createActor',
  input: ({ event }) => {
    assertEvent(event, Event.CREATE);
    return { startDate: event.startDate, endDate: event.endDate };
  },
},
```

### Guards for Conditional Transitions

```typescript
guards: {
  canSubmit: ({ context }) => context.data !== null,
  isValid: ({ context, event }) => {
    assertEvent(event, Event.VALIDATE);
    return event.value > 0;
  },
},

// In state:
on: {
  [Event.SUBMIT]: {
    guard: 'canSubmit',
    target: State.Submitting,
  },
},
```

### Multiple Parallel Invokes

```typescript
[State.Processing]: {
  invoke: [
    { id: 'actor1', src: 'actor1Logic' },
    { id: 'actor2', src: 'actor2Logic' },
  ],
  on: {
    [Event.ACTOR1_DONE]: { /* ... */ },
    [Event.ACTOR2_DONE]: { /* ... */ },
  },
},
```

### Child Actor Communication

```typescript
// In child actor
import { sendParent } from 'xstate';

actions: {
  notifyParent: sendParent(({ context }) => ({
    type: 'CHILD_COMPLETE',
    data: context.result,
  })),
},

// In parent - spawn child
context: ({ spawn }) => ({
  childRef: spawn('childMachine', { id: 'child' }),
}),
```

## Checklist

- [ ] Created `actors/{feature}.actor.ts`
- [ ] Defined `{Feature}State` enum
- [ ] Defined `Event` enum
- [ ] Defined `Emit` enum
- [ ] Defined `EventType` union
- [ ] Defined `EmitType` union (no UI text — domain payloads or bare facts only)
- [ ] Defined `Context` type
- [ ] Created `fromCallback` actors calling application service programXxx() (single entrypoint)
- [ ] Created machine with `setup()` and `createMachine()`
- [ ] Created `composables/use{Feature}.ts`
- [ ] Added state selectors with `useSelector`
- [ ] Added context data selectors
- [ ] Added action methods
- [ ] Exported `actorRef` for emissions
- [ ] Created `composables/use{Feature}Emissions.ts` with callback-based emission handling
- [ ] Component uses emissions composable (not inline Match)
- [ ] Component formats UI text from `utils/` (not from emission payloads)
- [ ] Component cleans up subscriptions in `onUnmounted` (via emissions composable)

## FC-Aware Guards (Domain Modeling Integration)

When the feature has a domain layer (`domain/` directory), guards MUST delegate to domain service pure functions. No inline business rules in guard implementations.

```typescript
// Import FC pure functions
import {
  isPlanInProgress,
  canCompletePlan,
  hasAllPeriodsCompleted,
} from '../domain';

// In machine setup:
guards: {
  // ✅ CORRECT: Guard delegates to FC pure function
  isPlanActive: ({ context }) =>
    isPlanInProgress(context.plan?.status),

  canComplete: ({ context }) =>
    context.plan ? canCompletePlan(context.plan) : false,

  hasCompletedPeriods: ({ context }) =>
    context.plan ? hasAllPeriodsCompleted(context.plan.periods) : false,

  // ❌ WRONG: Inline business rule
  canComplete: ({ context }) =>
    context.plan?.status === 'Active' &&
    context.plan?.periods.every(p => p.completed),
},
```

**Rule**: If a guard contains a business condition more complex than a null check, it MUST call a domain service function.

## Decision ADT Transitions

When the domain uses `Data.TaggedEnum` decision ADTs (from contracts), the actor MUST use `$match` or `$is` for exhaustive matching. `Match.orElse` is PROHIBITED for decision matching (violates closed world).

```typescript
import { PlanCreationDecision } from '../domain';

// In fromCallback actor:
const createPlanLogic = fromCallback<EventObject, { input: CreatePlanInput }>(({ sendBack, input }) =>
  runWithUi(
    programDecideAndCreatePlan(input.input),
    (decision) => {
      // ✅ CORRECT: Exhaustive $match on decision ADT
      PlanCreationDecision.$match(decision, {
        CanCreate: (d) => sendBack({ type: Event.ON_CREATED, result: d }),
        BlockedByActivePlan: (d) => sendBack({ type: Event.ON_BLOCKED_BY_PLAN, planId: d.planId }),
        BlockedByActiveCycle: (d) => sendBack({ type: Event.ON_BLOCKED_BY_CYCLE, cycleId: d.cycleId }),
        InvalidPeriodCount: (d) => sendBack({ type: Event.ON_INVALID_PERIODS, count: d.count }),
      });
    },
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

// ❌ WRONG: Match.orElse hides missing variants
// Match.value(decision._tag).pipe(
//   Match.when('CanCreate', () => ...),
//   Match.orElse(() => sendBack({ type: Event.ON_ERROR })),  // PROHIBITED
// );
```

**Rule**: Every decision variant MUST have a corresponding event and transition. Adding a new variant to the ADT MUST cause a compile error in the actor.

## Domain-Typed Context

When the feature has a domain layer, context MUST use domain types (branded IDs, entities) instead of raw `string`/`number`. Events carry domain-typed payloads.

```typescript
import type { Plan, PlanId, Period, PlanStatus } from '../domain';

type Context = {
  plan: Plan | null; // ✅ Domain entity, not raw object
  selectedPlanId: PlanId | null; // ✅ Branded ID, not string
  periods: ReadonlyArray<Period>; // ✅ Domain type array
  error: string | null;
};

type EventType =
  | { type: Event.LOAD; planId: PlanId } // ✅ Branded ID in event
  | { type: Event.ON_LOADED; plan: Plan } // ✅ Domain entity in event
  | { type: Event.ON_ERROR; error: string };
```

**Rule**: If a context field or event payload represents a domain concept, it MUST use the domain type from `domain/`. The only exception is `error: string` for display messages.

## Clock Rule

No `Date.now()` or `new Date()` in the actor. The current time is an implicit side effect that breaks testability.

```typescript
// ✅ CORRECT: Gateway service uses DateTime.nowAsDate, passes to FC
const cancelLogic = fromCallback<EventObject, { planId: PlanId }>(({ sendBack, input }) =>
  runWithUi(
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate; // ← clock in Effect shell
      const plan = yield* PlanService.getById(input.planId);
      const decision = decideCancellation(plan, now); // ← FC receives Date
      return decision;
    }).pipe(Effect.provide(/* layers */)),
    (decision) => {
      /* handle */
    },
    (error) => {
      /* handle */
    },
  ),
);

// ❌ WRONG: Date.now() in actor
const cancelLogic = fromCallback(({ sendBack, input }) => {
  const now = new Date(); // WRONG — implicit side effect
  runWithUi(
    programCancelPlan(input.planId, now),
    // ...
  );
});
```

**Rule**: `DateTime.nowAsDate` in Effect shell (gateway/program), `now: Date` as parameter to FC functions. The actor never touches the clock.

## Emission Rule

Emissions may carry domain-typed payloads (entities, IDs) but NEVER user-facing text.
UI text is formatted by the consumer (composable/component) using `utils/` functions.
Exception: `error: string` in ERROR emissions (from gateway/API).

```typescript
// ✅ CORRECT: Domain payload
{ type: Emit.TEMPLATE_LOADED, template: PlanTemplateDetail }

// ✅ CORRECT: Bare fact — consumer formats UI text
{ type: Emit.TEMPLATE_DUPLICATED }

// ✅ CORRECT: Error string (exception from API)
{ type: Emit.TEMPLATE_ERROR, error: 'Server error' }

// ❌ WRONG: UI text in emission
{ type: Emit.TEMPLATE_LIMIT_REACHED, message: 'You have 20 saved plans...' }
```
