import { Match } from 'effect';
import { onUnmounted } from 'vue';
import { Actor } from 'xstate';
import { blockingResourcesDialogMachine, Emit, type EmitType } from '../actors/blockingResourcesDialog.actor';

interface BlockingResourcesDialogEmissionsOptions {
  onProceed?: () => void;
  onNavigateToCycle?: () => void;
  onNavigateToPlan?: () => void;
}

/**
 * Composable to handle blocking resources dialog emissions.
 * Follows the pattern from useAccountNotifications.
 *
 * @param actor - The blocking resources dialog actor
 * @param options - Callbacks for handling emissions
 */
export function useBlockingResourcesDialogEmissions(
  actor: Actor<typeof blockingResourcesDialogMachine>,
  options: BlockingResourcesDialogEmissionsOptions = {},
) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PROCEED }, () => {
        options.onProceed?.();
      }),
      Match.when({ type: Emit.NAVIGATE_TO_CYCLE }, () => {
        options.onNavigateToCycle?.();
      }),
      Match.when({ type: Emit.NAVIGATE_TO_PLAN }, () => {
        options.onNavigateToPlan?.();
      }),
      Match.exhaustive,
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => actor.on(emit, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
