<template>
  <form class="physical-info-form" @submit.prevent="onSubmit">
    <h2 class="physical-info-form__title">Physical Information</h2>

    <div class="physical-info-form__fields">
      <!-- Height Section -->
      <Skeleton v-if="showSkeleton" height="108px" border-radius="8px" />
      <div v-else class="physical-info-form__section">
        <div class="physical-info-form__section__header">
          <div class="physical-info-form__section__header__title">Height</div>
          <div class="physical-info-form__section__header__unit">
            <Select
              v-model="heightUnit"
              :options="heightUnitOptions"
              optionLabel="label"
              optionValue="value"
              variant="filled"
              size="small"
            />
          </div>
        </div>

        <div class="physical-info-form__section__body">
          <!-- Metric (cm) -->
          <template v-if="heightUnit === 'cm'">
            <InputNumber
              v-model="heightCm"
              inputId="height-cm"
              showButtons
              buttonLayout="horizontal"
              :step="1"
              :min="0"
              :max="300"
              :useGrouping="false"
              :maxFractionDigits="0"
              suffix=" cm"
              fluid
              @keydown="handleNumericKeydown"
              :inputProps="{ inputmode: 'numeric', pattern: '[0-9]*' }"
            >
              <template #incrementicon>
                <span class="pi pi-plus" />
              </template>
              <template #decrementicon>
                <span class="pi pi-minus" />
              </template>
            </InputNumber>
          </template>

          <!-- Imperial (ft/in) -->
          <template v-else>
            <div class="physical-info-form__imperial-row">
              <label class="physical-info-form__imperial-label" for="height-feet">Feet</label>
              <InputNumber
                v-model="heightFeet"
                inputId="height-feet"
                showButtons
                buttonLayout="horizontal"
                :step="1"
                :min="0"
                :max="8"
                :useGrouping="false"
                :maxFractionDigits="0"
                fluid
                @keydown="handleNumericKeydown"
                :inputProps="{ inputmode: 'numeric', pattern: '[0-9]*' }"
              >
                <template #incrementicon>
                  <span class="pi pi-plus" />
                </template>
                <template #decrementicon>
                  <span class="pi pi-minus" />
                </template>
              </InputNumber>
            </div>
            <div class="physical-info-form__imperial-row">
              <label class="physical-info-form__imperial-label" for="height-inches">Inches</label>
              <InputNumber
                v-model="heightInches"
                inputId="height-inches"
                showButtons
                buttonLayout="horizontal"
                :step="1"
                :min="0"
                :max="11"
                :useGrouping="false"
                :maxFractionDigits="0"
                fluid
                @keydown="handleNumericKeydown"
                :inputProps="{ inputmode: 'numeric', pattern: '[0-9]*' }"
              >
                <template #incrementicon>
                  <span class="pi pi-plus" />
                </template>
                <template #decrementicon>
                  <span class="pi pi-minus" />
                </template>
              </InputNumber>
            </div>
          </template>
        </div>
      </div>

      <!-- Weight Section -->
      <Skeleton v-if="showSkeleton" height="108px" border-radius="8px" />
      <div v-else class="physical-info-form__section">
        <div class="physical-info-form__section__header">
          <div class="physical-info-form__section__header__title">Weight</div>
          <div class="physical-info-form__section__header__unit">
            <Select
              v-model="weightUnit"
              :options="weightUnitOptions"
              optionLabel="label"
              optionValue="value"
              variant="filled"
              size="small"
            />
          </div>
        </div>

        <div class="physical-info-form__section__body">
          <InputNumber
            v-model="weight"
            inputId="weight"
            showButtons
            buttonLayout="horizontal"
            mode="decimal"
            :step="0.1"
            :min="0"
            :max="weightUnit === 'kg' ? 500 : 1100"
            :minFractionDigits="1"
            :maxFractionDigits="1"
            :suffix="weightUnit === 'kg' ? ' kg' : ' lbs'"
            fluid
          >
            <template #incrementicon>
              <span class="pi pi-plus" />
            </template>
            <template #decrementicon>
              <span class="pi pi-minus" />
            </template>
          </InputNumber>
        </div>
      </div>

      <!-- Gender Section -->
      <Skeleton v-if="showSkeleton" height="38px" border-radius="6px" />
      <Select
        v-else
        v-model="gender"
        :options="genderOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="Gender"
        fluid
      />
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
import { computed, onMounted, ref, watch } from 'vue';
import { usePhysicalInfo } from '../composables/usePhysicalInfo';
import { usePhysicalInfoNotifications } from '../composables/usePhysicalInfoNotifications';

const { physicalInfo, showSkeleton, saving, loadPhysicalInfo, savePhysicalInfo, actorRef } = usePhysicalInfo();

usePhysicalInfoNotifications(actorRef);

onMounted(() => {
  loadPhysicalInfo();
});

// Form state
const gender = ref<Gender | null>(null);
const heightUnit = ref<HeightUnit>('cm');
const weightUnit = ref<WeightUnit>('kg');
const weight = ref<number | null>(null);

// Height state - stored internally in cm
const heightCm = ref<number | null>(null);
const heightFeet = ref<number | null>(null);
const heightInches = ref<number | null>(null);

// Options
const genderOptions = [
  { label: 'Male', value: 'Male' as Gender },
  { label: 'Female', value: 'Female' as Gender },
  { label: 'Prefer not to say', value: 'Prefer not to say' as Gender },
];

const heightUnitOptions = [
  { label: 'cm', value: 'cm' as HeightUnit },
  { label: 'ft/in', value: 'ft_in' as HeightUnit },
];

const weightUnitOptions = [
  { label: 'kg', value: 'kg' as WeightUnit },
  { label: 'lbs', value: 'lbs' as WeightUnit },
];

// Conversion helpers
function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54);
}

// Computed height in cm for saving
const heightInCm = computed(() => {
  if (heightUnit.value === 'cm') {
    return heightCm.value;
  } else {
    if (heightFeet.value === null && heightInches.value === null) {
      return null;
    }
    return feetInchesToCm(heightFeet.value ?? 0, heightInches.value ?? 0);
  }
});

// Watch for unit changes and convert values
watch(heightUnit, (newUnit, oldUnit) => {
  if (newUnit === 'ft_in' && oldUnit === 'cm' && heightCm.value !== null) {
    const { feet, inches } = cmToFeetInches(heightCm.value);
    heightFeet.value = feet;
    heightInches.value = inches;
  } else if (newUnit === 'cm' && oldUnit === 'ft_in') {
    if (heightFeet.value !== null || heightInches.value !== null) {
      heightCm.value = feetInchesToCm(heightFeet.value ?? 0, heightInches.value ?? 0);
    }
  }
});

// Sync form with loaded data
watch(
  physicalInfo,
  (newInfo) => {
    if (newInfo) {
      // Height is always stored in cm in the backend
      const loadedHeight = newInfo.height;
      const loadedHeightUnit = newInfo.heightUnit ?? 'cm';

      heightUnit.value = loadedHeightUnit;

      if (loadedHeight !== null) {
        if (loadedHeightUnit === 'cm') {
          heightCm.value = loadedHeight;
        } else {
          const { feet, inches } = cmToFeetInches(loadedHeight);
          heightFeet.value = feet;
          heightInches.value = inches;
        }
      }

      weight.value = newInfo.weight;
      weightUnit.value = newInfo.weightUnit ?? 'kg';
      gender.value = newInfo.gender;
    }
  },
  { immediate: true },
);

// Prevent non-numeric input
function handleNumericKeydown(event: KeyboardEvent) {
  const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (allowedKeys.includes(event.key)) return;
  if (event.key >= '0' && event.key <= '9') return;
  event.preventDefault();
}

// Submit handler
function onSubmit() {
  savePhysicalInfo({
    height: heightInCm.value,
    weight: weight.value,
    gender: gender.value,
    heightUnit: heightUnit.value,
    weightUnit: weightUnit.value,
  });
}
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

  &__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: #f9f9f9;
    border-radius: 8px;

    &__header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      &__title {
        font-size: 14px;
        font-weight: 600;
        color: $color-primary-button-text;
      }

      &__unit {
        :deep(.p-select) {
          min-width: 70px;
        }
      }
    }

    &__body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  }

  &__imperial-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__imperial-label {
    font-size: 14px;
    color: $color-primary-button-text;
    min-width: 50px;
  }

  &__actions {
    align-self: center;
  }
}
</style>
