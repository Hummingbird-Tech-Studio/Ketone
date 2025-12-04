import {
  Event,
  forgotPasswordMachine,
  ForgotPasswordState,
} from '@/views/passwordRecovery/actors/forgotPassword.actor';
import { useActor, useSelector } from '@xstate/vue';

/**
 * Composable for accessing forgot password state and actions
 *
 * @example
 * ```ts
 * const { idle, submitting, submit, actorRef } = useForgotPassword();
 * ```
 */
export function useForgotPassword() {
  const { send, actorRef } = useActor(forgotPasswordMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(ForgotPasswordState.Idle));
  const submitting = useSelector(actorRef, (state) => state.matches(ForgotPasswordState.Submitting));

  // Actions
  const submit = (email: string) => {
    send({
      type: Event.SUBMIT,
      email,
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
