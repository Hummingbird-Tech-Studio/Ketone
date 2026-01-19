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
  const isChecking = useSelector(actorRef, (state) => state.matches(State.Checking));

  /**
   * Starts the cycle check. Use useCycleBlockDialogEmissions to handle the result.
   */
  const startCheck = () => {
    send({ type: Event.START_CHECK });
  };

  /**
   * Dismisses the block dialog
   */
  const dismiss = () => {
    send({ type: Event.DISMISS });
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
    startCheck,
    dismiss,
    goToCycle,
    actorRef,
  };
}
