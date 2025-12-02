import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/account.actor';

export function useAccountNotifications(accountActor: Actor<AnyActorLogic>) {
  const toast = useToast();

  function handleAccountEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.EMAIL_UPDATED }, () => {
        toast.add({
          severity: 'success',
          summary: 'Email Updated',
          detail: 'Your email has been updated successfully.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.EMAIL_UPDATE_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
      Match.orElse(() => {
        // Ignore other emits
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => accountActor.on(emit, handleAccountEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
