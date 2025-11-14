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
        <DatePicker v-model="date" inline showButtonBar placeholder="Basic">
          <template #buttonbar="{ todayCallback, saveCallback }">
            <div class="scheduler__buttonbar">
              <div class="scheduler__time">
                <button class="scheduler__time-display" aria-label="Set time" @click="openTimePickerDialog">
                  <span class="scheduler__time-value"> {{ hours }}:{{ minutes }} {{ meridian }} </span>
                  <span class="scheduler__time-edit-hint">Click to edit</span>
                </button>
              </div>
              <Divider class="scheduler__divider" />
              <div class="scheduler__actions">
                <Button class="scheduler__button" size="small" label="Now" variant="outlined" @click="todayCallback" />
                <Button class="scheduler__button" size="small" label="Save" variant="outlined" @click="saveCallback" />
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
import { formatDate, formatHour } from '@/utils';
import type { SchedulerView } from '@/views/cycle/domain/domain';
// import { Event, State, Emit } from '@/views/cycle/actors/cycle.actor';
import { computed, onUnmounted, ref, toRefs } from 'vue';
import { type AnyActorRef } from 'xstate';
import type { TimeValue } from '@/shared/types/time';

const CALENDAR_DIALOG_WIDTH = 350;

const props = defineProps<{
  view: SchedulerView;
  onClick: () => void;
  date: Date;
  actor: AnyActorRef;
  disabled?: boolean;
}>();

const { view, onClick, date, actor, disabled } = toRefs(props);

const hours = computed(() => date.value.getHours() % 12 || 12);
const minutes = computed(() => date.value.getMinutes().toString().padStart(2, '0'));
const meridian = computed(() => {
  return date.value.getHours() >= 12 ? 'PM' : 'AM';
});
const open = ref(false);

// TimePicker dialog state
const isTimePickerOpen = ref(false);
const selectedTimeValue = ref<TimeValue | null>(null);

const currentTimeValue = computed<TimeValue>(() => ({
  hours: hours.value,
  minutes: parseInt(minutes.value),
  period: meridian.value,
}));

function handleClick() {
  if (disabled.value) {
    return;
  }
  open.value = true;
  onClick.value();
}

function handleCloseDialog() {
  open.value = false;
  // actor.value.send({ type: Event.CANCEL_EDITING_DATE });
}

// TimePicker dialog functions
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
  const { hours: hours12, minutes: mins, period } = selectedTimeValue.value;
  let hour24 = hours12;

  if (period === 'AM' && hours12 === 12) {
    hour24 = 0;
  } else if (period === 'PM' && hours12 !== 12) {
    hour24 = hours12 + 12;
  }

  // Update the date with the new time
  const newDate = new Date(date.value);
  newDate.setHours(hour24, mins, 0, 0);

  // Update the date prop (this will trigger the parent component to update)
  date.value = newDate;

  closeTimePickerDialog();
}

const cycleActorSub = actor.value.subscribe(() => {
  // if (snapshot.matches({ [State.InProgress]: State.Idle })) {
  //   open.value = false;
  // }
});
//const endDateUpdatedSub = actor.value.on(Emit.END_DATE_UPDATED, () => (open.value = false));

onUnmounted(() => {
  cycleActorSub.unsubscribe();
  //endDateUpdatedSub.unsubscribe();
});
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
