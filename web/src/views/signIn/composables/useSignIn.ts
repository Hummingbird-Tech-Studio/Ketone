import { Event, signInMachine, SignInState } from '@/views/signIn/actors/signIn.actor';
import { useActor, useSelector } from '@xstate/vue';

/**
 * Composable for accessing sign-in state and actions
 *
 * @example
 * ```ts
 * const { idle, submitting, submit } = useSignIn();
 * ```
 */
export function useSignIn() {
  const { send, actorRef } = useActor(signInMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(SignInState.Idle));
  const submitting = useSelector(actorRef, (state) => state.matches(SignInState.Submitting));

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
