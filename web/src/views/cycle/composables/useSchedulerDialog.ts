import { Event, schedulerDialogMachine, State } from '@/views/cycle/actors/schedulerDialog.actor';
import type { SchedulerView } from '@/views/cycle/domain/domain';
import { useActor, useSelector } from '@xstate/vue';

/**
 * Composable for managing a single shared scheduler dialog instance
 *
 * @returns Dialog state, actions, and actor ref for event coordination
 */
export function useSchedulerDialog(initialView: SchedulerView) {
  const { send, actorRef } = useActor(schedulerDialogMachine, {
    input: { view: initialView },
  });

  // State checks
  const closed = useSelector(actorRef, (state) => state.matches(State.Closed));
  const isOpen = useSelector(actorRef, (state) => state.matches(State.Open));
  const submitting = useSelector(actorRef, (state) => state.matches(State.Submitting));
  const validationError = useSelector(actorRef, (state) => state.matches(State.ValidationError));

  // Derived state
  const visible = useSelector(actorRef, (state) => !state.matches(State.Closed));
  const updating = useSelector(actorRef, (state) => state.matches(State.Submitting));

  // Context data
  const currentView = useSelector(actorRef, (state) => state.context.view);
  const date = useSelector(actorRef, (state) => state.context.date);

  // Actions
  const open = (view: SchedulerView, date: Date) => {
    send({ type: Event.OPEN, view, date });
  };

  const close = () => {
    send({ type: Event.CLOSE });
  };

  const submit = (date: Date) => {
    send({ type: Event.SUBMIT, date });
  };

  return {
    // State checks
    closed,
    isOpen,
    submitting,
    validationError,
    // Derived state
    visible,
    updating,
    // Context data
    currentView,
    date,
    // Actions
    open,
    close,
    submit,
    // Actor ref
    actorRef,
  };
}
