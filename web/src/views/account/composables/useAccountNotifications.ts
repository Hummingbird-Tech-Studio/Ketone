import { authenticationActor, Event as AuthEvent } from '@/actors/authenticationActor';
import { programUpdateSessionEmail } from '@/services/auth/auth-session.service';
import { runWithUi } from '@/utils/effects/helpers';
import { Match } from 'effect';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';
import { Actor } from 'xstate';
import { accountMachine, Emit, type EmitType } from '../actors/account.actor';

export function useAccountNotifications(accountActor: Actor<typeof accountMachine>) {
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
      Match.when({ type: Emit.RATE_LIMITED }, () => {
        const blockedUntil = accountActor.getSnapshot().context.blockedUntil;
        const remainingSeconds = blockedUntil ? Math.ceil((blockedUntil - Date.now()) / 1000) : 0;
        const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
        toast.add({
          severity: 'warn',
          summary: 'Too Many Attempts',
          detail: `Too many failed attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
          life: 10000,
        });
      }),
      Match.when({ type: Emit.PASSWORD_UPDATED }, () => {
        toast.add({
          severity: 'success',
          summary: 'Password Updated',
          detail: 'Your password has been updated successfully.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.PASSWORD_UPDATE_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
      Match.when({ type: Emit.INVALID_PASSWORD }, (emit) => {
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
      Match.when({ type: Emit.ACCOUNT_DELETED }, () => {
        // Logout the user
        authenticationActor.send({ type: AuthEvent.DEAUTHENTICATE });

        toast.add({
          severity: 'success',
          summary: 'Account Deleted',
          detail: 'Your account has been deleted successfully.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.ACCOUNT_DELETE_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: emit.error,
          life: 15000,
        });
      }),
      Match.when({ type: Emit.EXPORT_JSON_SUCCESS }, () => {
        toast.add({
          severity: 'success',
          summary: 'Export Complete',
          detail: 'Your data has been exported as JSON.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.EXPORT_CSV_SUCCESS }, () => {
        toast.add({
          severity: 'success',
          summary: 'Export Complete',
          detail: 'Your data has been exported as CSV.',
          life: 5000,
        });
      }),
      Match.when({ type: Emit.EXPORT_ERROR }, (emit) => {
        toast.add({
          severity: 'error',
          summary: 'Export Failed',
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
