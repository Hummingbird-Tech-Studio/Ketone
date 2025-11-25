import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/statistics.actor';

export function useStatisticsNotifications(statisticsActor: Actor<AnyActorLogic>) {
  const toast = useToast();

  function handleStatisticsEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.STATISTICS_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => statisticsActor.on(emit, handleStatisticsEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
