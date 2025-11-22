import { useSelector } from '@xstate/vue';
import type { ActorRefFrom } from 'xstate';
import type { cycleMachine } from '../actors/cycle.actor';
import { CycleState } from '../actors/cycle.actor';
import { Event as SchedulerDialogEvent, State as SchedulerDialogState } from '../actors/schedulerDialog.actor';
import { goal, start } from '../domain/domain';

/**
 * Composable to access the schedulerDialogRef and its derived state from a CycleActor
 * @param cycleActorRef - Reference to the CycleActor
 * @returns Object containing schedulerDialogRef and its derived state selectors
 */
export function useSchedulerDialog(cycleActorRef: ActorRefFrom<typeof cycleMachine>) {
  const confirmCompletion = useSelector(cycleActorRef, (state) => state.matches(CycleState.ConfirmCompletion));
  const schedulerDialogRef = useSelector(cycleActorRef, (state) => state.context.schedulerDialogRef);
  const dialogVisible = useSelector(
    schedulerDialogRef,
    (state) =>
      state.matches(SchedulerDialogState.Open) ||
      state.matches(SchedulerDialogState.Submitting) ||
      state.matches(SchedulerDialogState.ValidationError),
  );
  const dialogTitle = useSelector(schedulerDialogRef, (state) => state.context.view.name);
  const dialogDate = useSelector(schedulerDialogRef, (state) => state.context.date);
  const dialogUpdating = useSelector(schedulerDialogRef, (state) => state.matches(SchedulerDialogState.Submitting));

  /**
   * Opens the scheduler dialog for editing the start date
   */
  const openStartDialog = () => {
    const state = cycleActorRef.getSnapshot();
    const date = confirmCompletion.value ? state.context.pendingStartDate! : state.context.startDate;

    schedulerDialogRef.value.send({
      type: SchedulerDialogEvent.OPEN,
      view: start,
      date,
    });
  };

  /**
   * Opens the scheduler dialog for editing the end date
   */
  const openEndDialog = () => {
    const state = cycleActorRef.getSnapshot();
    const date = confirmCompletion.value ? state.context.pendingEndDate! : state.context.endDate;

    schedulerDialogRef.value.send({
      type: SchedulerDialogEvent.OPEN,
      view: goal,
      date,
    });
  };

  /**
   * Closes the scheduler dialog
   */
  const closeDialog = () => {
    schedulerDialogRef.value.send({ type: SchedulerDialogEvent.CLOSE });
  };

  /**
   * Submits a new date to the scheduler dialog
   */
  const submitDialog = (date: Date) => {
    schedulerDialogRef.value.send({ type: SchedulerDialogEvent.SUBMIT, date });
  };

  return {
    schedulerDialogRef,
    dialogVisible,
    dialogTitle,
    dialogDate,
    dialogUpdating,
    openStartDialog,
    openEndDialog,
    closeDialog,
    submitDialog,
  };
}
