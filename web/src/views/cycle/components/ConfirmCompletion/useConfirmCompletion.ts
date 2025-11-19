import { formatDate, formatHour, formatTime } from '@/utils/formatting';
import { useSelector } from '@xstate/vue';
import { startOfMinute } from 'date-fns';
import { Match } from 'effect';
import { type Ref, computed, onUnmounted, ref, watch } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { Emit as CycleEmit, type EmitType as CycleEmitType, Event, type cycleMachine } from '../../actors/cycle.actor';
import {
  Emit as DialogEmit,
  type EmitType as DialogEmitType,
  Event as DialogEvent,
} from '../../actors/schedulerDialog.actor';
import { useSchedulerDialog } from '../../composables/useSchedulerDialog';
import { goal, start } from '../../domain/domain';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;

interface UseConfirmCompletionParams {
  actorRef: ActorRefFrom<typeof cycleMachine>;
  visible: Ref<boolean>;
}

export function useConfirmCompletion({ actorRef, visible }: UseConfirmCompletionParams) {
  const startDate = useSelector(actorRef, (state) => state.context.startDate);
  const endDate = useSelector(actorRef, (state) => state.context.endDate);
  const pendingStartDate = useSelector(actorRef, (state) => state.context.pendingStartDate);
  const pendingEndDate = useSelector(actorRef, (state) => state.context.pendingEndDate);

  // Use pending dates if available, otherwise use regular dates
  const effectiveStartDate = computed(() => pendingStartDate.value ?? startDate.value);
  const effectiveEndDate = computed(() => pendingEndDate.value ?? endDate.value);

  // Initialize schedulerDialog
  const timePickerDialog  = useSchedulerDialog(start);

  // Calculate total fasting time (from effective start date to effective end date)
  const totalFastingTime = ref(formatTime(0, 0, 0));

  function updateTotalFastingTime() {
    // Calculate from effective start date to effective end date
    const start = effectiveStartDate.value;
    const end = effectiveEndDate.value;

    const elapsedSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

    const hours = Math.floor(elapsedSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((elapsedSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
    const seconds = elapsedSeconds % SECONDS_PER_MINUTE;

    totalFastingTime.value = formatTime(hours, minutes, seconds);
  }

  // Format start date and time
  const startHour = computed(() => formatHour(effectiveStartDate.value));
  const startDateFormatted = computed(() => formatDate(effectiveStartDate.value));

  // Format end date and time
  const endHour = computed(() => formatHour(effectiveEndDate.value));
  const endDateFormatted = computed(() => formatDate(effectiveEndDate.value));

  // DatePicker state (from schedulerDialog)
  const datePickerVisible = timePickerDialog.visible;
  const datePickerTitle = computed(() => timePickerDialog.currentView.value.name);
  const datePickerValue = timePickerDialog.date;

  // Actions
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

  function handleSave() {
    actorRef.send({ type: Event.SAVE_EDITED_DATES });
  }

  // Handler for schedulerDialog emissions
  function handleDialogEmit(emitType: DialogEmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: DialogEmit.REQUEST_UPDATE }, (emit) => {
        // Determine if it's Start or Goal
        const event = emit.view._tag === 'Start' ? Event.EDIT_START_DATE : Event.EDIT_END_DATE;

        // Send to cycleActor (updates pendingDates, no API call)
        actorRef.send({ type: event, date: startOfMinute(emit.date) });
      }),
    );
  }

  // Handler for cycleActor emissions (validations)
  function handleCycleEmit(emitType: CycleEmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: CycleEmit.VALIDATION_INFO }, () => {
        // Notify schedulerDialog that validation failed
        timePickerDialog.actorRef.send({ type: DialogEvent.VALIDATION_FAILED });
      }),
    );
  }

  // Watch for modal opening to calculate initial time
  watch(
    visible,
    (newVisible, oldVisible) => {
      // Calculate when modal opens
      if (newVisible && !oldVisible) {
        updateTotalFastingTime();
      }
    },
    { immediate: true },
  );

  // Recalculate when pending start or end date changes (user editing dates)
  watch([pendingStartDate, pendingEndDate], () => {
    if (visible.value) {
      updateTotalFastingTime();
    }
  });

  // When pendingDates change, notify schedulerDialog that update is complete
  watch([pendingStartDate, pendingEndDate], () => {
    // If schedulerDialog is in Submitting state, notify completion
    if (timePickerDialog.submitting.value) {
      timePickerDialog.actorRef.send({ type: DialogEvent.UPDATE_COMPLETE });
    }
  });

  // Subscriptions
  const subscriptions = [
    ...Object.values(DialogEmit).map((emit) => timePickerDialog.actorRef.on(emit, handleDialogEmit)),
    ...Object.values(CycleEmit).map((emit) => actorRef.on(emit, handleCycleEmit)),
  ];

  // Cleanup
  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });

  return {
    // Formatted dates
    startHour,
    startDateFormatted,
    endHour,
    endDateFormatted,
    // Fasting time
    totalFastingTime,
    // DatePicker state
    datePickerVisible,
    datePickerTitle,
    datePickerValue,
    // Actions
    handleStartCalendarClick,
    handleEndCalendarClick,
    handleDateTimeUpdate,
    handleDatePickerVisibilityChange,
    handleSave,
  };
}
