import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/cycle.actor';

export function useCycleNotifications(cycleActor: Actor<AnyActorLogic>) {
  const toast = useToast();

  function handleCycleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.CYCLE_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 10000,
        });
      }),
      Match.orElse(() => {
        // Ignore other emits (TICK, CYCLE_LOADED)
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => cycleActor.on(emit, handleCycleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
