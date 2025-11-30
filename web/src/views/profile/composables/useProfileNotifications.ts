import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/profile.actor';

export function useProfileNotifications(profileActor: Actor<AnyActorLogic>) {
  const toast = useToast();

  function handleProfileEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.PROFILE_SAVED }, () => {
        toast.add({
          severity: 'success',
          summary: 'Profile Saved',
          detail: 'Your profile has been updated successfully.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.PROFILE_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
      Match.orElse(() => {
        // Ignore other emits (PROFILE_LOADED)
      }),
    );
  }

  const subscriptions = Object.values(Emit).map((emit) => profileActor.on(emit, handleProfileEmit));

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
