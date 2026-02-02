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
      <div class="preset-config-dialog__tagline" :class="`preset-config-dialog__tagline--${theme}`">
        {{ preset.tagline }}
      </div>

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
            <span class="preset-config-dialog__value">{{ formatDuration(localFastingDuration) }}</span>
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

        <div class="preset-config-dialog__control">
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
            <span class="preset-config-dialog__value">{{ formatDuration(localEatingWindow) }}</span>
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

        <Message severity="info" icon="pi pi-info-circle" class="preset-config-dialog__info">
          A period is one complete fasting and eating window.
        </Message>
      </div>
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
import { computed, ref, watch } from 'vue';
import {
  DEFAULT_PERIODS_TO_SHOW,
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MAX_PERIODS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
} from '../constants';
import type { Preset, Theme } from '../presets';

export interface PresetInitialConfig {
  fastingDuration: number;
  eatingWindow: number;
  periods: number;
}

interface Props {
  visible: boolean;
  preset: Preset;
  theme: Theme;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', config: PresetInitialConfig): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localFastingDuration = ref(props.preset.fastingDuration);
const localEatingWindow = ref(props.preset.eatingWindow);
const localPeriods = ref(DEFAULT_PERIODS_TO_SHOW);

// Reset local state when dialog opens
watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      localFastingDuration.value = props.preset.fastingDuration;
      localEatingWindow.value = props.preset.eatingWindow;
      localPeriods.value = DEFAULT_PERIODS_TO_SHOW;
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

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function decrementFasting() {
  if (canDecrementFasting.value) {
    localFastingDuration.value -= 0.25;
  }
}

function incrementFasting() {
  if (canIncrementFasting.value) {
    localFastingDuration.value += 0.25;
  }
}

function decrementEating() {
  if (canDecrementEating.value) {
    localEatingWindow.value -= 0.25;
  }
}

function incrementEating() {
  if (canIncrementEating.value) {
    localEatingWindow.value += 0.25;
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
    font-size: 16px;
    font-weight: 500;
    text-align: center;

    &--green {
      color: $color-theme-green;
    }

    &--teal {
      color: $color-theme-teal;
    }

    &--purple {
      color: $color-theme-purple;
    }

    &--pink {
      color: $color-theme-pink;
    }

    &--blue {
      color: $color-theme-blue;
    }
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__info {
    margin-top: 2px;
    :deep(.p-message-text) {
      font-size: 12px;
    }
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

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    width: 100%;
  }
}
</style>
