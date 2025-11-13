---
trigger: always_on
description: These View Component Best Practices should be applied to all presentational/UI components in the src/views/ directory and src/components/ directory.
---

# Skeleton Loading Pattern

Best practices for implementing skeleton loaders in Vue components for optimal UX and zero layout shift.

---

## Table of Contents

1. [When to Use Skeletons](#when-to-use-skeletons)
2. [Pattern: Initial Load Only](#pattern-initial-load-only)
3. [Implementation Guide](#implementation-guide)
4. [Complete Example](#complete-example)
5. [Best Practices](#best-practices)
6. [Component Dimensions Reference](#component-dimensions-reference)

---

## When to Use Skeletons

### ✅ Use Skeletons When:

- **Initial page/component load**: Show skeleton on first mount while data is fetching
- **Perceived performance matters**: User expects to see content in specific areas
- **Layout is predictable**: You know the structure and dimensions beforehand
- **Loading time > 200ms**: For shorter loads, use spinner or no indicator

### ❌ Don't Use Skeletons When:

- **Data reloads after user actions**: (e.g., after saving) - keep existing data visible
- **Content dimensions are unknown**: Or highly variable
- **Loading time < 200ms**: Too fast for skeletons to be useful
- **Background updates**: When user doesn't need to know about the refresh

---

## Pattern: Initial Load Only

The key insight: **Show skeletons only during initial load, not on subsequent reloads.**

This is achieved by deriving state from the actor/composable without local variables.

### Why This Matters

**Bad UX:**
```
User saves form → Loading state → Skeletons appear → Data reappears
                    ❌ Jarring flash
```

**Good UX:**
```
User saves form → Loading state → Data stays visible → Updated data appears
                    ✅ Smooth transition
```

---

## Implementation Guide

### Step 1: Composable Pattern

Add a computed property that derives skeleton state from existing data:

```typescript
// composables/useProfile.ts
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { Option } from 'effect';
import { profileActor, ProfileEvent, ProfileState } from '../actors/profileActor';

export function useProfile() {
  const { send, actorRef } = useActor(profileActor);

  const loading = useSelector(actorRef, (state) => state.matches(ProfileState.Loading));
  const profile = useSelector(actorRef, (state) => state.context.profile);

  // Show skeleton only on initial load (loading && no profile data yet)
  const showSkeleton = computed(() => loading.value && Option.isNone(profile.value));

  return {
    // State checks
    loading,
    loaded,
    saving,

    // Context data
    profile,

    // UI helpers
    showSkeleton,  // ← Derived state for UI

    // Actions
    loadProfile,
    saveProfile,

    // Raw actor ref
    actorRef,
  };
}
```

**Logic Explanation:**

| Scenario | Loading | Profile | showSkeleton | Result |
|----------|---------|---------|--------------|--------|
| First load | `true` | `None` | `true` | ✅ Show skeletons |
| After save/reload | `true` | `Some(data)` | `false` | ✅ Keep data visible |
| Loaded | `false` | `Some(data)` | `false` | ✅ Show data |

### Step 1.5: Computed Properties with Fallbacks

When child components require props from data that might be `null` during loading, create computed properties with safe fallback values in the composable:

```typescript
// composables/useCycle.ts
import { cycleMachine, CycleState, Event } from '@/views/cycle/actors/cycle.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

export function useCycle() {
  const { send, actorRef } = useActor(cycleMachine);

  const loading = useSelector(actorRef, (state) => state.matches(CycleState.Loading));
  const cycleData = useSelector(actorRef, (state) => state.context.cycleData);

  // Show skeleton only on initial load
  const showSkeleton = computed(() => loading.value && cycleData.value === null);

  // Computed properties with safe fallbacks - avoids ternaries in template
  const startDate = computed(() => cycleData.value?.startDate ?? new Date());
  const endDate = computed(() => cycleData.value?.endDate ?? new Date());

  return {
    loading,
    cycleData,
    startDate,      // ← Safe to pass as prop, always returns Date
    endDate,        // ← Safe to pass as prop, always returns Date
    showSkeleton,
    actorRef,
  };
}
```

**Why This Pattern?**

```vue
<!-- ❌ Bad: Repeated ternaries in template -->
<Timer
  :loading="showSkeleton"
  :startDate="showSkeleton ? new Date() : cycleData!.startDate"
  :endDate="showSkeleton ? new Date() : cycleData!.endDate"
/>

<!-- ✅ Good: Clean props from composable -->
<Timer
  :loading="showSkeleton"
  :startDate="startDate"
  :endDate="endDate"
/>
```

**Benefits:**
- ✅ No repeated ternary operators in template
- ✅ Centralized fallback logic in composable
- ✅ Type-safe (always returns correct type, never null)
- ✅ Single source of truth for derived values

**When to Use:**
- Props passed to child components that require non-null values
- Derived values used in multiple places
- Complex calculations that need fallback values

### Step 2: Template Pattern - Container-Based Skeletons

Use persistent containers with fixed heights to prevent layout shift:

```vue
<template>
  <div class="form">
    <!-- Container persists, content switches -->
    <div class="form__field">
      <Skeleton v-if="showSkeleton" height="100%" border-radius="6px" />
      <Field v-else name="name" v-slot="{ field, errorMessage }">
        <InputText placeholder="Name" variant="filled" fluid v-bind="field" />
        <Message v-if="errorMessage" severity="error" variant="simple" size="small">
          {{ errorMessage }}
        </Message>
      </Field>
    </div>

    <div class="form__field">
      <Skeleton v-if="showSkeleton" height="100%" border-radius="6px" />
      <Field v-else name="email" v-slot="{ field, errorMessage }">
        <InputText placeholder="Email" variant="filled" fluid v-bind="field" />
        <Message v-if="errorMessage" severity="error" variant="simple" size="small">
          {{ errorMessage }}
        </Message>
      </Field>
    </div>

    <div class="form__button-wrapper">
      <Skeleton v-if="showSkeleton" width="130px" height="100%" border-radius="20px" />
      <ButtonPrime v-else class="form__button" label="Save" @click="handleSave" />
    </div>
  </div>
</template>
```

**Key Points:**
- ✅ Containers (`.form__field`, `.form__button-wrapper`) **always exist**
- ✅ Only the **content** switches (Skeleton ↔ Field/Button)
- ✅ No conditional rendering of containers = no layout shift

### Step 3: Styles - Fixed Heights for Zero Layout Shift

```scss
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__field {
    height: 48px;  // ← Use height, not min-height
  }

  &__button-wrapper {
    display: flex;
    justify-content: center;
    height: 40px;  // ← Fixed height matching button
  }

  &__button {
    min-width: 130px;
  }
}
```

**Why `height` instead of `min-height`?**

```scss
// ❌ Doesn't work - Skeleton won't be visible
.form__field {
  min-height: 48px;  // Skeleton with height: 100% can't calculate size
}

// ✅ Works - Skeleton fills the 48px container
.form__field {
  height: 48px;  // Explicit height for height: 100% to work
}
```

---

## Complete Example

### Profile Form with Skeleton Loading

```vue
<template>
  <div class="basicInformation">
    <div class="basicInformation__title">Basic Information</div>

    <div class="basicInformation__content">
      <!-- Name Field -->
      <div class="basicInformation__name">
        <Skeleton v-if="showSkeleton" height="100%" border-radius="6px" />
        <Field v-else name="name" v-slot="{ field, errorMessage }">
          <InputText placeholder="Name" variant="filled" fluid v-bind="field" />
          <Message v-if="errorMessage" severity="error" variant="simple" size="small">
            {{ errorMessage }}
          </Message>
        </Field>
      </div>

      <!-- Date of Birth Field -->
      <div class="basicInformation__dateOfBirth">
        <Skeleton v-if="showSkeleton" height="100%" border-radius="6px" />
        <Field v-else name="dateOfBirth" v-slot="{ value, errorMessage, handleChange }">
          <DatePicker
            :model-value="value"
            placeholder="Date of Birth"
            variant="filled"
            fluid
            date-format="mm/dd/yy"
            update-model-type="date"
            @update:modelValue="handleChange"
          />
          <Message v-if="errorMessage" severity="error" variant="simple" size="small">
            {{ errorMessage }}
          </Message>
        </Field>
      </div>

      <!-- Submit Button -->
      <div class="basicInformation__buttonWrapper">
        <Skeleton v-if="showSkeleton" width="130px" height="100%" border-radius="20px" />
        <ButtonPrime
          v-else
          class="basicInformation__button"
          :label="saving ? 'Saving...' : 'Save Changes'"
          rounded
          @click="onSubmit"
          outlined
          :disabled="saving"
          :loading="saving"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Emit, type EmitType } from '@/views/profile/actors/profileActor';
import { useProfile } from '@/views/profile/composables/useProfile';
import { toTypedSchema } from '@vee-validate/zod';
import { Match, Option } from 'effect';
import { useToast } from 'primevue/usetoast';
import { Field, useForm } from 'vee-validate';
import { onMounted, onUnmounted, watch } from 'vue';
import { date, object, string } from 'zod';

const toast = useToast();

// Form validation schema
const schema = toTypedSchema(
  object({
    name: string({ required_error: 'This field is required' })
      .min(2, 'Name must be at least 2 characters long')
      .regex(/^[a-zA-Z\s]+$/, 'Name cannot contain numbers or special characters'),
    dateOfBirth: date({ required_error: 'This field is required' })
      .refine((date) => calculateAge(date) >= 18, { message: 'You must be at least 18 years old' })
      .refine((date) => calculateAge(date) <= 120, { message: 'Age cannot exceed 120 years' }),
  }),
);

const { handleSubmit, setValues } = useForm({ validationSchema: schema });

// Get composable with showSkeleton
const { loadProfile, saveProfile, profile, saving, showSkeleton, actorRef } = useProfile();

function calculateAge(birthDate: Date): number {
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  return monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
}

const onSubmit = handleSubmit((values) => {
  saveProfile({
    name: values.name,
    dateOfBirth: values.dateOfBirth.getTime(),
  });
});

onMounted(() => {
  loadProfile();
});

// Update form when profile data loads
watch(profile, (newProfileOption) => {
  Option.map(newProfileOption, (profileData) => {
    setValues({
      name: profileData.name,
      dateOfBirth: profileData.dateOfBirth ? new Date(profileData.dateOfBirth) : undefined,
    });
  });
});

// Handle emissions (success/error toasts)
function handleEmit(emitType: EmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: Emit.SAVE_SUCCESS }, () => {
      toast.add({
        severity: 'success',
        summary: 'Profile Saved',
        detail: 'Your profile has been updated successfully',
        life: 3000,
      });
    }),
    Match.when({ type: Emit.ERROR }, (emit) => {
      toast.add({
        severity: 'error',
        summary: emit.summary,
        detail: emit.detail,
        life: 10000,
      });
    }),
    Match.exhaustive,
  );
}

const subscriptions = [...Object.values(Emit).map((emit) => actorRef.on(emit, handleEmit))];

onUnmounted(() => {
  subscriptions.forEach((sub) => sub.unsubscribe());
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.basicInformation {
  display: flex;
  flex-direction: column;
  padding: 22px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 16px;
  gap: 16px;

  &__title {
    font-style: normal;
    font-weight: 700;
    font-size: 18px;
    color: $color-primary-button-text;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__name,
  &__dateOfBirth {
    height: 48px;  // Fixed height matching PrimeVue filled inputs
  }

  &__buttonWrapper {
    display: flex;
    justify-content: center;
    height: 40px;  // Fixed height matching PrimeVue button
  }

  &__button {
    min-width: 130px;
  }
}
</style>
```

---

## Best Practices

### ✅ Do

1. **Derive showSkeleton from state**: Use computed from existing state (loading + hasData)
   ```typescript
   const showSkeleton = computed(() => loading.value && Option.isNone(profile.value));
   ```

2. **Use fixed container heights**: Set explicit `height` on containers, not `min-height`
   ```scss
   &__field {
     height: 48px;  // ✅ Works with height: 100%
   }
   ```

3. **Match dimensions**: Skeleton dimensions should match real component dimensions
   ```vue
   <Skeleton height="100%" border-radius="6px" />  <!-- Matches InputText filled -->
   ```

4. **Match border-radius**: Use same border-radius as actual components
   - Filled inputs: `6px`
   - Rounded buttons: `20px`

5. **Show on initial load only**: Don't show skeletons on reloads after user actions

6. **Use persistent containers**: Containers always exist, only content switches
   ```vue
   <div class="form__field">  <!-- Always here -->
     <Skeleton v-if="showSkeleton" />
     <Field v-else />
   </div>
   ```

### ❌ Don't

1. **Use local loading flags**: Avoid `const [showSkeleton, setShowSkeleton] = useState(true)`
   - ❌ Requires manual management
   - ❌ Easy to forget to reset
   - ✅ Derive from state machine instead

2. **Use min-height for skeleton containers**: `height: 100%` won't work with `min-height`
   ```scss
   // ❌ Skeleton won't be visible
   &__field {
     min-height: 48px;
   }
   
   // ✅ Skeleton fills container
   &__field {
     height: 48px;
   }
   ```

3. **Show skeletons on every load**: Keep data visible during background reloads
   - ❌ Jarring user experience
   - ✅ Only show on initial load when no data exists

4. **Guess dimensions**: Measure actual component heights and use those values
   - Use browser DevTools to inspect actual rendered heights

5. **Wrap entire form**: Use individual skeletons per field for better granularity
   ```vue
   <!-- ❌ Bad: Single skeleton for entire form -->
   <Skeleton v-if="loading" height="200px" />
   <form v-else>...</form>
   
   <!-- ✅ Good: Individual skeletons per field -->
   <form>
     <div class="field">
       <Skeleton v-if="showSkeleton" />
       <InputText v-else />
     </div>
   </form>
   ```

6. **Use conditional rendering for containers**: Keep containers persistent
   ```vue
   <!-- ❌ Bad: Container conditionally rendered -->
   <div v-if="loading" class="field">
     <Skeleton />
   </div>
   <div v-else class="field">
     <InputText />
   </div>
   
   <!-- ✅ Good: Container always exists -->
   <div class="field">
     <Skeleton v-if="showSkeleton" />
     <InputText v-else />
   </div>
   ```

---

## Component Dimensions Reference

### PrimeVue Component Heights

Use these dimensions when creating matching skeletons:

| Component | Variant | Height | Border Radius |
|-----------|---------|--------|---------------|
| InputText | filled | 48px | 6px |
| DatePicker | filled | 48px | 6px |
| Select | filled | 48px | 6px |
| Textarea | filled | 80px | 6px |
| ButtonPrime | default | 40px | 4px |
| ButtonPrime | rounded | 40px | 20px |
| Card | default | variable | 12px |

### Skeleton Props Reference

```vue
<!-- Input skeleton -->
<Skeleton height="100%" border-radius="6px" />

<!-- Button skeleton (centered) -->
<Skeleton width="130px" height="100%" border-radius="20px" />

<!-- Card skeleton -->
<Skeleton height="120px" border-radius="12px" />
```

### Measuring Component Heights

If you're unsure of a component's height:

1. Open browser DevTools
2. Inspect the rendered component
3. Check the **Computed** tab
4. Look for `height` value
5. Use that value for the container

---

## Pattern Selection Guide

Choose between two skeleton patterns based on your component's structure:

### Pattern A: Template v-if/v-else (Recommended for Cohesive Components)

Use when the component has a cohesive structure with related elements:

```vue
<template>
  <div class="timer">
    <template v-if="loading">
      <div class="timer__header">
        <Skeleton width="110px" height="14px" border-radius="4px" />
        <Skeleton width="40px" height="40px" border-radius="50%" />
      </div>
      <div class="timer__time">
        <Skeleton width="140px" height="26px" border-radius="4px" />
      </div>
    </template>

    <template v-else>
      <div class="timer__header">
        <div class="timer__title">{{ title }}</div>
        <Button icon="pi pi-sync" @click="toggleTimer" />
      </div>
      <div class="timer__time">{{ time }}</div>
    </template>
  </div>
</template>
```

**Benefits:**
- ✅ Clear separation between loading and loaded states
- ✅ Easier to read and maintain
- ✅ Better for components with complex internal structure
- ✅ Prevents mixing skeleton and real content logic

**Use when:**
- Component is a cohesive unit (Timer, ProgressBar, Card)
- Multiple related elements need skeleton versions
- Skeleton structure differs significantly from real content
- Component has complex internal layout

### Pattern B: Individual v-if per Element (Recommended for Forms)

Use when the component has independent, reusable fields:

```vue
<template>
  <div class="form">
    <div class="form__field">
      <Skeleton v-if="showSkeleton" height="100%" border-radius="6px" />
      <Field v-else name="name" v-slot="{ field, errorMessage }">
        <InputText placeholder="Name" v-bind="field" />
      </Field>
    </div>

    <div class="form__field">
      <Skeleton v-if="showSkeleton" height="100%" border-radius="6px" />
      <Field v-else name="email" v-slot="{ field, errorMessage }">
        <InputText placeholder="Email" v-bind="field" />
      </Field>
    </div>
  </div>
</template>
```

**Benefits:**
- ✅ No re-mounting of components on load
- ✅ Better for forms with many independent fields
- ✅ Skeleton and content share same container (zero layout shift)
- ✅ Each field is self-contained

**Use when:**
- Form with independent fields (registration, profile, settings)
- Fields can be reordered without affecting each other
- Minimal structural differences between skeleton and content
- Prefer granular control over each field

### Decision Matrix

| Factor | Template v-if/v-else | Individual v-if |
|--------|---------------------|-----------------|
| Component type | Cohesive unit (Timer, Card) | Form with fields |
| Element relationship | Tightly coupled | Independent |
| Structure difference | Significant | Minimal |
| Readability | Better (clear separation) | Good (inline) |
| Performance | Re-mounts on load | No re-mounting |
| Best for | 3-10 related elements | 5+ independent fields |

### Real Examples

**Template v-if/v-else:**
- `Timer.vue` - Cohesive time display with header and value
- `ProgressBar.vue` - Complex animated progress indicator
- `StatsCard.vue` - Card with icon, title, and metrics
- `ChartWidget.vue` - Chart with controls and legend

**Individual v-if:**
- `ProfileForm.vue` - Independent fields (name, email, birthday)
- `SettingsForm.vue` - Unrelated settings fields
- `CheckoutForm.vue` - Shipping, billing, payment fields

---

## Child Component Integration

When building reusable components, encapsulate skeleton loading logic within the component itself rather than managing it in the parent.

### Pattern: Loading Prop with Internal Skeleton

```typescript
// Timer.vue - Child component with integrated skeleton
interface Props {
  loading?: boolean;      // ← Parent controls skeleton visibility
  cycleActor: Actor<AnyActorLogic>;
  startDate: Date;        // ← Always receives valid Date (from computed fallback)
  endDate: Date;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});
```

```vue
<template>
  <div class="timer">
    <template v-if="loading">
      <!-- Skeleton structure -->
      <div class="timer__header">
        <Skeleton width="110px" height="14px" border-radius="4px" />
        <Skeleton width="40px" height="40px" border-radius="50%" />
      </div>
      <div class="timer__time">
        <Skeleton width="140px" height="26px" border-radius="4px" />
      </div>
    </template>

    <template v-else>
      <!-- Real content -->
      <div class="timer__header">
        <div class="timer__title">{{ title }}</div>
        <Button icon="pi pi-sync" @click="toggleTimer" />
      </div>
      <div class="timer__time">{{ time }}</div>
    </template>
  </div>
</template>
```

### Parent Usage

```vue
<template>
  <div class="cycle__status">
    <div class="cycle__status__timer">
      <!-- Parent passes showSkeleton + safe computed values -->
      <Timer
        :loading="showSkeleton"
        :cycleActor="actorRef"
        :startDate="startDate"
        :endDate="endDate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCycle } from './composables/useCycle';
import Timer from './components/Timer/Timer.vue';

// Composable provides showSkeleton + safe computed values
const {
  showSkeleton,
  actorRef,
  startDate,    // ← Computed with fallback: cycleData?.startDate ?? new Date()
  endDate,      // ← Computed with fallback: cycleData?.endDate ?? new Date()
} = useCycle();
</script>
```

### Benefits

**Encapsulation:**
- ✅ Component owns its skeleton structure
- ✅ Skeleton matches real content automatically
- ✅ Changes to component update skeleton too

**Reusability:**
- ✅ Component works standalone in any context
- ✅ Parent only needs to pass `loading` flag
- ✅ No external skeleton component needed

**Single Source of Truth:**
- ✅ Skeleton dimensions match real component
- ✅ No CSS duplication between skeleton and component
- ✅ Style changes apply to both states

### When to Use This Pattern

✅ **Use internal skeleton when:**
- Building reusable UI components (Timer, Card, Widget)
- Component has consistent structure across uses
- Skeleton is specific to this component only
- Component might be used in multiple places

❌ **Don't use internal skeleton when:**
- Component is page-specific (won't be reused)
- Parent needs full control over skeleton structure
- Skeleton varies significantly based on context
- Form fields (prefer individual v-if per field)

### Complete Example: Timer Component

See [Timer.vue](../src/views/cycle/components/Timer/Timer.vue) and [ProgressBar.vue](../src/views/cycle/components/ProgressBar/ProgressBar.vue) for production implementations of this pattern.

**Key implementation details:**
1. **Props interface**: `loading?: boolean` with default `false`
2. **Template structure**: `template v-if/v-else` at root level
3. **Safe prop values**: Parent passes computed values with fallbacks
4. **Self-contained**: Component handles all skeleton rendering internally

---

## Summary

### Core Principles

1. **Derive state, don't manage it**: `showSkeleton = loading && !hasData`
2. **Use computed fallbacks**: `startDate = computed(() => data?.startDate ?? new Date())`
3. **Fixed container heights**: Use `height`, not `min-height`
4. **Persistent containers**: Containers always exist, content switches
5. **Initial load only**: Show skeletons only when no data exists yet
6. **Match dimensions**: Skeleton should be identical to real component

### Pattern Selection

- **Template v-if/v-else**: Cohesive components (Timer, ProgressBar, Cards)
- **Individual v-if**: Forms with independent fields
- **Child component integration**: Reusable components with internal skeleton

### Benefits

Following these patterns ensures:
- ✅ Zero layout shift
- ✅ Smooth UX during saves/updates
- ✅ No manual state management
- ✅ Type-safe and derived from machine state
- ✅ Consistent across the application
- ✅ Clean templates without repeated ternaries
- ✅ Encapsulated, reusable components