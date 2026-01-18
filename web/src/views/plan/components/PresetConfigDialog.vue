<template>
  <Dialog
    :visible="visible"
    modal
    :header="preset.ratio"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="preset-config-dialog">
      <div class="preset-config-dialog__tagline">{{ preset.tagline }}</div>

      <div class="preset-config-dialog__controls">
        <div class="preset-config-dialog__control">
          <span class="preset-config-dialog__label">Fast Duration</span>
          <div class="preset-config-dialog__input">
            <Button
              type="button"
              icon="pi pi-minus"
              rounded
              outlined
              severity="secondary"
              size="small"
              aria-label="Decrease fasting duration"
              :disabled="!canDecrementFasting"
              @click="decrementFasting"
            />
            <span class="preset-config-dialog__value">{{ localFastingDuration }}h</span>
            <Button
              type="button"
              icon="pi pi-plus"
              rounded
              outlined
              severity="secondary"
              size="small"
              aria-label="Increase fasting duration"
              :disabled="!canIncrementFasting"
              @click="incrementFasting"
            />
          </div>
        </div>

        <div v-if="showEatingWindow" class="preset-config-dialog__control">
          <span class="preset-config-dialog__label">Eating Window</span>
          <div class="preset-config-dialog__input">
            <Button
              type="button"
              icon="pi pi-minus"
              rounded
              outlined
              severity="secondary"
              size="small"
              aria-label="Decrease eating window"
              :disabled="!canDecrementEating"
              @click="decrementEating"
            />
            <span class="preset-config-dialog__value">{{ localEatingWindow }}h</span>
            <Button
              type="button"
              icon="pi pi-plus"
              rounded
              outlined
              severity="secondary"
              size="small"
              aria-label="Increase eating window"
              :disabled="!canIncrementEating"
              @click="incrementEating"
            />
          </div>
        </div>

        <div class="preset-config-dialog__control">
          <span class="preset-config-dialog__label">Number of Periods</span>
          <div class="preset-config-dialog__input">
            <Button
              type="button"
              icon="pi pi-minus"
              rounded
              outlined
              severity="secondary"
              size="small"
              aria-label="Decrease number of periods"
              :disabled="!canDecrementPeriods"
              @click="decrementPeriods"
            />
            <span class="preset-config-dialog__value">{{ localPeriods }}</span>
            <Button
              type="button"
              icon="pi pi-plus"
              rounded
              outlined
              severity="secondary"
              size="small"
              aria-label="Increase number of periods"
              :disabled="!canIncrementPeriods"
              @click="incrementPeriods"
            />
          </div>
        </div>
      </div>

      <div class="preset-config-dialog__start">
        <div class="preset-config-dialog__start-icon">
          <StartTimeIcon />
        </div>
        <div class="preset-config-dialog__start-info">
          <div class="preset-config-dialog__start-label">Start:</div>
          <div class="preset-config-dialog__start-value">{{ formattedStartDate }}</div>
        </div>
        <Button
          type="button"
          icon="pi pi-pencil"
          rounded
          variant="outlined"
          severity="secondary"
          aria-label="Edit Start Date"
          @click="showDatePicker = true"
        />
      </div>

      <DateTimePickerDialog
        v-if="showDatePicker"
        :visible="showDatePicker"
        title="Start Date"
        :dateTime="localStartDate"
        @update:visible="showDatePicker = $event"
        @update:dateTime="handleDateUpdate"
      />
    </div>

    <template #footer>
      <div class="preset-config-dialog__actions">
        <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
        <Button label="Confirm" @click="handleConfirm" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import { computed, ref, watch } from 'vue';
import {
  DEFAULT_PERIODS_TO_SHOW,
  DEFAULT_START_OFFSET_MINUTES,
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MAX_PERIODS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
} from '../constants';
import type { Preset } from '../presets';

export interface PresetInitialConfig {
  fastingDuration: number;
  eatingWindow: number;
  periods: number;
  startDate: string;
}

interface Props {
  visible: boolean;
  preset: Preset;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', config: PresetInitialConfig): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const getDefaultStartDate = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + DEFAULT_START_OFFSET_MINUTES);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
};

const localFastingDuration = ref(props.preset.fastingDuration);
const localEatingWindow = ref(props.preset.eatingWindow);
const localPeriods = ref(DEFAULT_PERIODS_TO_SHOW);
const localStartDate = ref(getDefaultStartDate());
const showDatePicker = ref(false);

// For Long Fasts (eatingWindow === 0), hide the eating window control
const showEatingWindow = computed(() => props.preset.eatingWindow > 0);

// Reset local state when dialog opens
watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      localFastingDuration.value = props.preset.fastingDuration;
      localEatingWindow.value = props.preset.eatingWindow;
      localPeriods.value = DEFAULT_PERIODS_TO_SHOW;
      localStartDate.value = getDefaultStartDate();
    }
  },
);

// Fasting duration constraints
const canDecrementFasting = computed(() => {
  return localFastingDuration.value > MIN_FASTING_DURATION_HOURS;
});

const canIncrementFasting = computed(() => {
  return localFastingDuration.value < MAX_FASTING_DURATION_HOURS;
});

// Eating window constraints
const canDecrementEating = computed(() => {
  return localEatingWindow.value > MIN_EATING_WINDOW_HOURS;
});

const canIncrementEating = computed(() => {
  return localEatingWindow.value < MAX_EATING_WINDOW_HOURS;
});

// Periods constraints
const canDecrementPeriods = computed(() => {
  return localPeriods.value > MIN_PERIODS;
});

const canIncrementPeriods = computed(() => {
  return localPeriods.value < MAX_PERIODS;
});

const formattedStartDate = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(localStartDate.value);
});

function decrementFasting() {
  if (canDecrementFasting.value) {
    localFastingDuration.value--;
  }
}

function incrementFasting() {
  if (canIncrementFasting.value) {
    localFastingDuration.value++;
  }
}

function decrementEating() {
  if (canDecrementEating.value) {
    localEatingWindow.value--;
  }
}

function incrementEating() {
  if (canIncrementEating.value) {
    localEatingWindow.value++;
  }
}

function decrementPeriods() {
  if (canDecrementPeriods.value) {
    localPeriods.value--;
  }
}

function incrementPeriods() {
  if (canIncrementPeriods.value) {
    localPeriods.value++;
  }
}

function handleDateUpdate(newDate: Date) {
  localStartDate.value = newDate;
  showDatePicker.value = false;
}

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleCancel() {
  emit('update:visible', false);
}

function handleConfirm() {
  emit('confirm', {
    fastingDuration: localFastingDuration.value,
    eatingWindow: localEatingWindow.value,
    periods: localPeriods.value,
    startDate: localStartDate.value.toISOString(),
  });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.preset-config-dialog {
  display: flex;
  flex-direction: column;
  gap: 20px;

  &__tagline {
    font-size: 14px;
    color: $color-primary-light-text;
    text-align: center;
    margin-top: -8px;
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__control {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__label {
    font-size: 14px;
    font-weight: 500;
    color: $color-primary-button-text;
  }

  &__input {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__value {
    min-width: 40px;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    color: $color-primary-button-text;
  }

  &__start {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba($color-primary-button-outline, 0.3);
    border-radius: 8px;
  }

  &__start-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(45, 179, 94, 0.1);
    border-radius: 8px;
    flex-shrink: 0;
  }

  &__start-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__start-label {
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__start-value {
    font-weight: 400;
    font-size: 13px;
    color: $color-primary-button-text;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    width: 100%;
  }
}
</style>
