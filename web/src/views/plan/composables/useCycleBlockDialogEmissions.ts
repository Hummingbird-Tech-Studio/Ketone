import { Match } from 'effect';
import { onUnmounted } from 'vue';
import { Actor } from 'xstate';
import { cycleBlockDialogMachine, Emit, type EmitType } from '../actors/cycleBlockDialog.actor';

interface CycleBlockDialogEmissionsOptions {
  onProceed?: () => void;
  onNavigateToCycle?: () => void;
}

/**
 * Composable to handle cycle block dialog emissions.
 * Follows the pattern from useAccountNotifications.
 *
 * @param actor - The cycle block dialog actor
 * @param options - Callbacks for handling emissions
 */
export function useCycleBlockDialogEmissions(
  actor: Actor<typeof cycleBlockDialogMachine>,
  options: CycleBlockDialogEmissionsOptions = {},
) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PROCEED }, () => {
        options.onProceed?.();
      }),
      Match.when({ type: Emit.NAVIGATE_TO_CYCLE }, () => {
        options.onNavigateToCycle?.();
      }),
      Match.exhaustive,
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => actor.on(emit, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
