import { useActor, useSelector } from '@xstate/vue';
import { cycleBlockDialogMachine, Event, State } from '../actors/cycleBlockDialog.actor';

/**
 * Composable for managing the cycle block dialog state.
 * Shows a dialog when user tries to create a plan while a cycle is in progress.
 *
 * Use with useCycleBlockDialogEmissions to handle emissions.
 *
 * @example
 * ```ts
 * const { showDialog, isChecking, startCheck, dismiss, goToCycle, actorRef } = useCycleBlockDialog();
 * const pendingAction = ref<(() => void) | null>(null);
 *
 * // Handle emissions
 * useCycleBlockDialogEmissions(actorRef, pendingAction);
 *
 * // Trigger the check
 * const selectPreset = (preset) => {
 *   pendingAction.value = () => { showPresetConfigDialog(preset); };
 *   startCheck();
 * };
 * ```
 */
export function useCycleBlockDialog() {
  const { send, actorRef } = useActor(cycleBlockDialogMachine);

  const showDialog = useSelector(actorRef, (state) => state.matches(State.Blocked));
  const isChecking = useSelector(actorRef, (state) => state.matches(State.FetchingCycle));
  const hasError = useSelector(actorRef, (state) => state.matches(State.Error));

  /**
   * Starts the cycle check. Use useCycleBlockDialogEmissions to handle the result.
   */
  const startCheck = () => {
    send({ type: Event.FETCH_CYCLE });
  };

  /**
   * Dismisses the block dialog or error state
   */
  const dismiss = () => {
    send({ type: Event.DISMISS });
  };

  /**
   * Retries the cycle check after an error
   */
  const retry = () => {
    send({ type: Event.RETRY });
  };

  /**
   * Handles the "Go to Cycle" action - emits NAVIGATE_TO_CYCLE
   */
  const goToCycle = () => {
    send({ type: Event.GO_TO_CYCLE });
  };

  return {
    showDialog,
    isChecking,
    hasError,
    startCheck,
    dismiss,
    retry,
    goToCycle,
    actorRef,
  };
}
