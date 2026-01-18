<template>
  <Dialog
    :visible="visible"
    modal
    :header="dialogTitle"
    :style="{ width: '320px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="period-edit-dialog">
      <div class="period-edit-dialog__start">
        <div class="period-edit-dialog__start-icon">
          <StartTimeIcon />
        </div>
        <div class="period-edit-dialog__start-info">
          <div class="period-edit-dialog__start-label">Start:</div>
          <div class="period-edit-dialog__start-value">{{ formattedStartDate }}</div>
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

    <DateTimePickerDialog
      v-if="showDatePicker"
      :visible="showDatePicker"
      title="Start Date"
      :dateTime="localStartTime"
      @update:visible="showDatePicker = $event"
      @update:dateTime="handleDateUpdate"
    />

    <template #footer>
      <div class="period-edit-dialog__actions">
        <Button
          v-if="!isAddMode"
          icon="pi pi-trash"
          severity="danger"
          variant="text"
          rounded
          aria-label="Delete period"
          @click="handleDelete"
        />
        <div v-else></div>
        <div class="period-edit-dialog__actions-right">
          <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
          <Button label="Save" :disabled="!canSave" @click="handleSave" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import { computed, ref, watch } from 'vue';
import {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
} from '../../constants';

interface Props {
  visible: boolean;
  /** Mode: 'edit' for editing existing period, 'add' for adding new period */
  mode?: 'edit' | 'add';
  periodIndex: number;
  /** The visible period number (counting only non-deleted periods) */
  visiblePeriodNumber: number;
  fastingDuration: number;
  eatingWindow: number;
  startTime: Date;
  /** Minimum allowed start time (end of previous period, or null if first period) */
  minStartTime: Date | null;
  /** Start time of the next period for collision detection (null if last period) */
  nextPeriodStartTime: Date | null;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: { periodIndex: number; fastingDuration: number; eatingWindow: number; startTime: Date }): void;
  (e: 'delete', periodIndex: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localFastingDuration = ref(props.fastingDuration);
const localEatingWindow = ref(props.eatingWindow);
const localStartTime = ref(new Date(props.startTime));
const showDatePicker = ref(false);

const isAddMode = computed(() => props.mode === 'add');
const dialogTitle = computed(() => (isAddMode.value ? 'Add period' : `Period ${props.visiblePeriodNumber}`));

const formattedStartDate = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(localStartTime.value);
});

// Reset local state when dialog opens or props change
watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      localFastingDuration.value = props.fastingDuration;
      localEatingWindow.value = props.eatingWindow;
      localStartTime.value = new Date(props.startTime);
    }
  },
);

watch(
  () => [props.fastingDuration, props.eatingWindow, props.startTime],
  () => {
    if (props.visible) {
      localFastingDuration.value = props.fastingDuration;
      localEatingWindow.value = props.eatingWindow;
      localStartTime.value = new Date(props.startTime);
    }
  },
);

// Calculate max start time dynamically (period end can't exceed next period start)
const maxStartTime = computed<Date | null>(() => {
  if (!props.nextPeriodStartTime) return null;

  const totalDuration = localFastingDuration.value + localEatingWindow.value;
  const maxStart = new Date(props.nextPeriodStartTime);
  maxStart.setHours(maxStart.getHours() - totalDuration);

  return maxStart;
});

// Calculate max expandable hours dynamically based on current local state
const localMaxExpandableHours = computed<number | null>(() => {
  if (!props.nextPeriodStartTime) return null;

  const currentEndTime = new Date(localStartTime.value);
  currentEndTime.setHours(currentEndTime.getHours() + localFastingDuration.value + localEatingWindow.value);

  const gapMs = props.nextPeriodStartTime.getTime() - currentEndTime.getTime();
  const gapHours = gapMs / (1000 * 60 * 60);

  return Math.max(0, gapHours);
});

// Fasting duration constraints
const canDecrementFasting = computed(() => {
  return localFastingDuration.value > MIN_FASTING_DURATION_HOURS;
});

const canIncrementFasting = computed(() => {
  if (localFastingDuration.value >= MAX_FASTING_DURATION_HOURS) return false;
  // Check collision: if we increase by 1, would we exceed the expandable limit?
  if (localMaxExpandableHours.value !== null && localMaxExpandableHours.value < 1) {
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
  if (localMaxExpandableHours.value !== null && localMaxExpandableHours.value < 1) {
    return false;
  }
  return true;
});

const hasChanges = computed(() => {
  return (
    localFastingDuration.value !== props.fastingDuration ||
    localEatingWindow.value !== props.eatingWindow ||
    localStartTime.value.getTime() !== props.startTime.getTime()
  );
});

// In add mode, always allow save. In edit mode, only if there are changes.
const canSave = computed(() => isAddMode.value || hasChanges.value);

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

function handleDateUpdate(newDate: Date) {
  let clampedDate = newDate;

  // Clamp to minStartTime (can't start before previous period ends)
  if (props.minStartTime && clampedDate.getTime() < props.minStartTime.getTime()) {
    clampedDate = new Date(props.minStartTime);
  }

  // Clamp to maxStartTime (can't end after next period starts)
  if (maxStartTime.value && clampedDate.getTime() > maxStartTime.value.getTime()) {
    clampedDate = new Date(maxStartTime.value);
  }

  localStartTime.value = clampedDate;
  showDatePicker.value = false;
}

function handleSave() {
  emit('save', {
    periodIndex: props.periodIndex,
    fastingDuration: localFastingDuration.value,
    eatingWindow: localEatingWindow.value,
    startTime: localStartTime.value,
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
    background: rgba($color-theme-green, 0.1);
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
