/**
 * Plan Template Edit Emission Handler
 *
 * Subscribes to actor emissions and translates domain events to UI notifications (toasts).
 */
import { Match } from 'effect';
import { onUnmounted } from 'vue';
import type { Actor } from 'xstate';
import {
  Emit,
  type EmitType,
  type planTemplateEditMachine,
} from '../actors/planTemplateEdit.actor';
import type { PlanTemplateDetail } from '@/views/planTemplates/domain';

export interface PlanTemplateEditEmissionsOptions {
  onTemplateLoaded?: (template: PlanTemplateDetail) => void;
  onTemplateUpdated?: (template: PlanTemplateDetail) => void;
  onError?: (error: string) => void;
}

export function usePlanTemplateEditEmissions(
  actor: Actor<typeof planTemplateEditMachine>,
  options: PlanTemplateEditEmissionsOptions = {},
) {
  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.TEMPLATE_LOADED }, (e) => {
        options.onTemplateLoaded?.(e.template);
      }),
      Match.when({ type: Emit.TEMPLATE_UPDATED }, (e) => {
        options.onTemplateUpdated?.(e.template);
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
