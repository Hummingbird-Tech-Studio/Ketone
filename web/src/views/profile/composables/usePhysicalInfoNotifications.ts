import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/physicalInfo.actor';

export function usePhysicalInfoNotifications(physicalInfoActor: Actor<AnyActorLogic>) {
  const toast = useToast();

  function handlePhysicalInfoEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PHYSICAL_INFO_SAVED }, () => {
        toast.add({
          severity: 'success',
          summary: 'Physical Info Saved',
          detail: 'Your physical information has been updated successfully.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.PHYSICAL_INFO_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
      Match.orElse(() => {
        // Ignore other emits (PHYSICAL_INFO_LOADED)
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => physicalInfoActor.on(emit, handlePhysicalInfoEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
