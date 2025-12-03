import { authenticationActor, Event as AuthEvent } from '@/actors/authenticationActor';
import { programUpdateSessionEmail } from '@/services/auth/auth-session.service';
import { runWithUi } from '@/utils/effects/helpers';
import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit, type EmitType } from '../actors/account.actor';

export function useAccountNotifications(accountActor: Actor<AnyActorLogic>) {
  const toast = useToast();

  function handleAccountEmit(emitType: EmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: Emit.EMAIL_UPDATED }, (emit) => {
        // Update the email in the authentication actor (memory state)
        authenticationActor.send({
          type: AuthEvent.UPDATE_USER_EMAIL,
          email: emit.result.email,
        });

        // Persist the email update in localStorage
        runWithUi(
          programUpdateSessionEmail(emit.result.email),
          () => {
            // Session updated successfully
          },
          (error) => {
            console.error('Failed to update session email:', error);
          },
        );

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
      Match.when({ type: Emit.RATE_LIMITED }, (emit) => {
        const minutes = Math.ceil(emit.retryAfter / 60);
        toast.add({
          severity: 'warn',
          summary: 'Too Many Attempts',
          detail: `Too many failed attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
          life: 10000,
        });
      }),
      Match.when({ type: Emit.PASSWORD_ERROR }, (emit) => {
        // When no attempts remaining, show the rate limit toast instead
        if (emit.remainingAttempts === 0) {
          toast.add({
            severity: 'warn',
            summary: 'Too Many Attempts',
            detail: 'Too many failed attempts. Please try again later.',
            life: 10000,
          });
        } else {
          toast.add({
            severity: 'error',
            summary: 'Invalid Password',
            detail: `${emit.remainingAttempts} attempt${emit.remainingAttempts !== 1 ? 's' : ''} left to enter the correct password`,
            life: 10000,
          });
        }
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
