<template>
  <Dialog
    :visible="visible"
    modal
    :header="title"
    :style="{ width: `${CALENDAR_DIALOG_WIDTH}px` }"
    :draggable="false"
    @update:visible="handleDialogVisibilityChange"
  >
    <DatePicker :modelValue="localDate" @update:modelValue="handleDateChange" inline showButtonBar placeholder="Basic">
      <template #buttonbar>
        <div class="datetime-picker__buttonbar">
          <div class="datetime-picker__time">
            <button class="datetime-picker__time-display" aria-label="Set time" @click="openTimePickerDialog">
              <span class="datetime-picker__time-value"> {{ hours }}:{{ minutes }} {{ meridian }} </span>
              <span class="datetime-picker__time-edit-hint">Click to edit</span>
            </button>
          </div>
          <Divider class="datetime-picker__divider" />
          <div class="datetime-picker__actions">
            <Button class="datetime-picker__button" size="small" label="Now" variant="outlined" @click="handleNow" />
            <Button
              class="datetime-picker__button"
              size="small"
              label="Save"
              variant="outlined"
              :loading="loading"
              :disabled="loading"
              @click="handleSave"
            />
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
    <Divider class="datetime-picker__divider" />
    <template #footer>
      <Button @click="closeTimePickerDialog" outlined severity="secondary">Cancel</Button>
      <Button @click="saveTimeSelection" outlined severity="help">Done</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import TimePicker from '@/components/TimePicker/TimePicker.vue';
import { MERIDIAN, type Meridian, type TimeValue } from '@/shared/types/time';
import { computed, ref, toRefs, watch } from 'vue';

const CALENDAR_DIALOG_WIDTH = 350;
const HOURS_IN_12H_FORMAT = 12;

type DatePickerValue = Date | Date[] | (Date | null)[] | null | undefined;

interface Props {
  visible: boolean;
  title: string;
  dateTime: Date;
  loading?: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'update:dateTime', date: Date): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { visible, dateTime, loading } = toRefs(props);

const localDate = ref(new Date(dateTime.value));
const isTimePickerOpen = ref(false);
const selectedTimeValue = ref<TimeValue | null>(null);

// Watch for dateTime prop changes to sync localDate
watch(dateTime, (newDate) => {
  localDate.value = new Date(newDate);
});

// Watch for visible state changes to reset local date when dialog opens
watch(visible, (isOpen) => {
  if (isOpen) {
    localDate.value = new Date(dateTime.value);
  }
});

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

function handleDialogVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleDateChange(newDate: DatePickerValue) {
  if (!newDate || Array.isArray(newDate)) return;

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
  emit('update:dateTime', localDate.value);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.datetime-picker {
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
