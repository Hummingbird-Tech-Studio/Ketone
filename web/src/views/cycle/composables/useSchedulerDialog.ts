import { schedulerDialogMachine, SchedulerDialogState, Event } from '@/views/cycle/actors/schedulerDialog.actor';
import { useActor, useSelector } from '@xstate/vue';
import type { SchedulerView } from '@/views/cycle/domain/domain';

/**
 * Composable for managing a scheduler dialog instance
 *
 * @param view - The SchedulerView (start or goal)
 * @returns Dialog state, actions, and actor ref for event coordination
 *
 * @example
 * ```ts
 * const startDialog = useSchedulerDialog(start);
 * const endDialog = useSchedulerDialog(goal);
 * ```
 */
export function useSchedulerDialog(view: SchedulerView) {
  const { send, actorRef } = useActor(schedulerDialogMachine, {
    input: { view },
  });

  // State checks
  const closed = useSelector(actorRef, (state) => state.matches(SchedulerDialogState.Closed));
  const open = useSelector(actorRef, (state) => state.matches(SchedulerDialogState.Open));
  const submitting = useSelector(actorRef, (state) => state.matches(SchedulerDialogState.Submitting));
  const validationError = useSelector(actorRef, (state) => state.matches(SchedulerDialogState.ValidationError));

  // Derived state
  const visible = useSelector(actorRef, (state) => !state.matches(SchedulerDialogState.Closed));
  const updating = useSelector(actorRef, (state) => state.matches(SchedulerDialogState.Submitting));

  // Context data
  const pendingDate = useSelector(actorRef, (state) => state.context.pendingDate);
  const error = useSelector(actorRef, (state) => state.context.validationError);

  // Actions
  const openDialog = () => {
    send({ type: Event.OPEN });
  };

  const closeDialog = () => {
    send({ type: Event.CLOSE });
  };

  const submit = (date: Date) => {
    send({ type: Event.SUBMIT, date });
  };

  const submitNow = () => {
    send({ type: Event.NOW });
  };

  const setVisible = (value: boolean) => {
    if (value) {
      send({ type: Event.OPEN });
    } else {
      send({ type: Event.CLOSE });
    }
  };

  return {
    // State checks
    closed,
    open,
    submitting,
    validationError,
    // Derived state
    visible,
    updating,
    // Context data
    pendingDate,
    error,
    // Actions
    openDialog,
    closeDialog,
    submit,
    submitNow,
    setVisible,
    // Actor ref
    actorRef,
  };
}
