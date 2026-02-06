---
name: vue-props
description: Vue.js props best practices for component design. Use when creating, adding, or implementing a new Vue component, or when defining/refactoring component props.
---

# Vue.js Props Best Practices

Apply these rules when creating or modifying Vue component props. For detailed explanations and examples, see [guide.md](guide.md).

## Core Principles

1. **Props are a public API** — treat them with the same rigor as a REST endpoint
2. **Composition over configuration** — use slots instead of props for configurable UI
3. **Positive booleans with prefixes** — `isActive` not `disabled`, `showHeader` not `hideHeader`
4. **Flat UI props, object data props** — never use opaque `config` objects for visual settings
5. **Validate with types AND runtime** — TypeScript for dev, validators for integrity

## Naming Rules

### Casing

- **Script:** camelCase (`showActionButton`)
- **Template:** kebab-case (`show-action-button`)

### Boolean prefixes

| Prefix   | Semantics             | Examples                             |
| -------- | --------------------- | ------------------------------------ |
| `is`     | State/identity        | `isVisible`, `isLoading`, `isActive` |
| `has`    | Possession/presence   | `hasError`, `hasHeader`              |
| `can`    | Capability/permission | `canEdit`, `canSubmit`               |
| `should` | Conditional behavior  | `shouldValidate`, `shouldAnimate`    |
| `show`   | Element visibility    | `showHeader`, `showActionButton`     |

### By data type

- **String:** descriptive nouns — `title`, `description`, `mode`
- **Number:** count/index suffixes or min/max prefixes — `itemCount`, `maxItems`
- **Array:** PLURAL nouns — `items`, `users`, `periodConfigs`
- **Object:** SINGULAR nouns — `user`, `config`, `completedCycle`

## Boolean Props

```html
<!-- Passing true: use shorthand -->
<MyComponent disabled />
<MyComponent show-action-button />

<!-- Passing false: omit the prop (Vue auto-casts to false) -->
<MyComponent />

<!-- Dynamic value: v-bind -->
<MyComponent :disabled="someCondition" />
```

- Do NOT declare `default: false` — Vue auto-casts absent booleans to `false`
- Do NOT use negative names (`isNotVisible`, `hideFooter`) — always name positively
- Use booleans for 2 states only. For 3+, use an enum: `variant="primary" | "danger" | "secondary"`
- In multi-type props, put Boolean FIRST: `[Boolean, String]` not `[String, Boolean]`

## Typing and Defaults

```vue
<script setup lang="ts">
// Type-based declaration (preferred with TypeScript)
const {
  title,
  isLoading = false,
  maxItems = 10,
  items = () => [],
} = defineProps<{
  title: string;
  isLoading?: boolean;
  maxItems?: number;
  items?: Item[];
}>();
</script>
```

- Use `defineProps<T>()` type-based declaration, not runtime `defineProps({})`
- Use destructuring with defaults (Vue 3.5+) or `withDefaults` (pre-3.5)
- Restrict strings with union types: `mode: 'edit' | 'view' | 'create'`

## Events and v-model

```vue
<!-- Use named v-model when update:propName pattern exists -->
<Timeline v-model:period-configs="periodConfigs" />

<!-- Use specific event names, not generic ones -->
<Timeline @reset="handleReset" />
<!-- Good -->
<Timeline @action="handleReset" />
<!-- Bad: ambiguous -->
```

- Emit in camelCase, listen in kebab-case
- Use `defineModel()` (Vue 3.4+) for two-way bindings
- Keep explicit prop+emit when handler does more than assignment (validation, side effects)

## Slots vs Props

**Replace configuration props with slots** when configuring internal UI elements:

```html
<!-- Bad: 3 props to configure 1 button -->
<Timeline
  :show-action-button="true"
  action-button-icon="reset"
  @action="handleReset"
/>

<!-- Good: inversion of control with slot -->
<Timeline mode="edit" v-model:periods="periodConfigs">
  <template #controls>
    <BaseButton icon="reset" aria-label="Reset" @click="handleReset" />
  </template>
</Timeline>
```

Use slots when:

- Content is complex UI (buttons, icons, components)
- Variations are unlimited or unpredictable
- Consumer needs full control over appearance

Use props when:

- Data is a simple primitive needed for internal logic
- There are 1-2 predefined variations

## Prop Count Limits

- **5-7 props:** comfort zone
- **Above 10:** refactor (split component, use slots, group into objects)

### Warning signs

- Mutually exclusive booleans → convert to enum
- Props configuring internal UI → replace with slots
- Props drilling 3+ levels → use provide/inject
- Component doing too many things → split into subcomponents

## Template Attribute Order

Follow Vue official style guide Priority B:

1. `v-if`, `v-else-if`, `v-show` (conditionals)
2. `ref`, `key` (references)
3. `v-model` (two-way binding)
4. Regular props (attributes)
5. `@events` (listeners)

## JSDoc Documentation

Always document props with JSDoc for IDE tooltips:

```vue
<script setup lang="ts">
interface Props {
  /** Interaction mode: 'edit' allows changes, 'view' is read-only */
  mode: "edit" | "view";
  /** Minimum allowed date for planning. Blocks periods before this date. */
  minDate?: Date;
  /** Last completed cycle, used to calculate progress. */
  completedCycle?: Cycle | null;
}

const props = defineProps<Props>();
</script>
```

## Checklist for New Components

- [ ] Props use camelCase in script, kebab-case in template
- [ ] Boolean props have semantic prefix (`is`, `has`, `can`, `should`, `show`)
- [ ] Boolean props use shorthand in template (no `:prop="true"`)
- [ ] No negative boolean names (no `isNotX`, `hideX`, `noX`)
- [ ] String props with finite values use union types
- [ ] Props declared with `defineProps<T>()` type-based syntax
- [ ] Defaults use destructuring (3.5+) or `withDefaults`
- [ ] `update:propName` patterns use `v-model:prop` where appropriate
- [ ] UI configuration uses slots instead of prop explosion
- [ ] Prop count stays under 7-10
- [ ] Props documented with JSDoc comments
- [ ] Template attributes follow official order (conditionals, refs, v-model, props, events)
