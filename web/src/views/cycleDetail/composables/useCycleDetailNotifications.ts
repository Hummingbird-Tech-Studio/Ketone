import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/cycleDetail.actor';

interface UseCycleDetailNotificationsOptions {
  onUpdateComplete?: () => void;
}

export function useCycleDetailNotifications(
  cycleDetailActor: Actor<AnyActorLogic>,
  options?: UseCycleDetailNotificationsOptions,
) {
  const toast = useToast();

  function handleEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.CYCLE_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
      Match.when({ type: Emit.UPDATE_COMPLETE }, () => {
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Cycle updated successfully',
          life: 5000,
        });
        options?.onUpdateComplete?.();
      }),
      Match.orElse(() => {
        // Ignore other emits
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => cycleDetailActor.on(emit, handleEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
