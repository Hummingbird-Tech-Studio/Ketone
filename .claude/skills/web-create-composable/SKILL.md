---
name: web-create-composable
description: Create a View Model composable that bridges FC domain to Vue components. Domain computeds, input validation, UI state translation.
model: opus
---

# Create View Model Composable

Creates a composable that acts as the **View Model** — it bridges the Functional Core domain to Vue components. This skill goes beyond the basic composable in `create-actor` by adding domain-aware patterns.

## Usage

```
/web-create-composable <FeatureName> --actor <actorName> --domain-services <list> --input-validations <list>
```

## Arguments

- `FeatureName`: The feature name in PascalCase (e.g., `Plan`, `Cycle`)
- `--actor`: The XState actor machine name (e.g., `planMachine`)
- `--domain-services`: Comma-separated domain service functions to expose as computeds
- `--input-validations`: Comma-separated input schemas for validation

## When to Use

Use this skill when the feature has a domain layer (`domain/` directory). The composable becomes the View Model with:

- Domain computeds (FC service → computed)
- Input validation (Schema → domain types or errors)
- UI state translation (domain → labels/colors)

If the feature does NOT have a domain layer, use the composable section from `create-actor` instead.

## File Location

```
web/src/views/{feature}/composables/
└── use{Feature}.ts     # View Model composable
```

## Complete View Model Composable Template

```typescript
// composables/use{Feature}.ts
import { computed, ref, type Ref } from 'vue';
import { useActorRef, useSelector } from '@xstate/vue';
import { Either, Match } from 'effect';

// Actor imports
import {
  {feature}Machine,
  {Feature}State,
  Event,
  type EmitType,
} from '../actors/{feature}.actor';

// Domain imports (via barrel)
import {
  // FC service functions (standalone — for computeds)
  canComplete{Feature},
  assess{Feature}Progress,
  is{Feature}Active,
  // Input validation
  validateCreate{Feature}Input,
  extractSchemaErrors,
  // Types
  type Create{Feature}DomainInput,
  type {Feature}Status,
} from '../domain';

// Formatting utils — user-facing strings (NOT from domain services)
import {
  formatPeriodCountLabel,
  buildSaveConfirmationMessage,
  sortByRecency,
} from '../utils/{feature}-formatting';

// ============================================
// View Model: use{Feature}
// ============================================

export function use{Feature}() {
  // ============================================
  // 1. ACTOR REFERENCE
  // ============================================

  // MUST use useActorRef (not useActor or singleton)
  const actorRef = useActorRef({feature}Machine);

  // ============================================
  // 2. STATE SELECTORS
  // ============================================

  // MUST use useSelector for reactive state access
  const idle = useSelector(actorRef, (state) => state.matches({Feature}State.Idle));
  const loading = useSelector(actorRef, (state) => state.matches({Feature}State.Loading));
  const loaded = useSelector(actorRef, (state) => state.matches({Feature}State.Loaded));
  const saving = useSelector(actorRef, (state) => state.matches({Feature}State.Saving));
  const error = useSelector(actorRef, (state) => state.matches({Feature}State.Error));

  // ============================================
  // 3. CONTEXT DATA SELECTORS
  // ============================================

  const resource = useSelector(actorRef, (state) => state.context.{resource});
  const errorMessage = useSelector(actorRef, (state) => state.context.error);

  // ============================================
  // 4. DOMAIN COMPUTEDS (FC service → computed)
  // ============================================

  // Business rules exposed as reactive computeds.
  // These call FC pure functions — the composable is the bridge.

  const canComplete = computed(() => {
    if (!{resource}.value) return false;
    return canComplete{Feature}({resource}.value);
  });

  const progress = computed(() => {
    if (!{resource}.value) return null;
    return assess{Feature}Progress({resource}.value);
  });

  const isActive = computed(() => {
    if (!{resource}.value) return false;
    return is{Feature}Active({resource}.value.status);
  });

  // ============================================
  // 5. UI STATE TRANSLATION (domain → UI)
  // ============================================

  // The composable is the ONLY layer allowed to translate
  // domain types into UI strings/colors/icons.

  const statusLabel = computed((): string => {
    const status = {resource}.value?.status;
    if (!status) return '';
    return Match.value(status).pipe(
      Match.when('Active', () => 'In Progress'),
      Match.when('Completed', () => 'Done'),
      Match.when('Cancelled', () => 'Cancelled'),
      Match.exhaustive,
    );
  });

  const statusSeverity = computed((): string => {
    const status = {resource}.value?.status;
    if (!status) return 'secondary';
    return Match.value(status).pipe(
      Match.when('Active', () => 'info'),
      Match.when('Completed', () => 'success'),
      Match.when('Cancelled', () => 'warn'),
      Match.exhaustive,
    );
  });

  // ============================================
  // 5b. PRESENTATION TEXT (from utils)
  // ============================================

  // Formatting functions from utils/ produce user-facing strings.
  // Domain services NEVER produce UI text — only utils do.

  // import { formatPeriodCountLabel, sortByRecency } from '../utils/{feature}-formatting';

  // const cards = computed(() =>
  //   sortByRecency(resources.value).map((item) => ({
  //     ...item,
  //     periodCountLabel: formatPeriodCountLabel(item.periodCount),
  //   })),
  // );

  // ============================================
  // 6. INPUT VALIDATION
  // ============================================

  // Standardized error shape for UI display
  const errors: Ref<Record<string, string[]>> = ref({});

  /**
   * Validates raw input and sends domain-typed data to actor.
   * Component calls this — never sends raw data to actor directly.
   */
  const create{Feature} = (rawInput: unknown) => {
    const result = validateCreate{Feature}Input(rawInput);

    if (Either.isLeft(result)) {
      errors.value = extractSchemaErrors(result.left);
      return;
    }

    // Clear errors and send validated domain input to actor
    errors.value = {};
    actorRef.send({
      type: Event.CREATE,
      input: result.right, // ← domain-typed
    });
  };

  /**
   * Clears validation errors (e.g., when user starts editing).
   */
  const clearErrors = () => {
    errors.value = {};
  };

  /**
   * Check if a specific field has errors.
   */
  const hasFieldError = (field: string): boolean =>
    field in errors.value && errors.value[field].length > 0;

  /**
   * Get first error message for a field.
   */
  const getFieldError = (field: string): string | undefined =>
    errors.value[field]?.[0];

  // ============================================
  // 7. COMPUTED HELPERS
  // ============================================

  const isLoading = computed(() => loading.value || saving.value);
  const showSkeleton = computed(() => loading.value && !{resource}.value);
  const canSave = computed(() => loaded.value && !saving.value);

  // ============================================
  // 8. ACTIONS
  // ============================================

  const load = () => {
    actorRef.send({ type: Event.LOAD });
  };

  const save = (data: Create{Feature}DomainInput) => {
    actorRef.send({ type: Event.SAVE, data });
  };

  const reset = () => {
    actorRef.send({ type: Event.RESET });
  };

  // ============================================
  // 9. RETURN
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
    resource,
    errorMessage,

    // Domain computeds (FC → computed)
    canComplete,
    progress,
    isActive,

    // UI state translation
    statusLabel,
    statusSeverity,

    // Input validation
    errors,
    create{Feature},
    clearErrors,
    hasFieldError,
    getFieldError,

    // Actions
    load,
    save,
    reset,

    // Actor ref for emissions
    actorRef,
  };
}
```

## Composable Responsibilities

The composable is the **View Model** layer — the single bridge between domain and UI:

| Concern                                        | Implementation                   | Example                                                  |
| ---------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| Business rules (can X?, is Y valid?)           | FC service → `computed`          | `canComplete`, `isActive`                                |
| State derivation (what phase? progress?)       | FC service → `computed`          | `progress`, `currentPhase`                               |
| Domain → UI translation (status → label/color) | `Match.exhaustive` in `computed` | `statusLabel`, `statusSeverity`                          |
| Presentation text (labels, messages)           | Formatting utils → `computed`    | `formatLabel(count)`, `buildMessage(name)` from `utils/` |
| Input validation (form → domain types)         | Schema → `Either`                | `createFeature(rawInput)`                                |
| Error display                                  | `Ref<Record<string, string[]>>`  | `errors`, `hasFieldError`, `getFieldError`               |
| Actor state                                    | `useSelector`                    | `loading`, `loaded`, `error`                             |
| Actor actions                                  | Send function                    | `load()`, `save()`, `reset()`                            |

## Patterns

### Domain Computed with Null Safety

```typescript
const canComplete = computed(() => {
  if (!resource.value) return false;
  return canCompletePlan(resource.value);
});
```

### UI Translation with Match.exhaustive

```typescript
const statusLabel = computed((): string => {
  const status = resource.value?.status;
  if (!status) return '';
  return Match.value(status).pipe(
    Match.when('Active', () => 'In Progress'),
    Match.when('Completed', () => 'Done'),
    Match.when('Cancelled', () => 'Cancelled'),
    Match.exhaustive,
  );
});
```

### Input Validation with Error Extraction

```typescript
const errors: Ref<Record<string, string[]>> = ref({});

const createFeature = (rawInput: unknown) => {
  const result = validateCreateFeatureInput(rawInput);

  if (Either.isLeft(result)) {
    errors.value = extractSchemaErrors(result.left);
    return;
  }

  errors.value = {};
  actorRef.send({ type: Event.CREATE, input: result.right });
};
```

### Multiple Domain Services

```typescript
import { canCompletePlan, assessProgress, calculateDaysRemaining, isPlanActive } from '../domain';

const canComplete = computed(() => (resource.value ? canCompletePlan(resource.value) : false));
const progress = computed(() => (resource.value ? assessProgress(resource.value) : null));
const daysRemaining = computed(() => (resource.value ? calculateDaysRemaining(resource.value, new Date()) : null));
```

### Composable with Actor Input

```typescript
export function useFeature(featureId: string) {
  const actorRef = useActorRef(featureMachine, {
    input: { featureId },
  });
  // ... rest of composable
}
```

## Component Integration

The component uses the composable and never contains business logic:

```vue
<template>
  <div class="feature">
    <!-- UI translation from composable -->
    <Tag :severity="statusSeverity">{{ statusLabel }}</Tag>

    <!-- Business rule from composable computed -->
    <Button :disabled="!canComplete" @click="completePlan" label="Complete" />

    <!-- Input validation from composable -->
    <InputText v-model="formData.name" :invalid="hasFieldError('name')" />
    <small v-if="hasFieldError('name')" class="p-error">
      {{ getFieldError('name') }}
    </small>

    <!-- Action through composable (which validates first) -->
    <Button @click="createFeature(formData)" label="Create" />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useFeature } from '../composables/useFeature';

const {
  // Domain computeds
  canComplete,
  statusLabel,
  statusSeverity,
  // Input validation
  errors,
  createFeature,
  hasFieldError,
  getFieldError,
  // Actor ref
  actorRef,
} = useFeature();

const formData = reactive({ name: '', fastingDuration: 16 });
</script>
```

## What NOT to Do

```typescript
// ❌ WRONG: Business logic in component
<Button :disabled="plan.status !== 'Active' || plan.periods.length === 0" />

// ✅ CORRECT: FC service via composable computed
<Button :disabled="!canComplete" />
```

```typescript
// ❌ WRONG: Domain → UI translation in component
<span>{{ plan.status === 'Active' ? 'In Progress' : plan.status }}</span>

// ✅ CORRECT: Composable handles translation
<span>{{ statusLabel }}</span>
```

```typescript
// ❌ WRONG: Raw input sent to actor
actorRef.send({ type: 'CREATE', name: input.name, hours: input.hours });

// ✅ CORRECT: Composable validates first
createFeature(formData); // validates, then sends domain-typed
```

## Checklist

- [ ] `useActorRef` used (not `useActor` or singleton)
- [ ] `useSelector` used for all reactive state access
- [ ] Domain computeds call FC service functions
- [ ] Null safety on all domain computeds
- [ ] UI translations use `Match.exhaustive` for status/enum mapping
- [ ] Input validation via domain validations with `Either`
- [ ] `errors: Ref<Record<string, string[]>>` for standardized error shape
- [ ] `extractSchemaErrors` helper used for error extraction
- [ ] `hasFieldError`/`getFieldError` helpers for template use
- [ ] Actions send domain-typed data to actor
- [ ] `actorRef` exported for emission subscriptions
- [ ] Formatting utils imported from `utils/{feature}-formatting.ts`
- [ ] Presentation text produced by composable (using utils), not by domain services
- [ ] Component never contains business logic
- [ ] Component never imports from `domain/` directly
