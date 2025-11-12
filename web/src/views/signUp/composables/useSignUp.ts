import { Event, signUpMachine, SignUpState } from '@/views/signUp/actors/signUp.actor.ts';
import { useActor, useSelector } from '@xstate/vue';

/**
 * Composable for accessing sign-up state and actions
 *
 * @example
 * ```ts
 * const { idle, submitting, submit } = useSignUp();
 * ```
 */
export function useSignUp() {
  const { send, actorRef } = useActor(signUpMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(SignUpState.Idle));
  const submitting = useSelector(actorRef, (state) => state.matches(SignUpState.Submitting));

  // Actions
  const submit = (values: { email: string; password: string }) => {
    send({
      type: Event.SUBMIT,
      values,
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
