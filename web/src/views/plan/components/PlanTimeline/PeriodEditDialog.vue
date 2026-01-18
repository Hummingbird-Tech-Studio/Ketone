<template>
  <Dialog
    :visible="visible"
    modal
    :header="`Period ${periodNumber}`"
    :style="{ width: '320px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="period-edit-dialog">
      <div class="period-edit-dialog__control">
        <span class="period-edit-dialog__label">Fast Duration</span>
        <div class="period-edit-dialog__input">
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
          <span class="period-edit-dialog__value">{{ localFastingDuration }}h</span>
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

      <div class="period-edit-dialog__control">
        <span class="period-edit-dialog__label">Eating Window</span>
        <div class="period-edit-dialog__input">
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
          <span class="period-edit-dialog__value">{{ localEatingWindow }}h</span>
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
    </div>

    <template #footer>
      <div class="period-edit-dialog__actions">
        <Button
          icon="pi pi-trash"
          severity="danger"
          variant="text"
          rounded
          aria-label="Delete period"
          @click="handleDelete"
        />
        <div class="period-edit-dialog__actions-right">
          <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
          <Button label="Save" :disabled="!hasChanges" @click="handleSave" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
} from '../../constants';

interface Props {
  visible: boolean;
  periodIndex: number;
  fastingDuration: number;
  eatingWindow: number;
  /** Maximum hours this period can expand before hitting the next period (null if last period) */
  maxExpandableHours: number | null;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: { periodIndex: number; fastingDuration: number; eatingWindow: number }): void;
  (e: 'delete', periodIndex: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localFastingDuration = ref(props.fastingDuration);
const localEatingWindow = ref(props.eatingWindow);

const periodNumber = computed(() => props.periodIndex + 1);

// Reset local state when dialog opens or props change
watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      localFastingDuration.value = props.fastingDuration;
      localEatingWindow.value = props.eatingWindow;
    }
  },
);

watch(
  () => [props.fastingDuration, props.eatingWindow],
  () => {
    if (props.visible) {
      localFastingDuration.value = props.fastingDuration;
      localEatingWindow.value = props.eatingWindow;
    }
  },
);

// Calculate total duration change from original
const durationChange = computed(() => {
  const originalTotal = props.fastingDuration + props.eatingWindow;
  const newTotal = localFastingDuration.value + localEatingWindow.value;
  return newTotal - originalTotal;
});

// Check if incrementing would cause collision with next period
const wouldCauseCollision = computed(() => {
  if (props.maxExpandableHours === null) return false;
  return durationChange.value >= props.maxExpandableHours;
});

// Fasting duration constraints
const canDecrementFasting = computed(() => {
  return localFastingDuration.value > MIN_FASTING_DURATION_HOURS;
});

const canIncrementFasting = computed(() => {
  if (localFastingDuration.value >= MAX_FASTING_DURATION_HOURS) return false;
  // Check collision: if we increase by 1, would we exceed the expandable limit?
  if (props.maxExpandableHours !== null && durationChange.value + 1 > props.maxExpandableHours) {
    return false;
  }
  return true;
});

// Eating window constraints
const canDecrementEating = computed(() => {
  return localEatingWindow.value > MIN_EATING_WINDOW_HOURS;
});

const canIncrementEating = computed(() => {
  if (localEatingWindow.value >= MAX_EATING_WINDOW_HOURS) return false;
  // Check collision: if we increase by 1, would we exceed the expandable limit?
  if (props.maxExpandableHours !== null && durationChange.value + 1 > props.maxExpandableHours) {
    return false;
  }
  return true;
});

const hasChanges = computed(() => {
  return (
    localFastingDuration.value !== props.fastingDuration ||
    localEatingWindow.value !== props.eatingWindow
  );
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

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleCancel() {
  emit('update:visible', false);
}

function handleSave() {
  emit('save', {
    periodIndex: props.periodIndex,
    fastingDuration: localFastingDuration.value,
    eatingWindow: localEatingWindow.value,
  });
}

function handleDelete() {
  emit('delete', props.periodIndex);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.period-edit-dialog {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0;

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
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  &__actions-right {
    display: flex;
    gap: 12px;
  }
}
</style>
