import { accountMachine, AccountState, Event } from '@/views/account/actors/account.actor';
import { useActor, useSelector } from '@xstate/vue';

/**
 * Composable for accessing account state and actions
 *
 * @example
 * ```ts
 * const { idle, updating, updateEmail, actorRef } = useAccount();
 * ```
 */
export function useAccount() {
  const { send, actorRef } = useActor(accountMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(AccountState.Idle));
  const updating = useSelector(actorRef, (state) => state.matches(AccountState.Updating));

  // Actions
  const updateEmail = (email: string, password: string) => {
    send({ type: Event.UPDATE_EMAIL, email, password });
  };

  return {
    // State checks
    idle,
    updating,
    // Actions
    updateEmail,
    // Actor ref
    actorRef,
  };
}
