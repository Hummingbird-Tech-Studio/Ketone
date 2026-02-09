/**
 * Plan Templates List Emission Handler
 *
 * Subscribes to actor emissions and translates domain events to UI notifications (toasts).
 */
import { Match } from 'effect';
import { onUnmounted } from 'vue';
import type { Actor } from 'xstate';
import { Emit, type EmitType, type planTemplatesMachine } from '../actors/planTemplates.actor';

export interface PlanTemplatesEmissionsOptions {
  onTemplateDuplicated?: () => void;
  onTemplateDeleted?: () => void;
  onLimitReached?: () => void;
  onError?: (error: string) => void;
}

export function usePlanTemplatesEmissions(
  actor: Actor<typeof planTemplatesMachine>,
  options: PlanTemplatesEmissionsOptions = {},
) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.TEMPLATE_DUPLICATED }, () => {
        options.onTemplateDuplicated?.();
      }),
      Match.when({ type: Emit.TEMPLATE_DELETED }, () => {
        options.onTemplateDeleted?.();
      }),
      Match.when({ type: Emit.LIMIT_REACHED }, () => {
        options.onLimitReached?.();
      }),
      Match.when({ type: Emit.ERROR }, (e) => {
        options.onError?.(e.error);
      }),
      Match.exhaustive,
    );
  }

  const subscriptions = Object.values(Emit).map((e) => actor.on(e, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
