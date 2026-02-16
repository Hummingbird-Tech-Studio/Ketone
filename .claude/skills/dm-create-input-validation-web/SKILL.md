---
name: dm-create-input-validation-web
description: Create Effect Schema definitions that validate user form input and transform it into domain types. Web equivalent of API request schemas.
model: opus
---

# Create Input Validation (Web)

Creates Effect Schema definitions that validate user form input and transform it into domain types. This is the web equivalent of API request schemas — the "Input Validation" shell in FC/IS.

## Usage

```
/dm-create-input-validation-web <SchemaName> --fields <field1:type1,...> --domain-output <DomainType>
```

## Arguments

- `SchemaName`: The schema name in PascalCase (e.g., `CreatePlanInput`, `UpdatePeriodsInput`)
- `--fields`: Comma-separated raw input field definitions (what comes from the UI)
- `--domain-output`: The domain type this schema produces after validation

## When to Use

Create input validations when:

- A form collects user input that needs domain validation
- Raw UI values (strings, numbers) need to be transformed to branded types
- You want standardized error messages for form fields
- The composable needs to validate before sending to the actor

## File Location

```
web/src/views/{feature}/domain/validations/
├── index.ts                          # Barrel exports
└── {use-case}-input.validation.ts    # Input validation
```

## Complete Input Validation Template

```typescript
// domain/validations/create-{feature}-input.validation.ts
import { Schema as S, Either } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import {
  MIN_FASTING_DURATION,
  MAX_FASTING_DURATION,
  MIN_EATING_WINDOW,
  MAX_EATING_WINDOW,
  type FastingDuration,
  type EatingWindow,
} from '../{feature}.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw form input — all values as UI provides them.
 * No branded types, no domain validation.
 */
export class Create{Feature}RawInput extends S.Class<Create{Feature}RawInput>(
  'Create{Feature}RawInput',
)({
  name: S.String.pipe(
    S.minLength(1, { message: () => 'Name is required' }),
    S.maxLength(100, { message: () => 'Name must be at most 100 characters' }),
  ),
  fastingDuration: S.Number.pipe(
    S.greaterThanOrEqualTo(MIN_FASTING_DURATION, {
      message: () => `Fasting duration must be at least ${MIN_FASTING_DURATION}h`,
    }),
    S.lessThanOrEqualTo(MAX_FASTING_DURATION, {
      message: () => `Fasting duration must be at most ${MAX_FASTING_DURATION}h`,
    }),
  ),
  eatingWindow: S.Number.pipe(
    S.greaterThanOrEqualTo(MIN_EATING_WINDOW, {
      message: () => `Eating window must be at least ${MIN_EATING_WINDOW}h`,
    }),
    S.lessThanOrEqualTo(MAX_EATING_WINDOW, {
      message: () => `Eating window must be at most ${MAX_EATING_WINDOW}h`,
    }),
  ),
  startDate: S.DateFromString, // ISO string from date picker → Date
}) {}

// ============================================
// 2. DOMAIN INPUT TYPE (output after validation)
// ============================================

import { Create{Feature}Input } from '../contracts/create-{feature}.contract';

/**
 * Domain-typed input — derived from contract schema.
 * Uses S.pick/S.omit to derive a sub-schema, then S.Schema.Type for the type.
 * Never use `interface` — always derive from the contract schema.
 */

// Direct alias (DomainInput matches contract 1:1):
export type Create{Feature}DomainInput = S.Schema.Type<typeof Create{Feature}Input>;

// Subset via S.omit — actor enriches with context fields (e.g., planTemplateId):
// const Create{Feature}DomainInputSchema = Create{Feature}Input.pipe(S.omit('planTemplateId'));
// export type Create{Feature}DomainInput = S.Schema.Type<typeof Create{Feature}DomainInputSchema>;

// Subset via S.pick — only specific fields from contract:
// const Create{Feature}DomainInputSchema = Create{Feature}Input.pipe(S.pick('planId'));
// export type Create{Feature}DomainInput = S.Schema.Type<typeof Create{Feature}DomainInputSchema>;

// Complex: omit + transform nested field types:
// const PeriodInputSchema = TemplatePeriodConfig.pipe(S.omit('order'));
// const Create{Feature}DomainInputSchema = S.Struct({
//   ...Create{Feature}Input.pipe(S.omit('planTemplateId', 'periods')).fields,
//   periods: S.Array(PeriodInputSchema),
// });
// export type Create{Feature}DomainInput = S.Schema.Type<typeof Create{Feature}DomainInputSchema>;

// ============================================
// 3. VALIDATION FUNCTION
// ============================================

/**
 * validateCreate{Feature}Input
 *
 * Transforms raw UI input into domain-typed input.
 * Returns Either: Left(ParseError) for validation failures, Right(DomainInput) for success.
 *
 * Invocation: Composable calls this, gets domain types or error record.
 * Only valid DomainInput is sent to actor. Raw input never passes the composable boundary.
 */
export const validateCreate{Feature}Input = (
  raw: unknown,
): Either.Either<Create{Feature}DomainInput, ParseError> =>
  S.decodeUnknownEither(Create{Feature}RawInput)(raw).pipe(
    Either.map(
      (validated): Create{Feature}DomainInput => ({
        name: validated.name,
        fastingDuration: validated.fastingDuration as FastingDuration,
        eatingWindow: validated.eatingWindow as EatingWindow,
        startDate: validated.startDate,
      }),
    ),
  );

// Note: Either.Either<A, E> in Effect — Right = success (A), Left = error (E)
// S.decodeUnknownEither returns Either<A, ParseError> where Right = decoded value

// ============================================
// 4. ERROR EXTRACTION
// ============================================

/**
 * extractSchemaErrors
 *
 * Converts ParseError into a standardized Record<string, string[]> for UI display.
 * Each key is a field name, each value is an array of error messages for that field.
 *
 * Usage in composable:
 *   const result = validateCreate{Feature}Input(rawData);
 *   if (Either.isLeft(result)) {
 *     errors.value = extractSchemaErrors(result.left);
 *   }
 */
export const extractSchemaErrors = (
  error: ParseError,
): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};

  const extractFromIssue = (issue: ParseError['issue']) => {
    if (issue._tag === 'Composite') {
      for (const inner of issue.issues) {
        extractFromIssue(inner);
      }
    } else if (issue._tag === 'Pointer') {
      const fieldName = String(issue.path);
      if (!errors[fieldName]) {
        errors[fieldName] = [];
      }
      extractFromIssue(issue.issue);
    } else if (issue._tag === 'Refinement' || issue._tag === 'Type') {
      // Collect the message
      const msg =
        'message' in issue && typeof issue.message === 'string'
          ? issue.message
          : 'Invalid value';
      // Try to associate with a field if we have context
      const field = '_general';
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(msg);
    }
  };

  extractFromIssue(error.issue);
  return errors;
};
```

## Composable Integration

The composable is the invocation point for input validation:

```typescript
// composables/use{Feature}.ts
import { ref, type Ref } from 'vue';
import { Either } from 'effect';
import {
  validateCreate{Feature}Input,
  extractSchemaErrors,
  type Create{Feature}DomainInput,
} from '../domain';

export function use{Feature}() {
  const actorRef = useActorRef({feature}Machine);
  const errors: Ref<Record<string, string[]>> = ref({});

  // Validate input → send domain-typed data to actor
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

  return {
    errors,
    create{Feature},
    // ... other composable exports
  };
}
```

## Component Usage

```vue
<template>
  <div class="form">
    <InputText v-model="formData.name" :invalid="!!errors.name" />
    <small v-if="errors.name" class="p-error">{{ errors.name[0] }}</small>

    <InputNumber v-model="formData.fastingDuration" :invalid="!!errors.fastingDuration" />
    <small v-if="errors.fastingDuration" class="p-error">
      {{ errors.fastingDuration[0] }}
    </small>

    <Button @click="createFeature(formData)" label="Create" />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useFeature } from '../composables/useFeature';

const { errors, createFeature } = useFeature();

const formData = reactive({
  name: '',
  fastingDuration: 16,
  eatingWindow: 8,
  startDate: new Date().toISOString(),
});
</script>
```

## Input Validation Patterns

### String Fields with Constraints

```typescript
name: S.String.pipe(
  S.minLength(1, { message: () => 'Name is required' }),
  S.maxLength(100, { message: () => 'Name must be at most 100 characters' }),
),
```

### Number Fields with Domain Constants

```typescript
// Always reference named constants — no magic numbers
import { MIN_FASTING_DURATION, MAX_FASTING_DURATION } from '../{feature}.model';

fastingDuration: S.Number.pipe(
  S.greaterThanOrEqualTo(MIN_FASTING_DURATION, {
    message: () => `Must be at least ${MIN_FASTING_DURATION}h`,
  }),
  S.lessThanOrEqualTo(MAX_FASTING_DURATION, {
    message: () => `Must be at most ${MAX_FASTING_DURATION}h`,
  }),
),
```

### Date Fields

```typescript
// From ISO string (date picker output)
startDate: S.DateFromString,

// From Date object (already a Date)
startDate: S.DateFromSelf,
```

### Optional Fields

```typescript
description: S.optional(S.String.pipe(
  S.maxLength(500, { message: () => 'Description must be at most 500 characters' }),
)),
```

### Enum Fields

```typescript
import { PlanStatusSchema } from '../{feature}.model';

status: PlanStatusSchema, // S.Literal('Active', 'Completed', 'Cancelled')
```

### Array Fields

```typescript
periods: S.Array(
  S.Struct({
    fastingDuration: S.Number.pipe(S.greaterThanOrEqualTo(MIN_FASTING_DURATION)),
    eatingWindow: S.Number.pipe(S.greaterThanOrEqualTo(MIN_EATING_WINDOW)),
  }),
).pipe(
  S.minItems(MIN_PERIODS, { message: () => `At least ${MIN_PERIODS} period required` }),
  S.maxItems(MAX_PERIODS, { message: () => `At most ${MAX_PERIODS} periods allowed` }),
),
```

## Validation Flow Summary

```
Component (raw form data)
    ↓
Composable: validateInput(rawData)
    ↓
Schema.decodeUnknownEither(InputSchema)(rawData)
    ↓
Either<ParseError, DomainInput>
    ├── Left: extractSchemaErrors() → Record<string, string[]> → UI errors
    └── Right: actorRef.send({ type: Event.CREATE, input: domainInput })
```

**Key rule**: The actor NEVER receives raw input — only validated domain types from the composable.

## Checklist

- [ ] Raw input schema defined with all form fields
- [ ] Error messages reference named constants (no magic numbers)
- [ ] Domain input type derived from contract schema via S.Schema.Type (direct alias, S.omit, or S.pick — never `interface`)
- [ ] `validateInput()` returns `Either<ParseError, DomainInput>`
- [ ] `extractSchemaErrors()` produces `Record<string, string[]>`
- [ ] Validation file lives in `domain/validations/{use-case}-input.validation.ts`
- [ ] Barrel export in `domain/validations/index.ts`
- [ ] Composable integration documented
- [ ] Actor only receives `DomainInput`, never raw form data
