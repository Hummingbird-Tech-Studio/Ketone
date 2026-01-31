---
name: create-actor
description: Create a new XState actor with composable for Vue integration. Use when asked to create, add, or implement a new state machine, actor, or feature flow.
---

# Create XState Actor with Composable

When creating a new XState actor, follow this structure and patterns exactly.

## File Structure

For a new actor in feature `{feature}`:

```
web/src/views/{feature}/
├── actors/
│   └── {feature}.actor.ts      # State machine
├── composables/
│   └── use{Feature}.ts         # Vue composable
└── services/
    └── {feature}.service.ts    # HTTP service (if needed)
```

## Step 1: Create Actor (`actors/{feature}.actor.ts`)

```typescript
import { assertEvent, assign, emit, fromCallback, setup } from 'xstate';
import type { EventObject } from 'xstate';
import { runWithUi } from '@/utils/effects/helpers';
import { extractErrorMessage } from '@/utils/errors';
import { program{Action} } from '../services/{feature}.service';

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
  | { type: Emit.{FEATURE}_LOADED; result: {Resource} }
  | { type: Emit.{FEATURE}_SAVED; result: {Resource} }
  | { type: Emit.{FEATURE}_ERROR; error: string };

type Context = {
  {resource}: {Resource} | null;
  error: string | null;
};

// ============================================
// 3. ACTORS (fromCallback)
// ============================================

const load{Resource}Logic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programGet{Resource}(),
    (result) => {
      sendBack({ type: Event.ON_LOAD_SUCCESS, result });
    },
    (error) => {
      sendBack({ type: Event.ON_LOAD_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

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

```typescript
import { computed } from 'vue';
import { useActor, useSelector } from '@xstate/vue';
import { {feature}Machine, {Feature}State, Event, Emit, type EmitType } from '../actors/{feature}.actor';

export function use{Feature}() {
  // ============================================
  // 1. ACTOR INITIALIZATION
  // ============================================
  const { send, actorRef } = useActor({feature}Machine);

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
    send({ type: Event.LOAD });
  };

  const save = (data: SaveData) => {
    send({ type: Event.SAVE, data });
  };

  const reset = () => {
    send({ type: Event.RESET });
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

## Step 3: Handle Emissions in Component

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Match } from 'effect';
import { use{Feature} } from './composables/use{Feature}';
import { Emit, type EmitType } from './actors/{feature}.actor';

const {
  loading,
  {resource},
  load,
  save,
  actorRef,
} = use{Feature}();

const serviceError = ref<string | null>(null);

// Handle emissions with Match
function handleEmit(emitType: EmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: Emit.{FEATURE}_LOADED }, (emit) => {
      serviceError.value = null;
      // Handle success
    }),
    Match.when({ type: Emit.{FEATURE}_SAVED }, (emit) => {
      serviceError.value = null;
      // Handle saved
    }),
    Match.when({ type: Emit.{FEATURE}_ERROR }, (emit) => {
      serviceError.value = emit.error;
    }),
    Match.exhaustive,
  );
}

// Subscribe to all emit types
const subscriptions = Object.values(Emit).map((emit) =>
  actorRef.on(emit, handleEmit)
);

// Cleanup
onUnmounted(() => {
  subscriptions.forEach((sub) => sub.unsubscribe());
});

// Load on mount
onMounted(() => {
  load();
});
</script>

<template>
  <Skeleton v-if="loading" />
  <div v-else-if="{ resource }">
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
- [ ] Defined `EmitType` union
- [ ] Defined `Context` type
- [ ] Created `fromCallback` actors for async operations
- [ ] Created machine with `setup()` and `createMachine()`
- [ ] Created `composables/use{Feature}.ts`
- [ ] Added state selectors with `useSelector`
- [ ] Added context data selectors
- [ ] Added action methods
- [ ] Exported `actorRef` for emissions
- [ ] Component handles emissions with `Match.value().pipe()`
- [ ] Component subscribes to emit types
- [ ] Component cleans up subscriptions in `onUnmounted`
