# The Definitive Guide to Props in Vue.js

**Naming, typing, composition, advanced patterns, and ESLint rules**

> Based on official Vue.js documentation, style guides, leading libraries (Vuetify, PrimeVue), eslint-plugin-vue, and architectural analysis of component APIs.

---

## Table of Contents

1. [Philosophy: The Prop as an Interface Contract](#1-philosophy-the-prop-as-an-interface-contract)
2. [Naming Conventions for Props](#2-naming-conventions-for-props)
3. [Passing Booleans as Props](#3-passing-booleans-as-props)
4. [Strings, Enums, and Value Validation](#4-strings-enums-and-value-validation)
5. [Configuration Objects vs Individual Props](#5-configuration-objects-vs-individual-props)
6. [Events, Emits, and the v-model System](#6-events-emits-and-the-v-model-system)
7. [Composition over Configuration: Slots vs Props](#7-composition-over-configuration-slots-vs-props)
8. [Number of Props and When to Refactor](#8-number-of-props-and-when-to-refactor)
9. [Prop Drilling vs Provide/Inject](#9-prop-drilling-vs-provideinject)
10. [Prop Validation and Typing](#10-prop-validation-and-typing)
11. [Living Documentation: JSDoc and TSDoc](#11-living-documentation-jsdoc-and-tsdoc)
12. [Full Analysis of the Timeline Component](#12-full-analysis-of-the-timeline-component)
13. [Attribute Order in Templates](#13-attribute-order-in-templates)
14. [ESLint Rules Checklist](#14-eslint-rules-checklist)
15. [Quick Reference](#15-quick-reference)

---

## 1. Philosophy: The Prop as an Interface Contract

### 1.1 Props as a public API

The **"Props as API"** principle establishes that props should be treated with the same rigor as REST API endpoints or a GraphQL schema. A well-designed component is a **black box** for its consumer; props are the only exposed controls.

If the contract is confusing (ambiguous names, inconsistent types), the internal implementation leaks into the parent component, **violating the encapsulation principle**.

### 1.2 Consistency as operational efficiency

If a loading state is denoted as isLoading in one component, loading in another, and busy in a third, the cognitive load for the developer increases exponentially. Standardizing nomenclature and type handling is not an aesthetic concern — it is a **structural decision** that affects coupling, cohesion, and the team's iteration speed.

### 1.3 Vue's reactivity and its impact

Vue wraps props in **reactive Proxies**, allowing the system to detect granular changes. However, Vue enforces a **strict syntactic distinction** between HTML attributes (kebab-case) and JavaScript properties (camelCase), adding a naming complexity layer that doesn't exist in other frameworks.

---

## 2. Naming Conventions for Props

### 2.1 The casing rule in Vue

The official Vue style guide (Priority B — Strongly Recommended) establishes a fundamental rule: **camelCase in script declarations, kebab-case in templates**. Vue automatically converts between both formats.

Vue operates in two worlds: the <script> block (JavaScript) and the <template> block (HTML). Since HTML attributes are case-insensitive, Vue implements intelligent normalization.

```vue
<!-- Incorrect: kebab-case in declaration -->
<script setup>
defineProps({
  "greeting-message": String, // Don't do this
});
</script>

<!-- Correct: camelCase in declaration -->
<script setup>
defineProps({
  greetingMessage: String,
});
</script>
```

```html
<!-- Not recommended in template (works in SFC but not convention) -->
<MyComponent greetingMessage="hello" />

<!-- Recommended in template -->
<MyComponent greeting-message="hello" />
```

> **ESLint Rule:** vue/prop-name-casing — Enforces camelCase in prop declarations within the script.

### 2.2 Prefixes for boolean props

The industry has converged on a set of interrogative prefixes that transform code reading into an almost grammatical sentence:

| Prefix     | Semantics                | Examples                                      |
| ---------- | ------------------------ | --------------------------------------------- |
| **is**     | State or identity        | isVisible, isLoading, isActive, isOpen        |
| **has**    | Possession or presence   | hasError, hasHeader, hasCancelButton          |
| **can**    | Capability or permission | canEdit, canSubmit, canDelete                 |
| **should** | Conditional behavior     | shouldValidate, shouldAnimate, shouldAutoplay |
| **show**   | Element visibility       | showHeader, showActionButton, showSearch      |

**Why do prefixes matter?** A name like open is problematic: is it a function to open the component (props.open()) or a state (true/false)? Renaming it to isOpen eliminates the ambiguity instantly.

### 2.3 The Positivity Rule (avoid double negation)

There is near-universal consensus on **avoiding negative names** for booleans. Props like disabled are acceptable due to HTML heritage, but constructions like isNotVisible, hideFooter, or noPadding should be avoided.

```vue
<!-- Double negation: What does !isNotVisible mean? -->
<Modal v-if="!isNotVisible" />
<!-- Thought process: "Not is not visible" = "Is visible" — Unnecessary mental step -->

<!-- Positive and direct -->
<Modal v-if="isVisible" />
```

**Rule:** Always name in positive terms. isVisible (default true) is preferable to hide (default false). If you need to hide, pass :is-visible="false", which is explicit and clear.

### 2.4 A note on component libraries

Vuetify, PrimeVue, and Ant Design Vue predominantly use **bare adjectives without prefixes** (disabled, loading, dense, outlined) mimicking native HTML attributes. Use prefixes for **application components** (where clarity is the priority) and consider bare adjectives only if you're building a **public component library**.

### 2.5 Naming by data type

```js
// String: descriptive names without prefix
(title, description, placeholder, label, mode);

// Number: count/index suffixes or max/min prefixes
(itemCount, pageIndex, maxItems, minPlanStartDate);

// Array: PLURAL nouns
(items, users, periodConfigs, activeLocations);

// Object: SINGULAR nouns
(user, config, theme, completedCycle);

// Function/Callback: in Vue, emits are preferred over callback props
// (see section 6 for the full convention)
```

---

## 3. Passing Booleans as Props

### 3.1 Shorthand is the correct form

Both the official Vue documentation and the Airbnb style guide establish that the **shorthand form for passing true is preferred**. Writing :prop="true" is verbose and redundant, inherited from HTML attribute behavior like checked or disabled.

```html
<!-- Avoid: verbose and unnecessary -->
<MyComponent :disabled="true" />
<MyComponent :show-action-button="true" />

<!-- Preferred: shorthand (equivalent to :disabled="true") -->
<MyComponent disabled />
<MyComponent show-action-button />
```

> **ESLint Rule:** vue/prefer-true-attribute-shorthand — Enforces shorthand for boolean values of true.

### 3.2 Passing false

Simply **omitting the prop** equals false when the type is Boolean. Vue auto-casts absent boolean props to false (not undefined):

```html
<!-- false: simply omit the prop -->
<MyComponent />

<!-- Explicit false (only when the value is dynamic) -->
<MyComponent :disabled="false" />
<MyComponent :show-action-button="someCondition" />
```

### 3.3 The multi-type trap

When a prop accepts **multiple types**, the order matters for the shorthand to work:

```js
// String first = SILENT BUG
defineProps({ disabled: [String, Boolean] });
// <Component disabled /> — "" (empty string, NOT true!)

// Boolean first = Correct
defineProps({ disabled: [Boolean, String] });
// <Component disabled /> — true
```

> **ESLint Rule:** vue/prefer-prop-type-boolean-first — Prevents this error automatically.

### 3.4 Defaults for booleans

Boolean props in Vue are automatically cast to false when absent. Declaring default: false is **redundant**:

```vue
<script setup lang="ts">
// No explicit default: Vue auto-casts to false
defineProps<{
  showActionButton?: boolean; // default: false automatic
  isLoading?: boolean; // default: false automatic
}>();

// Only if you need default true (rare but valid):
const { showHeader = true } = defineProps<{
  showHeader?: boolean;
}>();
</script>
```

> **ESLint Rule:** vue/no-boolean-default — Discourages declaring redundant default: false.

### 3.5 Boolean vs Enum: when NOT to use a boolean

The **"Boolean Trap"** occurs when multiple mutually exclusive booleans create impossible states. The practical rule: use a boolean when there are **2 states** (on/off); use an enum when there are **3 or more**.

```html
<!-- Boolean Trap: What happens if both are true? -->
<button primary danger />

<!-- Enum: mutually exclusive states -->
<button variant="primary" />
<button variant="danger" />
<button variant="secondary" />
```

**Appropriate for boolean:** disabled, open, loading, checked.
**Require enum:** size="sm" | "md" | "lg", variant="primary" | "danger", mode="edit" | "view".

---

## 4. Strings, Enums, and Value Validation

### 4.1 The danger of "magic strings"

Passing unrestricted string literals scattered throughout the code is dangerous. A typo like mode="editt" would go unnoticed with a generic String type.

### 4.2 Union Types with TypeScript

```vue
<script setup lang="ts">
defineProps<{
  mode: "edit" | "view" | "create";
  size: "sm" | "md" | "lg";
  variant: "primary" | "secondary" | "danger";
}>();
</script>
```

TypeScript will catch errors like mode="editt" at compile time.

### 4.3 Runtime validators (for non-TypeScript contexts)

Vue offers a unique advantage with **runtime prop validators**. This is crucial when the component is used in contexts where TypeScript isn't present (micro-frontends, direct HTML injection, public libraries):

```js
defineProps({
  mode: {
    type: String,
    required: true,
    validator: (value) => ["edit", "view", "create"].includes(value),
  },
  size: {
    type: String,
    default: "md",
    validator: (value) => ["sm", "md", "lg"].includes(value),
  },
});
```

> **Recommendation:** Combine TypeScript for development-time safety **and** runtime validators for data integrity, especially if your component can be consumed outside your project.

---

## 5. Configuration Objects vs Individual Props

### 5.1 The granularity dilemma

The decision between flat props (fine granularity) and configuration objects (coarse granularity) depends on the **semantic cohesion** of the data:

#### Flat props (recommended for UI configuration)

```html
<!-- Each prop is documentable, validatable, and explicit -->
<UserCard name="Alice" :age="25" email="alice@example.com" />
```

**Advantages:** explicit documentation, strict per-field validation, independence from domain models.

#### Configuration objects (appropriate for data collections)

```html
<!-- Correct for complex collections -->
<Timeline :period-configs="configs" />
<Grid :data="gridData" :options="gridOptions" />
```

**Appropriate when:** the data represents a collection (array) or a complete domain model that would be absurd to flatten (period1-start, period1-end, period2-start... doesn't make sense).

### 5.2 Anti-pattern: config objects for UI

```html
<!-- Opaque: what keys does options have? -->
<Timeline :options="{ showButton: true, icon: 'reset', mode: 'edit' }" />

<!-- Explicit: each prop is self-documenting -->
<Timeline show-button icon="reset" mode="edit" />
```

A prop called config or options is a **black box** that forces the developer to read the source code to know which keys are required.

### 5.3 v-bind without argument (object spread)

Vue offers an elegant syntax for passing all object properties as individual props:

```vue
<script setup>
const post = { id: 1, title: "My Journey with Vue" };
</script>
<template>
  <!-- Equivalent to :id="post.id" :title="post.title" -->
  <BlogPost v-bind="post" />
</template>
```

### 5.4 Practical decision guide

| Scenario                              | Approach           | Reason                   |
| ------------------------------------- | ------------------ | ------------------------ |
| Collection data (array)               | Object/array prop  | Not practical to flatten |
| Complete domain model                 | Object prop        | Belongs together         |
| Visual component configuration        | Flat props         | Explicit documentation   |
| 6+ related sub-element props          | Object or **slot** | Avoid prop explosion     |
| Props the consumer frequently adjusts | Individual props   | Better ergonomics        |

> **Rule of thumb:** If the number of flat props exceeds 7-10, it's a **code smell** indicating the component does too much and should be split into subcomponents or use slots.

---

## 6. Events, Emits, and the v-model System

### 6.1 defineEmits and naming conventions

Vue 3 uses defineEmits to declare events. The convention is: **emit in camelCase, listen in kebab-case** in the template:

```vue
<!-- Child: emit in camelCase -->
<script setup>
const emit = defineEmits(["updateUser", "submit"]);
emit("updateUser", newData);
</script>

<!-- Parent: listen in kebab-case -->
<MyComponent @update-user="handleUserUpdate" @submit="handleSubmit" />
```

### 6.2 Specificity in event names

Generic names like @action are dangerous. If the component evolves and has two possible actions (save and cancel), @action becomes ambiguous:

```html
<!-- Generic: what "action"? -->
<Timeline @action="handleReset" />

<!-- Specific: clear intent -->
<Timeline @reset="handleReset" />
<Timeline @save="handleSave" />

<!-- Or generic with descriptive payload (if multiple actions exist) -->
<Timeline @action="handleAction" />
<!-- where handleAction receives { type: 'reset' } -->
```

### 6.3 The update:propName pattern and v-model

The update:propName pattern is the foundation of the v-model system in custom components. Vue 3.4+ introduces defineModel as the simplified form:

```html
<!-- Before: manual two-way binding (verbose) -->
<Timeline
  :period-configs="periodConfigs"
  @update:period-configs="handlePeriodConfigsUpdate"
/>

<!-- After: named v-model (declarative) -->
<Timeline v-model:period-configs="periodConfigs" />
```

This immediately communicates that the component has **read and write** capability over that data structure.

### 6.4 defineModel in the child component

```vue
<script setup>
// Vue 3.4+ — the cleanest form
const periodConfigs = defineModel("periodConfigs");

// Equivalent to the manual pattern:
// const props = defineProps(['periodConfigs'])
// const emit = defineEmits(['update:periodConfigs'])
</script>

<template>
  <!-- periodConfigs is writable: can be used directly -->
  <input v-model="periodConfigs" />
</template>
```

### 6.5 Multiple v-models

Vue 3 supports multiple named v-models on a single component:

```html
<!-- Parent -->
<UserName v-model:first-name="first" v-model:last-name="last" />

<!-- Child -->
<script setup>
  const firstName = defineModel("firstName");
  const lastName = defineModel("lastName");
</script>
```

### 6.6 Typing emits with TypeScript

```vue
<script setup lang="ts">
const emit = defineEmits<{
  "update:periodConfigs": [configs: PeriodConfig[]];
  reset: [];
  save: [data: SavePayload];
}>();

// With typed defineModel:
const model = defineModel<PeriodConfig[]>("periodConfigs");
</script>
```

### 6.7 When NOT to use v-model

If the @update:prop handler does something more than simply assigning the value (validation, transformation, side effects, logging), keeping the explicit prop + emit form is justifiable. v-model implies direct synchronization.

---

## 7. Composition over Configuration: Slots vs Props

### 7.1 The problem: "prop explosion"

When a component configures internal UI elements via props, it creates a fragile pattern:

```html
<!-- "Configuration Props" — fragile and limited -->
<Timeline
  :show-action-button="true"
  action-button-icon="reset"
  @action="handleReset"
/>
```

**What happens when you need to change the button text? Or its color? Or add a tooltip?** You'd have to add more props (action-button-text, action-button-color, action-button-tooltip...), resulting in an unsustainable **prop explosion**.

### 7.2 The solution: Inversion of Control with Slots

Instead of telling the component _how to configure_ the button, we pass the button _already configured_:

```html
<!-- Inversion of Control with named slots -->
<Timeline
  mode="edit"
  v-model:periods="periodConfigs"
  :completed-cycle="lastCompletedCycle"
  :min-date="minPlanStartDate"
>
  <template #controls>
    <BaseButton
      variant="icon"
      icon="reset"
      aria-label="Reset Cycle"
      @click="handleReset"
    />
  </template>
</Timeline>
```

**Result:** we eliminate 3 attributes (show-action-button, action-button-icon, @action). The Timeline component becomes **agnostic** about which button is rendered.

### 7.3 Advantages of the slot pattern

| Aspect                 | Configuration props           | Slots                         |
| ---------------------- | ----------------------------- | ----------------------------- |
| Flexibility            | Limited to defined props      | Infinite — pass any component |
| Conditional visibility | Requires boolean prop (showX) | Slot presence = visible       |
| Customization          | New prop for each variation   | Parent controls everything    |
| Timeline maintenance   | Must evolve for each new case | Stable — doesn't change       |
| Accessibility          | Hard to add custom aria-label | Natural — parent defines it   |

### 7.4 Implementation in the child component

```vue
<!-- Timeline.vue -->
<template>
  <div class="timeline">
    <!-- Main content -->
    <div class="timeline-body">...</div>

    <!-- The slot replaces the need for configuration props -->
    <div v-if="$slots.controls" class="timeline-controls">
      <slot name="controls" />
    </div>
  </div>
</template>
```

Button visibility now depends on the **existence of content in the slot**, eliminating the need for a show-action-button boolean.

### 7.5 Scoped Slots for contextual data

If the slot needs data from the child, use scoped slots:

```html
<!-- Parent: receives data from Timeline -->
<Timeline v-model:periods="configs">
  <template #controls="{ canReset, currentPeriod }">
    <BaseButton :disabled="!canReset" @click="handleReset(currentPeriod)">
      Reset {{ currentPeriod.name }}
    </BaseButton>
  </template>
</Timeline>
```

### 7.6 When to use slots vs props

| Use **props** when...                                    | Use **slots** when...                                  |
| -------------------------------------------------------- | ------------------------------------------------------ |
| The data is a simple primitive (string, number, boolean) | The content is complex UI (buttons, icons, components) |
| The component needs the data for its internal logic      | It only affects visual presentation                    |
| There are 1-2 predefined variations                      | Variations are unlimited or unpredictable              |
| The consumer doesn't need visual customization           | The consumer needs full control over appearance        |

---

## 8. Number of Props and When to Refactor

### 8.1 Recommended limits

**5-7 props** is the comfort zone. **Above 10**, it's almost certain the component needs refactoring.

### 8.2 Warning signs (code smells)

1. **Incompatible props:** props that shouldn't coexist (e.g., isPhoneInput + autoCapitalize)
2. **Sub-element props:** props that configure entire sections of the component
3. **Mutually exclusive booleans:** multiple flags representing variants
4. **Complex conditional logic:** excessive v-if/else based on prop combinations
5. **Visual prop explosion:** showX, hideY, iconX, labelY growing without control

### 8.3 Solutions by complexity level

| Problem                              | Solution                          |
| ------------------------------------ | --------------------------------- |
| 7-10 related props                   | Group into a configuration object |
| Props that configure internal UI     | Replace with **named slots**      |
| Mutually exclusive props             | Convert to an **enum**            |
| Props that drill through many levels | Use **provide/inject**            |
| Component that does too many things  | **Split** into subcomponents      |

---

## 9. Prop Drilling vs Provide/Inject

### 9.1 When to use each approach

| Use **props**                            | Use **provide/inject**            | Use **Pinia**                 |
| ---------------------------------------- | --------------------------------- | ----------------------------- |
| Data specific to that instance           | Ambient/cross-cutting data        | Complex global state          |
| periodConfigs is unique to this Timeline | Theme, locale, authenticated user | Shopping cart, notifications  |
| 1-2 levels deep                          | 3+ levels deep                    | Multiple unrelated components |

### 9.2 Provide/inject implementation

```vue
<!-- Ancestor -->
<script setup>
import { provide, ref } from "vue";
const theme = ref("dark");
provide("theme", theme); // Reactive if ref/reactive
</script>

<!-- Deep descendant (any level) -->
<script setup>
import { inject } from "vue";
const theme = inject("theme"); // Gets the reactive ref
</script>
```

### 9.3 Symbols as keys (large applications)

The official documentation recommends using **Symbols as injection keys** in large applications to avoid name collisions:

```ts
// keys.ts
export const THEME_KEY = Symbol("theme") as InjectionKey<Ref<"light" | "dark">>;

// Provider
provide(THEME_KEY, theme);

// Consumer
const theme = inject(THEME_KEY); // Automatic typing
```

> **Rule:** Avoid contaminating component props with data that doesn't belong to it directly (like userLanguage or apiEndpoint). Inject them via provide/inject or Pinia.

---

## 10. Prop Validation and Typing

### 10.1 defineProps with TypeScript (preferred approach)

Vue 3 offers two ways to declare props: **runtime** and **type-based**. The documentation recommends type-based with TypeScript:

```vue
<script setup lang="ts">
// Type-based (preferred with TypeScript)
defineProps<{
  title: string;
  items?: Item[];
  isLoading?: boolean;
  maxItems?: number;
}>();
</script>
```

Vue automatically compiles type annotations into equivalent runtime declarations: defineProps<{ msg: string }> compiles to { msg: { type: String, required: true } }.

### 10.2 Defaults with Vue 3.5+ (Reactive Props Destructure)

```vue
<script setup lang="ts">
const {
  title,
  isLoading = false,
  maxItems = 10,
  items = () => [], // factory for objects/arrays
} = defineProps<{
  title: string;
  isLoading?: boolean;
  maxItems?: number;
  items?: Item[];
}>();
</script>
```

### 10.3 Alternative with withDefaults (pre-3.5)

```vue
<script setup lang="ts">
interface Props {
  title: string;
  isLoading?: boolean;
  maxItems?: number;
  items?: Item[];
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxItems: 10,
  items: () => [],
});
</script>
```

### 10.4 Combined strategy (maximum safety)

| Layer          | Tool                          | Timing       | Coverage           |
| -------------- | ----------------------------- | ------------ | ------------------ |
| Static         | TypeScript + defineProps<T>() | Compile time | 100% of TS code    |
| Runtime (dev)  | Prop validators               | Execution    | Dynamic data, APIs |
| Runtime (prod) | Critical validators           | Execution    | User inputs        |

> **ESLint Rule:** vue/define-props-declaration — Enforces type-based declaration when using TypeScript.

---

## 11. Living Documentation: JSDoc and TSDoc

### 11.1 Self-documenting props

Props should be commented using standards like JSDoc or TSDoc. This allows IDEs to show **hover tooltips** when the developer is using the component:

```vue
<script setup lang="ts">
interface TimelineProps {
  /**
   * Defines the interaction state of the timeline.
   * - 'edit': allows changes to periods
   * - 'view': read-only, no interaction
   * - 'create': new plan creation mode
   */
  mode: "edit" | "view" | "create";

  /**
   * The minimum allowed date for planning.
   * Blocks periods before this date.
   * @example new Date('2025-01-01')
   */
  minDate: Date;

  /**
   * Last completed cycle. Used to calculate
   * progress and disable closed periods.
   * @default null (no completed cycle)
   */
  completedCycle?: Cycle | null;
}

const props = defineProps<TimelineProps>();
</script>
```

---

## 12. Full Analysis of the Timeline Component

### 12.1 Original code

```html
<Timeline
  mode="edit"
  :period-configs="periodConfigs"
  :completed-cycle="lastCompletedCycle"
  :min-plan-start-date="minPlanStartDate"
  :show-action-button="true"
  action-button-icon="reset"
  @update:period-configs="handlePeriodConfigsUpdate"
  @action="handleReset"
/>
```

### 12.2 Full diagnosis

| Finding                       | Diagnosis                                                                            | Severity                 |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| :show-action-button="true"    | Unnecessary verbosity. Shorthand is the standard.                                    | Low (Style)              |
| action-button-icon="reset"    | Coupling. Assumes a string-based icon system. Limits customization.                  | Medium (Architecture)    |
| @action                       | Ambiguity. Name too generic. Makes data flow hard to read.                           | Medium (Maintainability) |
| :min-plan-start-date          | Verbose naming. The "plan" prefix could be redundant if context is already planning. | Low (Style)              |
| :period-configs + @update:... | Verbose syntax. Doesn't leverage v-model for bidirectional binding.                  | Low (DX)                 |
| show-_ + _-icon + @action     | 3 props/events to configure 1 button. Ideal candidate for a **slot**.                | Medium (Architecture)    |

### 12.3 What's already correct

- **Kebab-case in template** — period-configs, min-plan-start-date, completed-cycle
- **mode as enum** — mode="edit" is better than :is-editing="true" if there are more than two modes
- **update:propName pattern** — follows official Vue pattern (candidate for v-model)
- **Multiline formatting** — one attribute per line follows Priority B

### 12.4 Progressive refactoring

#### Level 1: Quick fixes (no changes to child component)

```html
<Timeline
  mode="edit"
  v-model:period-configs="periodConfigs"
  :completed-cycle="lastCompletedCycle"
  :min-plan-start-date="minPlanStartDate"
  action-button-icon="reset"
  @action="handleReset"
/>
```

#### Level 2: Name simplification

```html
<Timeline
  mode="edit"
  v-model:periods="periodConfigs"
  :completed-cycle="lastCompletedCycle"
  :min-date="minPlanStartDate"
  action-button-icon="reset"
  @reset="handleReset"
/>
```

#### Level 3: Inversion of control with slots (architectural refactoring)

```html
<Timeline
  mode="edit"
  v-model:periods="periodConfigs"
  :min-date="minPlanStartDate"
  :completed-cycle="lastCompletedCycle"
>
  <template #controls>
    <BaseButton
      variant="icon"
      icon="reset"
      aria-label="Reset Cycle"
      @click="handleReset"
    />
  </template>
</Timeline>
```

---

## 13. Attribute Order in Templates

The official Vue style guide (Priority B) recommends a specific order:

| Order | Type                  | Example                 |
| ----- | --------------------- | ----------------------- |
| 1     | Definition directives | is, v-is                |
| 2     | List rendering        | v-for                   |
| 3     | **Conditionals**      | v-if, v-else-if, v-show |
| 4     | Render modifiers      | v-pre, v-once           |
| 5     | Reference             | ref, key                |
| 6     | **Two-way binding**   | v-model                 |
| 7     | **Other attributes**  | regular props           |
| 8     | **Events**            | @click, @update         |
| 9     | Content               | v-html, v-text          |

> **ESLint Rule:** vue/attributes-order — Automatically enforces the official attribute order.

---

## 14. ESLint Rules Checklist

All rules come from **eslint-plugin-vue**:

| Rule                                | What it does                            | Priority      |
| ----------------------------------- | --------------------------------------- | ------------- |
| vue/prop-name-casing                | Enforces camelCase in prop declarations | Essential     |
| vue/require-prop-types              | Requires type declarations on all props | Essential     |
| vue/prefer-true-attribute-shorthand | Shorthand for boolean true              | Recommended   |
| vue/no-boolean-default              | Prevents redundant default: false       | Recommended   |
| vue/prefer-prop-type-boolean-first  | Boolean first in mixed types            | Recommended   |
| vue/max-props                       | Limits number of props per component    | Configurable  |
| vue/define-props-declaration        | Enforces type-based with TS             | Recommended   |
| vue/attributes-order                | Official attribute order                | Strongly Rec. |
| vue/max-attributes-per-line         | One attribute per line in multiline     | Strongly Rec. |

### Example configuration

```js
// eslint.config.js or .eslintrc.js
rules: {
  'vue/prop-name-casing': ['error', 'camelCase'],
  'vue/require-prop-types': 'error',
  'vue/prefer-true-attribute-shorthand': 'warn',
  'vue/no-boolean-default': ['warn', 'no-default'],
  'vue/prefer-prop-type-boolean-first': 'warn',
  'vue/max-props': ['warn', { maxProps: 7 }],
  'vue/define-props-declaration': ['error', 'type-based'],
  'vue/attributes-order': 'warn',
  'vue/max-attributes-per-line': ['warn', {
    singleline: { max: 3 },
    multiline: { max: 1 }
  }]
}
```

---

## 15. Quick Reference

| Topic              | Rule                      | Example                        |
| ------------------ | ------------------------- | ------------------------------ |
| Script casing      | camelCase                 | showActionButton: Boolean      |
| Template casing    | kebab-case                | show-action-button             |
| Boolean true       | Shorthand                 | `<C disabled />`               |
| Boolean false      | Omit prop                 | `<C />`                        |
| Dynamic boolean    | v-bind                    | `:disabled="isOff"`            |
| Two-way binding    | Named v-model             | `v-model:items="items"`        |
| Custom event       | kebab-case                | `@update-user="handler"`       |
| Multi-type         | Boolean first             | `[Boolean, String]`            |
| Boolean default    | Don't declare false       | Vue auto-casts to false        |
| Max props          | 5-7 recommended           | Refactor above 10              |
| Typing             | Type-based                | `defineProps<{...}>()`         |
| Configurable UI    | Slots                     | `<template #controls>`         |
| Cross-cutting data | provide/inject            | Don't pollute props            |
| Restricted strings | Union types + validators  | `'edit' \| 'view' \| 'create'` |
| Documentation      | JSDoc/TSDoc on interfaces | Automatic IDE tooltips         |
