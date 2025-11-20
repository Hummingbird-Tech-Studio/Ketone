<template>
  <Dialog
    :visible="visible"
    modal
    header="Confirm Completion"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleClose"
  >
    <div class="cycle-summary">
      <div class="cycle-summary__section">
        <div class="cycle-summary__label">Total Fasting Time:</div>
        <div class="cycle-summary__time">{{ totalFastingTime }}</div>
      </div>

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler">
          <div class="cycle-summary__scheduler-header">
            <div class="cycle-summary__scheduler-title">Start:</div>
            <Button
              type="button"
              icon="pi pi-calendar"
              rounded
              variant="outlined"
              severity="secondary"
              aria-label="Start Date"
              @click="handleStartCalendarClick"
            />
          </div>
          <div class="cycle-summary__scheduler-hour">{{ startHour }}</div>
          <div class="cycle-summary__scheduler-date">{{ startDateFormatted }}</div>
        </div>
      </div>

      <Divider />

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler">
          <div class="cycle-summary__scheduler-header">
            <div class="cycle-summary__scheduler-title">End:</div>
            <Button
              type="button"
              icon="pi pi-calendar"
              rounded
              variant="outlined"
              severity="secondary"
              aria-label="End Date"
              @click="handleEndCalendarClick"
            />
          </div>
          <div class="cycle-summary__scheduler-hour">{{ endHour }}</div>
          <div class="cycle-summary__scheduler-date">{{ endDateFormatted }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="cycle-summary__footer">
        <Button label="Close" outlined @click="handleClose" />
        <Button label="Save" :loading="false" @click="handleSave" />
      </div>
    </template>
  </Dialog>

  <DateTimePickerDialog
    :visible="dialogVisible"
    :title="dialogTitle"
    :dateTime="dialogDate || new Date()"
    @update:visible="handleDatePickerVisibilityChange"
    @update:dateTime="handleDateTimeUpdate"
  />
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { toRef } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { Event as CycleEvent, type cycleMachine } from '../../actors/cycle.actor';
import { useSchedulerDialog } from '../../composables/useSchedulerDialog';
import { useConfirmCompletion } from './useConfirmCompletion';

const props = defineProps<{
  visible: boolean;
  actorRef: ActorRefFrom<typeof cycleMachine>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'complete'): void;
}>();

const { startHour, startDateFormatted, endHour, endDateFormatted, totalFastingTime, actorRef } = useConfirmCompletion({
  actorRef: props.actorRef,
  visible: toRef(props, 'visible'),
});

const { dialogVisible, dialogTitle, dialogDate, openStartDialog, openEndDialog, closeDialog, submitDialog } =
  useSchedulerDialog(actorRef);

function handleStartCalendarClick() {
  openStartDialog();
}

function handleEndCalendarClick() {
  openEndDialog();
}

function handleDateTimeUpdate(newDate: Date) {
  submitDialog(newDate);
}

function handleDatePickerVisibilityChange(value: boolean) {
  if (!value) {
    closeDialog();
  }
}

function handleClose() {
  emit('update:visible', false);
}

function handleSave() {
  actorRef.send({ type: CycleEvent.SAVE_EDITED_DATES });
  emit('complete');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.cycle-summary {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
  &__section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  &__label {
    align-self: center;
    font-size: 16px;
    color: $color-primary-button-text;
  }
  &__time {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    text-align: center;
    padding: 8px 0;
  }
  &__scheduler {
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  &__scheduler-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  &__scheduler-title {
    font-weight: 700;
    font-size: 16px;
    color: $color-primary-button-text;
  }
  &__scheduler-hour {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
  &__scheduler-date {
    margin-top: 5px;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
  &__footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
