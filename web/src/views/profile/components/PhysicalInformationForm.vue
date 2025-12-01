<template>
  <form class="physical-info-form" @submit.prevent="onSubmit">
    <h2 class="physical-info-form__title">Physical Information</h2>

    <div class="physical-info-form__fields">
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

      <!-- Height Section -->
      <Skeleton v-if="showSkeleton" height="108px" border-radius="8px" />
      <div v-else class="physical-info-form__section">
        <div class="physical-info-form__section__header">
          <div class="physical-info-form__section__header__title">Height</div>
          <div class="physical-info-form__section__header__unit">
            <Select
              :modelValue="heightUnit"
              :options="heightUnitOptions"
              optionLabel="label"
              optionValue="value"
              variant="filled"
              size="small"
              @update:modelValue="onHeightUnitChange"
            />
          </div>
        </div>

        <div class="physical-info-form__section__body">
          <!-- Metric (cm) -->
          <template v-if="heightUnit === UNITS.HEIGHT.CM">
            <InputNumber
              v-model="heightCm"
              inputId="height-cm"
              showButtons
              buttonLayout="horizontal"
              :step="1"
              :min="LIMITS.HEIGHT.CM.MIN"
              :max="LIMITS.HEIGHT.CM.MAX"
              :useGrouping="false"
              :maxFractionDigits="0"
              suffix=" cm"
              fluid
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
                :min="heightFeetMin"
                :max="heightFeetMax"
                :useGrouping="false"
                :maxFractionDigits="0"
                fluid
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
                :min="heightInchesMin"
                :max="heightInchesMax"
                :useGrouping="false"
                :maxFractionDigits="0"
                fluid
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
              :modelValue="weightUnit"
              :options="weightUnitOptions"
              optionLabel="label"
              optionValue="value"
              variant="filled"
              size="small"
              @update:modelValue="onWeightUnitChange"
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
            :min="weightMin"
            :max="weightMax"
            :minFractionDigits="1"
            :maxFractionDigits="1"
            :suffix="weightUnit === UNITS.WEIGHT.KG ? ' kg' : ' lbs'"
            fluid
            :inputProps="{ inputmode: 'decimal' }"
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
    </div>

    <Skeleton
      v-if="showSkeleton"
      class="physical-info-form__actions"
      width="130px"
      height="38px"
      border-radius="20px"
    />
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

// Unit constants
const UNITS = {
  HEIGHT: { CM: 'cm', FT_IN: 'ft_in' },
  WEIGHT: { KG: 'kg', LBS: 'lbs' },
} as const;

const CONVERSION = {
  CM_PER_INCH: 2.54,
  INCHES_PER_FOOT: 12,
  KG_TO_LBS: 2.20462,
  DECIMAL_PRECISION: 10, // Multiply/divide by 10 for 1 decimal place rounding
} as const;

// Validation limits (must match API schema)
// Note: LBS limits are calculated dynamically from KG to ensure consistency
const LIMITS = {
  HEIGHT: {
    CM: { MIN: 120, MAX: 250 },
    FEET: { MIN: 3, MAX: 8 },
    INCHES: { MIN: 0, MAX: 11 },
  },
  WEIGHT: {
    KG: { MIN: 30, MAX: 300 },
  },
} as const;

// Form state
const gender = ref<Gender | null>(null);
const heightUnit = ref<HeightUnit>(UNITS.HEIGHT.CM);
const weightUnit = ref<WeightUnit>(UNITS.WEIGHT.KG);
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
  { label: 'cm', value: UNITS.HEIGHT.CM },
  { label: 'ft/in', value: UNITS.HEIGHT.FT_IN },
];

const weightUnitOptions = [
  { label: 'kg', value: UNITS.WEIGHT.KG },
  { label: 'lbs', value: UNITS.WEIGHT.LBS },
];

// Conversion helpers - Height
function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CONVERSION.CM_PER_INCH;
  let feet = Math.floor(totalInches / CONVERSION.INCHES_PER_FOOT);
  let inches = Math.round(totalInches % CONVERSION.INCHES_PER_FOOT);

  // Handle edge case where rounding produces 12 inches
  if (inches === CONVERSION.INCHES_PER_FOOT) {
    feet += 1;
    inches = 0;
  }

  return { feet, inches };
}

function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * CONVERSION.INCHES_PER_FOOT + inches;
  return Math.round(totalInches * CONVERSION.CM_PER_INCH);
}

// Conversion helpers - Weight
function kgToLbs(kg: number): number {
  return Math.round(kg * CONVERSION.KG_TO_LBS * CONVERSION.DECIMAL_PRECISION) / CONVERSION.DECIMAL_PRECISION;
}

function lbsToKg(lbs: number): number {
  return Math.round((lbs / CONVERSION.KG_TO_LBS) * CONVERSION.DECIMAL_PRECISION) / CONVERSION.DECIMAL_PRECISION;
}

// Precomputed derived limits (calculated once, not on every access)
const MIN_TOTAL_INCHES = Math.ceil(LIMITS.HEIGHT.CM.MIN / CONVERSION.CM_PER_INCH);
const MAX_TOTAL_INCHES = Math.floor(LIMITS.HEIGHT.CM.MAX / CONVERSION.CM_PER_INCH);
const MIN_WEIGHT_LBS = Math.ceil(LIMITS.WEIGHT.KG.MIN * CONVERSION.KG_TO_LBS);
const MAX_WEIGHT_LBS = Math.floor(LIMITS.WEIGHT.KG.MAX * CONVERSION.KG_TO_LBS);

// Dynamic validation limits
const weightMin = computed(() => (weightUnit.value === UNITS.WEIGHT.KG ? LIMITS.WEIGHT.KG.MIN : MIN_WEIGHT_LBS));
const weightMax = computed(() => (weightUnit.value === UNITS.WEIGHT.KG ? LIMITS.WEIGHT.KG.MAX : MAX_WEIGHT_LBS));

// Helper functions to calculate feet/inches limits (avoids computed property cross-references)
function calculateFeetMax(inches: number): number {
  const maxFeet = Math.floor((MAX_TOTAL_INCHES - inches) / CONVERSION.INCHES_PER_FOOT);
  return Math.max(LIMITS.HEIGHT.FEET.MIN, Math.min(maxFeet, LIMITS.HEIGHT.FEET.MAX));
}

function calculateInchesMax(feet: number): number {
  const maxInches = MAX_TOTAL_INCHES - feet * CONVERSION.INCHES_PER_FOOT;
  return Math.max(LIMITS.HEIGHT.INCHES.MIN, Math.min(maxInches, LIMITS.HEIGHT.INCHES.MAX));
}

const heightFeetMin = computed(() => {
  const currentInches = heightInches.value ?? 0;
  const minFeet = Math.ceil((MIN_TOTAL_INCHES - currentInches) / CONVERSION.INCHES_PER_FOOT);
  const clampedMin = Math.max(LIMITS.HEIGHT.FEET.MIN, Math.min(minFeet, LIMITS.HEIGHT.FEET.MAX));
  return Math.min(clampedMin, calculateFeetMax(currentInches));
});

const heightFeetMax = computed(() => calculateFeetMax(heightInches.value ?? 0));

const heightInchesMin = computed(() => {
  const currentFeet = heightFeet.value ?? LIMITS.HEIGHT.FEET.MIN;
  const minInches = MIN_TOTAL_INCHES - currentFeet * CONVERSION.INCHES_PER_FOOT;
  const clampedMin = Math.max(LIMITS.HEIGHT.INCHES.MIN, Math.min(minInches, LIMITS.HEIGHT.INCHES.MAX));
  return Math.min(clampedMin, calculateInchesMax(currentFeet));
});

const heightInchesMax = computed(() => calculateInchesMax(heightFeet.value ?? LIMITS.HEIGHT.FEET.MIN));

// Computed values for saving (backend always stores height in cm, weight in kg)
const heightInCm = computed(() => {
  if (heightUnit.value === UNITS.HEIGHT.CM) {
    return heightCm.value;
  }
  if (heightFeet.value === null && heightInches.value === null) {
    return null;
  }
  // Nullish coalescing needed: user may enter only feet or only inches (partial input allowed)
  return feetInchesToCm(heightFeet.value ?? 0, heightInches.value ?? 0);
});

const weightInKg = computed(() => {
  if (weight.value === null) return null;
  return weightUnit.value === UNITS.WEIGHT.LBS ? lbsToKg(weight.value) : weight.value;
});

// Unit change handlers - convert values when user changes unit
function onHeightUnitChange(newUnit: HeightUnit) {
  const oldUnit = heightUnit.value;
  heightUnit.value = newUnit;

  if (newUnit === UNITS.HEIGHT.FT_IN && oldUnit === UNITS.HEIGHT.CM && heightCm.value !== null) {
    const { feet, inches } = cmToFeetInches(heightCm.value);
    heightFeet.value = feet;
    heightInches.value = inches;
  } else if (newUnit === UNITS.HEIGHT.CM && oldUnit === UNITS.HEIGHT.FT_IN) {
    if (heightFeet.value !== null || heightInches.value !== null) {
      heightCm.value = feetInchesToCm(heightFeet.value ?? 0, heightInches.value ?? 0);
    }
  }
}

function onWeightUnitChange(newUnit: WeightUnit) {
  const oldUnit = weightUnit.value;
  weightUnit.value = newUnit;

  if (weight.value === null) return;

  if (newUnit === UNITS.WEIGHT.LBS && oldUnit === UNITS.WEIGHT.KG) {
    weight.value = kgToLbs(weight.value);
  } else if (newUnit === UNITS.WEIGHT.KG && oldUnit === UNITS.WEIGHT.LBS) {
    weight.value = lbsToKg(weight.value);
  }
}

// Sync form with loaded data
watch(
  physicalInfo,
  (newInfo) => {
    if (!newInfo) return;

    // Height - backend stores in cm, convert to user's preferred unit
    heightUnit.value = newInfo.heightUnit ?? UNITS.HEIGHT.CM;
    if (newInfo.height !== null) {
      if (heightUnit.value === UNITS.HEIGHT.CM) {
        heightCm.value = newInfo.height;
      } else {
        const { feet, inches } = cmToFeetInches(newInfo.height);
        heightFeet.value = feet;
        heightInches.value = inches;
      }
    }

    // Weight - backend stores in kg, convert to user's preferred unit
    weightUnit.value = newInfo.weightUnit ?? UNITS.WEIGHT.KG;
    weight.value =
      newInfo.weight !== null && weightUnit.value === UNITS.WEIGHT.LBS ? kgToLbs(newInfo.weight) : newInfo.weight;

    gender.value = newInfo.gender;
  },
  { immediate: true },
);

// Submit handler
function onSubmit() {
  savePhysicalInfo({
    height: heightInCm.value,
    weight: weightInKg.value,
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
