import { accountActor, AccountState, Event } from '@/views/account/actors/account.actor';
import { useSelector } from '@xstate/vue';

/**
 * Composable for accessing account state and actions
 * Uses the global account actor singleton
 *
 * @example
 * ```ts
 * const { idle, updating, updateEmail, actorRef } = useAccount();
 * ```
 */
export function useAccount() {
  const idle = useSelector(accountActor, (state) => state.matches(AccountState.Idle));
  const updating = useSelector(accountActor, (state) => state.matches(AccountState.Updating));

  // Actions
  const updateEmail = (email: string, password: string) => {
    accountActor.send({ type: Event.UPDATE_EMAIL, email, password });
  };

  return {
    // State checks
    idle,
    updating,
    // Actions
    updateEmail,
    // Actor ref
    actorRef: accountActor,
  };
}
