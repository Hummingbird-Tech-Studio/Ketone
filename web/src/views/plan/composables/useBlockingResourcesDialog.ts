import { useActor, useSelector } from '@xstate/vue';
import { blockingResourcesDialogMachine, Event, State } from '../actors/blockingResourcesDialog.actor';

/**
 * Composable for managing the blocking resources dialog state.
 * Shows a dialog when user tries to create a plan while a cycle or plan is in progress.
 *
 * Use with useBlockingResourcesDialogEmissions to handle emissions.
 *
 * @example
 * ```ts
 * const { showDialog, isChecking, hasCycle, hasPlan, startCheck, dismiss, goToCycle, goToPlan, actorRef } = useBlockingResourcesDialog();
 * const pendingAction = ref<(() => void) | null>(null);
 *
 * // Handle emissions
 * useBlockingResourcesDialogEmissions(actorRef, pendingAction);
 *
 * // Trigger the check
 * const selectPreset = (preset) => {
 *   pendingAction.value = () => { showPresetConfigDialog(preset); };
 *   startCheck();
 * };
 * ```
 */
export function useBlockingResourcesDialog() {
  const { send, actorRef } = useActor(blockingResourcesDialogMachine);

  const showDialog = useSelector(actorRef, (state) => state.matches(State.Blocked));
  const isChecking = useSelector(actorRef, (state) => state.matches(State.Checking));
  const hasError = useSelector(actorRef, (state) => state.matches(State.Error));
  const hasCycle = useSelector(actorRef, (state) => state.context.hasCycle);
  const hasPlan = useSelector(actorRef, (state) => state.context.hasPlan);

  /**
   * Starts the blocking resources check. Use useBlockingResourcesDialogEmissions to handle the result.
   */
  const startCheck = () => {
    send({ type: Event.CHECK_BLOCKING_RESOURCES });
  };

  /**
   * Dismisses the block dialog or error state
   */
  const dismiss = () => {
    send({ type: Event.DISMISS });
  };

  /**
   * Retries the blocking resources check after an error
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

  /**
   * Handles the "Go to Plan" action - emits NAVIGATE_TO_PLAN
   */
  const goToPlan = () => {
    send({ type: Event.GO_TO_PLAN });
  };

  return {
    showDialog,
    isChecking,
    hasError,
    hasCycle,
    hasPlan,
    startCheck,
    dismiss,
    retry,
    goToCycle,
    goToPlan,
    actorRef,
  };
}
