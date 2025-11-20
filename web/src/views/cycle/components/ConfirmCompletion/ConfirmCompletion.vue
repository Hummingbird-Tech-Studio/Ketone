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
    :visible="datePickerVisible"
    :title="datePickerTitle"
    :dateTime="datePickerValue || new Date()"
    @update:visible="handleDatePickerVisibilityChange"
    @update:dateTime="handleDateTimeUpdate"
  />
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { Match } from 'effect';
import { computed, onUnmounted, toRef } from 'vue';
import type { ActorRefFrom } from 'xstate';
import {
  Emit as CycleEmit,
  type EmitType as CycleEmitType,
  Event as CycleEvent,
  type cycleMachine,
} from '../../actors/cycle.actor';
import {
  Emit as DialogEmit,
  type EmitType as DialogEmitType,
  Event as DialogEvent,
} from '../../actors/schedulerDialog.actor';
import { useSchedulerDialog } from '../../composables/useSchedulerDialog';
import { goal, start } from '../../domain/domain';
import { useConfirmCompletion } from './useConfirmCompletion';

const props = defineProps<{
  visible: boolean;
  actorRef: ActorRefFrom<typeof cycleMachine>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'complete'): void;
}>();

const {
  startHour,
  startDateFormatted,
  endHour,
  endDateFormatted,
  totalFastingTime,
  effectiveStartDate,
  effectiveEndDate,
  actorRef,
} = useConfirmCompletion({
  actorRef: props.actorRef,
  visible: toRef(props, 'visible'),
});

const timePickerDialog = useSchedulerDialog(start);

// DatePicker state (from schedulerDialog)
const datePickerVisible = timePickerDialog.visible;
const datePickerTitle = computed(() => timePickerDialog.currentView.value.name);
const datePickerValue = timePickerDialog.date;

function handleStartCalendarClick() {
  timePickerDialog.open(start, effectiveStartDate.value);
}

function handleEndCalendarClick() {
  timePickerDialog.open(goal, effectiveEndDate.value);
}

function handleDateTimeUpdate(newDate: Date) {
  timePickerDialog.submit(newDate);
}

function handleDatePickerVisibilityChange(value: boolean) {
  if (!value) {
    timePickerDialog.close();
  }
}

function handleClose() {
  emit('update:visible', false);
}

function handleSave() {
  actorRef.send({ type: CycleEvent.SAVE_EDITED_DATES });
  emit('complete');
}

function handleDialogEmit(emitType: DialogEmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: DialogEmit.REQUEST_UPDATE }, (emit) => {
      const event = emit.view._tag === 'Start' ? CycleEvent.REQUEST_START_CHANGE : CycleEvent.REQUEST_END_CHANGE;
      actorRef.send({ type: event, date: emit.date });
    }),
  );
}

function handleCycleEmit(emitType: CycleEmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: CycleEmit.UPDATE_COMPLETE }, () => {
      timePickerDialog.actorRef.send({ type: DialogEvent.UPDATE_COMPLETE });
    }),
    Match.when({ type: CycleEmit.VALIDATION_INFO }, () => {
      // Notify schedulerDialog that validation failed
      timePickerDialog.actorRef.send({ type: DialogEvent.VALIDATION_FAILED });
    }),
  );
}

const subscriptions = [
  ...Object.values(DialogEmit).map((emit) => timePickerDialog.actorRef.on(emit, handleDialogEmit)),
  ...Object.values(CycleEmit).map((emit) => actorRef.on(emit, handleCycleEmit)),
];

onUnmounted(() => {
  subscriptions.forEach((sub) => sub.unsubscribe());
});
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
