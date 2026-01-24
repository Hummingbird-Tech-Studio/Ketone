import { Match } from 'effect';
import { onUnmounted } from 'vue';
import type { Actor } from 'xstate';
import { Emit, type EmitType, type activePlanMachine } from '../actors/activePlan.actor';

export interface ActivePlanEmissionsOptions {
  onPlanError?: (error: string) => void;
  onNoActivePlan?: () => void;
  onPlanEnded?: () => void;
  onPlanEndError?: (error: string) => void;
}

export function useActivePlanEmissions(
  activePlanActor: Actor<typeof activePlanMachine>,
  options: ActivePlanEmissionsOptions = {},
) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PLAN_ERROR }, (emit) => {
        options.onPlanError?.(emit.error);
      }),
      Match.when({ type: Emit.NO_ACTIVE_PLAN }, () => {
        options.onNoActivePlan?.();
      }),
      Match.when({ type: Emit.PLAN_ENDED }, () => {
        options.onPlanEnded?.();
      }),
      Match.when({ type: Emit.PLAN_END_ERROR }, (emit) => {
        options.onPlanEndError?.(emit.error);
      }),
      Match.orElse(() => {
        // Ignore TICK
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => activePlanActor.on(emit, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
