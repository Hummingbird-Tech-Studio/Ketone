<template>
  <div class="scheduler">
    <div class="scheduler__header">
      <div class="scheduler__title" data-test-name="Cycle.Scheduler.title">
        {{ view.name }}
      </div>
      <Button
        type="button"
        icon="pi pi-calendar"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="End Date"
        :disabled="disabled"
        @click="handleClick"
      />
      <Dialog
        v-model:visible="open"
        modal
        :header="view.name"
        :style="{ width: `${CALENDAR_DIALOG_WIDTH}px` }"
        :draggable="false"
        @hide="handleCloseDialog"
      >
        <DatePicker
          :modelValue="localDate"
          @update:modelValue="handleDateChange"
          inline
          showButtonBar
          placeholder="Basic"
        >
          <template #buttonbar>
            <div class="scheduler__buttonbar">
              <div class="scheduler__time">
                <button class="scheduler__time-display" aria-label="Set time" @click="openTimePickerDialog">
                  <span class="scheduler__time-value"> {{ hours }}:{{ minutes }} {{ meridian }} </span>
                  <span class="scheduler__time-edit-hint">Click to edit</span>
                </button>
              </div>
              <Divider class="scheduler__divider" />
              <div class="scheduler__actions">
                <Button class="scheduler__button" size="small" label="Now" variant="outlined" @click="handleNow" />
                <Button class="scheduler__button" size="small" label="Save" variant="outlined" @click="handleSave" />
              </div>
            </div>
          </template>
        </DatePicker>
      </Dialog>

      <Dialog
        v-model:visible="isTimePickerOpen"
        header="Set Time"
        :modal="true"
        :draggable="false"
        :style="{ width: '320px' }"
      >
        <TimePicker :initialTime="currentTimeValue" @change="handleTimeChange" />
        <Divider class="scheduler__divider" />
        <template #footer>
          <Button @click="closeTimePickerDialog" outlined severity="secondary">Cancel</Button>
          <Button @click="saveTimeSelection" outlined severity="help">Done</Button>
        </template>
      </Dialog>
    </div>

    <div class="scheduler__hour" data-test-name="Cycle.Scheduler.hour">
      {{ formatHour(date) }}
    </div>

    <div class="scheduler__date" data-test-name="Cycle.Scheduler.date">
      {{ formatDate(date) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import TimePicker from '@/components/TimePicker/TimePicker.vue';
import { MERIDIAN, type Meridian, type TimeValue } from '@/shared/types/time';
import { formatDate, formatHour } from '@/utils';
import type { SchedulerView } from '@/views/cycle/domain/domain';
import { computed, ref, toRefs } from 'vue';

const CALENDAR_DIALOG_WIDTH = 350;
const HOURS_IN_12H_FORMAT = 12;

interface Props {
  view: SchedulerView;
  date: Date;
  disabled?: boolean;
}

interface Emits {
  (e: 'update:date', date: Date): void;
  (e: 'edit-start'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { view, date, disabled } = toRefs(props);

const localDate = ref(new Date(date.value));
const open = ref(false);
const isTimePickerOpen = ref(false);
const selectedTimeValue = ref<TimeValue | null>(null);

const hours = computed(() => localDate.value.getHours() % HOURS_IN_12H_FORMAT || HOURS_IN_12H_FORMAT);
const minutes = computed(() => localDate.value.getMinutes().toString().padStart(2, '0'));
const meridian = computed<Meridian>(() => {
  return localDate.value.getHours() >= HOURS_IN_12H_FORMAT ? MERIDIAN.PM : MERIDIAN.AM;
});
const currentTimeValue = computed<TimeValue>(() => ({
  hours: hours.value,
  minutes: parseInt(minutes.value),
  period: meridian.value,
}));

function normalizeHourValue(hours: number, period: Meridian): number {
  if (period === MERIDIAN.AM && hours === HOURS_IN_12H_FORMAT) return 0;
  if (period === MERIDIAN.PM && hours !== HOURS_IN_12H_FORMAT) return hours + HOURS_IN_12H_FORMAT;
  return hours;
}

function handleClick() {
  if (disabled.value) {
    return;
  }

  // Reset local date to current prop value when opening dialog
  localDate.value = new Date(date.value);
  open.value = true;
  emit('edit-start');
}

function handleCloseDialog() {
  open.value = false;
}

function handleDateChange(newDate: Date | null) {
  if (!newDate) return;

  const hours = localDate.value.getHours();
  const minutes = localDate.value.getMinutes();
  const seconds = localDate.value.getSeconds();
  const milliseconds = localDate.value.getMilliseconds();
  const date = new Date(newDate);

  date.setHours(hours, minutes, seconds, milliseconds);
  localDate.value = date;
}

function openTimePickerDialog() {
  isTimePickerOpen.value = true;
  selectedTimeValue.value = null;
}

function closeTimePickerDialog() {
  isTimePickerOpen.value = false;
  selectedTimeValue.value = null;
}

function handleTimeChange(timeValue: TimeValue) {
  selectedTimeValue.value = timeValue;
}

function saveTimeSelection() {
  if (!selectedTimeValue.value) {
    closeTimePickerDialog();
    return;
  }

  // Convert 12-hour to 24-hour format
  const { hours, minutes, period } = selectedTimeValue.value;
  const hour = normalizeHourValue(hours, period);
  const newDate = new Date(localDate.value);

  newDate.setHours(hour, minutes, 0, 0);
  localDate.value = newDate;

  closeTimePickerDialog();
}

function handleNow() {
  localDate.value = new Date();
}

function handleSave() {
  // Commit the local date changes to the parent
  emit('update:date', localDate.value);
  handleCloseDialog();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.scheduler {
  width: 100%;
  height: 100%;
  background: $color-light-grey;
  box-shadow:
    -2px 3px 4px 1px rgba(170, 170, 170, 0.25),
    inset 2px 2px 4.5px rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  padding: 8px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }

  &__title {
    font-style: normal;
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__hour {
    align-content: center;
    align-self: center;
    font-style: normal;
    font-weight: 500;
    font-size: 20px;
    color: $color-primary-button-text;
  }

  &__date {
    align-self: center;
    margin-top: 5px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__buttonbar {
    width: 100%;
  }

  &__time {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__time-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 16px;
    background: $color-light-grey;
    border: 1px solid $color-primary-button-outline;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;

    &:hover {
      background: $color-ultra-light-purple;
      border-color: $color-light-purple;
    }

    &:active {
      background: $color-light-purple;
    }

    &:focus-visible {
      outline: 2px solid $color-outline-focus;
    }
  }

  &__time-value {
    font-size: 18px;
    font-weight: 500;
    color: $color-primary-button-text;
    font-variant-numeric: tabular-nums;
  }

  &__time-edit-hint {
    font-size: 12px;
    color: $color-primary-light-text;
    font-weight: 400;
  }

  &__actions {
    display: flex;
    justify-content: space-between;
  }

  &__button {
    margin-top: 8px;
    min-width: 70px;
    min-height: 24px;
  }

  &__divider {
    margin: 8px 0 0 0;
  }
}
</style>
