<template>
  <form class="physical-info-form" @submit.prevent="onSubmit">
    <h2 class="physical-info-form__title">Physical Information</h2>

    <div class="physical-info-form__fields">
      <template v-if="showSkeleton">
        <Skeleton height="38px" border-radius="6px" />
        <Skeleton height="38px" border-radius="6px" />
        <Skeleton height="38px" border-radius="6px" />
      </template>

      <template v-else>
        <Field name="height" v-slot="{ field, errorMessage }">
          <div class="physical-info-form__field">
            <InputNumber
              :model-value="field.value"
              @update:model-value="field.onChange"
              @blur="field.onBlur"
              :class="{ 'physical-info-form__input--error': errorMessage }"
              placeholder="Height"
              :suffix="heightUnit === 'cm' ? ' cm' : ' ft'"
              :min="0"
              :max="heightUnit === 'cm' ? 300 : 10"
              fluid
            />
            <Message
              v-if="errorMessage"
              class="physical-info-form__error-message"
              severity="error"
              variant="simple"
              size="small"
            >
              {{ errorMessage }}
            </Message>
          </div>
        </Field>

        <Field name="weight" v-slot="{ field, errorMessage }">
          <div class="physical-info-form__field">
            <InputNumber
              :model-value="field.value"
              @update:model-value="field.onChange"
              @blur="field.onBlur"
              :class="{ 'physical-info-form__input--error': errorMessage }"
              placeholder="Weight"
              :suffix="weightUnit === 'kg' ? ' kg' : ' lbs'"
              :min="0"
              :max="weightUnit === 'kg' ? 500 : 1100"
              :min-fraction-digits="1"
              :max-fraction-digits="1"
              fluid
            />
            <Message
              v-if="errorMessage"
              class="physical-info-form__error-message"
              severity="error"
              variant="simple"
              size="small"
            >
              {{ errorMessage }}
            </Message>
          </div>
        </Field>

        <Select
          v-model="gender"
          :options="genderOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Gender"
          fluid
        />

        <div class="physical-info-form__units">
          <div class="physical-info-form__unit-group">
            <span class="physical-info-form__unit-label">Height unit</span>
            <SelectButton
              v-model="heightUnit"
              :options="heightUnitOptions"
              optionLabel="label"
              optionValue="value"
              :allow-empty="false"
            />
          </div>

          <div class="physical-info-form__unit-group">
            <span class="physical-info-form__unit-label">Weight unit</span>
            <SelectButton
              v-model="weightUnit"
              :options="weightUnitOptions"
              optionLabel="label"
              optionValue="value"
              :allow-empty="false"
            />
          </div>
        </div>
      </template>
    </div>

    <Skeleton v-if="showSkeleton" class="physical-info-form__actions" width="130px" height="38px" border-radius="20px" />
    <Button
      v-else
      type="submit"
      class="physical-info-form__actions"
      label="Save changes"
      :loading="saving"
      outlined
      rounded
      :disabled="saving"
    />
  </form>
</template>

<script setup lang="ts">
import type { Gender, HeightUnit, WeightUnit } from '@ketone/shared';
import { Schema } from 'effect';
import { configure, Field, useForm } from 'vee-validate';
import { onMounted, ref, watch } from 'vue';
import { usePhysicalInfo } from '../composables/usePhysicalInfo';
import { usePhysicalInfoNotifications } from '../composables/usePhysicalInfoNotifications';

const { physicalInfo, showSkeleton, saving, loadPhysicalInfo, savePhysicalInfo, actorRef } = usePhysicalInfo();

usePhysicalInfoNotifications(actorRef);

onMounted(() => {
  loadPhysicalInfo();
});

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const HeightSchema = Schema.optional(
  Schema.Number.pipe(
    Schema.filter((h) => h > 0 && h <= 300, { message: () => 'Height must be between 1 and 300' }),
  ),
);

const WeightSchema = Schema.optional(
  Schema.Number.pipe(
    Schema.filter((w) => w > 0 && w <= 500, { message: () => 'Weight must be between 1 and 500' }),
  ),
);

const schemaStruct = Schema.Struct({
  height: HeightSchema,
  weight: WeightSchema,
});

type FormValues = Schema.Schema.Type<typeof schemaStruct>;

const StandardSchemaClass = Schema.standardSchemaV1(schemaStruct);
const validationSchema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit, setFieldValue } = useForm<FormValues>({
  validationSchema,
  initialValues: {
    height: undefined,
    weight: undefined,
  },
});

// Form state for non-validated fields
const gender = ref<Gender | null>(null);
const heightUnit = ref<HeightUnit>('cm');
const weightUnit = ref<WeightUnit>('kg');

const genderOptions = [
  { label: 'Male', value: 'Male' as Gender },
  { label: 'Female', value: 'Female' as Gender },
  { label: 'Prefer not to say', value: 'Prefer not to say' as Gender },
];

const heightUnitOptions = [
  { label: 'cm', value: 'cm' as HeightUnit },
  { label: 'ft', value: 'ft_in' as HeightUnit },
];

const weightUnitOptions = [
  { label: 'kg', value: 'kg' as WeightUnit },
  { label: 'lbs', value: 'lbs' as WeightUnit },
];

watch(
  physicalInfo,
  (newInfo) => {
    if (newInfo) {
      setFieldValue('height', newInfo.height ?? undefined);
      setFieldValue('weight', newInfo.weight ?? undefined);
      gender.value = newInfo.gender;
      heightUnit.value = newInfo.heightUnit ?? 'cm';
      weightUnit.value = newInfo.weightUnit ?? 'kg';
    }
  },
  { immediate: true },
);

const onSubmit = handleSubmit((values) => {
  savePhysicalInfo({
    height: values.height ?? null,
    weight: values.weight ?? null,
    gender: gender.value,
    heightUnit: heightUnit.value,
    weightUnit: weightUnit.value,
  });
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.physical-info-form {
  display: flex;
  flex-direction: column;
  width: 312px;
  padding: 22px;
  border: 1px solid #e9e9e9;
  border-radius: 16px;

  &__title {
    color: $color-primary-button-text;
    font-weight: 700;
    font-size: 18px;
    margin-bottom: 22px;
  }

  &__fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 22px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__input--error {
    border-color: $color-error;
  }

  &__error-message {
    font-size: 12px;
  }

  &__units {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__unit-group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__unit-label {
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__actions {
    align-self: center;
  }
}
</style>
