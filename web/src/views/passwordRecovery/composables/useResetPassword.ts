import {
  Event,
  resetPasswordMachine,
  ResetPasswordState,
} from '@/views/passwordRecovery/actors/resetPassword.actor';
import { useActor, useSelector } from '@xstate/vue';

/**
 * Composable for accessing reset password state and actions
 *
 * @example
 * ```ts
 * const { idle, submitting, submit, actorRef } = useResetPassword();
 * ```
 */
export function useResetPassword() {
  const { send, actorRef } = useActor(resetPasswordMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(ResetPasswordState.Idle));
  const submitting = useSelector(actorRef, (state) => state.matches(ResetPasswordState.Submitting));

  // Actions
  const submit = (token: string, password: string) => {
    send({
      type: Event.SUBMIT,
      token,
      password,
    });
  };

  return {
    // State checks
    idle,
    submitting,
    // Actions
    submit,
    // Actor ref
    actorRef,
  };
}
