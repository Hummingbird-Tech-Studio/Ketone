import { Match } from 'effect';
import { onUnmounted } from 'vue';
import type { Actor } from 'xstate';
import { Emit, type EmitType, type planMachine } from '../actors/plan.actor';

export interface PlanEmissionsOptions {
  onPlanCreated?: () => void;
  onAlreadyActiveError?: (message: string) => void;
  onActiveCycleExistsError?: (message: string) => void;
  onInvalidPeriodCountError?: (message: string, periodCount: number) => void;
  onPeriodOverlapError?: (message: string, overlappingCycleId: string) => void;
  onPlanError?: (error: string) => void;
}

export function usePlanEmissions(actor: Actor<typeof planMachine>, options: PlanEmissionsOptions = {}) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PLAN_CREATED }, () => {
        options.onPlanCreated?.();
      }),
      Match.when({ type: Emit.ALREADY_ACTIVE_ERROR }, (emit) => {
        options.onAlreadyActiveError?.(emit.message);
      }),
      Match.when({ type: Emit.ACTIVE_CYCLE_EXISTS_ERROR }, (emit) => {
        options.onActiveCycleExistsError?.(emit.message);
      }),
      Match.when({ type: Emit.INVALID_PERIOD_COUNT_ERROR }, (emit) => {
        options.onInvalidPeriodCountError?.(emit.message, emit.periodCount);
      }),
      Match.when({ type: Emit.PERIOD_OVERLAP_ERROR }, (emit) => {
        options.onPeriodOverlapError?.(emit.message, emit.overlappingCycleId);
      }),
      Match.when({ type: Emit.PLAN_ERROR }, (emit) => {
        options.onPlanError?.(emit.error);
      }),
      Match.orElse(() => {
        // Ignore other emissions (PLAN_LOADED, PLAN_CANCELLED, PERIODS_UPDATED)
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => actor.on(emit, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
