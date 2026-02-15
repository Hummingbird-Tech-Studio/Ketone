import { Match } from 'effect';
import { onUnmounted } from 'vue';
import type { Actor } from 'xstate';
import { Emit, type EmitType, type planEditMachine } from '../actors/planEdit.actor';

export interface PlanEditEmissionsOptions {
  onPlanLoaded?: () => void;
  onNameUpdated?: () => void;
  onDescriptionUpdated?: () => void;
  onStartDateUpdated?: () => void;
  onPeriodsUpdated?: () => void;
  onTimelineSaved?: () => void;
  onTemplateSaved?: () => void;
  onTemplateSaveError?: (error: string) => void;
  onTemplateLimitReached?: () => void;
  onError?: (error: string) => void;
  onPeriodOverlapError?: (message: string, overlappingCycleId: string) => void;
  onPlanInvalidStateError?: (message: string) => void;
}

export function usePlanEditEmissions(actor: Actor<typeof planEditMachine>, options: PlanEditEmissionsOptions = {}) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PLAN_LOADED }, () => {
        options.onPlanLoaded?.();
      }),
      Match.when({ type: Emit.NAME_UPDATED }, () => {
        options.onNameUpdated?.();
      }),
      Match.when({ type: Emit.DESCRIPTION_UPDATED }, () => {
        options.onDescriptionUpdated?.();
      }),
      Match.when({ type: Emit.START_DATE_UPDATED }, () => {
        options.onStartDateUpdated?.();
      }),
      Match.when({ type: Emit.PERIODS_UPDATED }, () => {
        options.onPeriodsUpdated?.();
      }),
      Match.when({ type: Emit.TIMELINE_SAVED }, () => {
        options.onTimelineSaved?.();
      }),
      Match.when({ type: Emit.ERROR }, (emit) => {
        options.onError?.(emit.error);
      }),
      Match.when({ type: Emit.PERIOD_OVERLAP_ERROR }, (emit) => {
        options.onPeriodOverlapError?.(emit.message, emit.overlappingCycleId);
      }),
      Match.when({ type: Emit.PLAN_INVALID_STATE_ERROR }, (emit) => {
        options.onPlanInvalidStateError?.(emit.message);
      }),
      Match.when({ type: Emit.TEMPLATE_SAVED }, () => {
        options.onTemplateSaved?.();
      }),
      Match.when({ type: Emit.TEMPLATE_SAVE_ERROR }, (emit) => {
        options.onTemplateSaveError?.(emit.error);
      }),
      Match.when({ type: Emit.TEMPLATE_LIMIT_REACHED }, () => {
        options.onTemplateLimitReached?.();
      }),
      Match.exhaustive,
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => actor.on(emit, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
