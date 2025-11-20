import { useSelector } from '@xstate/vue';
import type { ActorRefFrom } from 'xstate';
import type { cycleMachine } from '../actors/cycle.actor';
import { State as SchedulerDialogState } from '../actors/schedulerDialog.actor';

/**
 * Composable to access the schedulerDialogRef and its derived state from a CycleActor
 * @param cycleActorRef - Reference to the CycleActor
 * @returns Object containing schedulerDialogRef and its derived state selectors
 */
export function useSchedulerDialog(cycleActorRef: ActorRefFrom<typeof cycleMachine>) {
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

  return {
    schedulerDialogRef,
    dialogVisible,
    dialogTitle,
    dialogDate,
    dialogUpdating,
  };
}
