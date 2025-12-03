import { accountActor, AccountState, Event } from '@/views/account/actors/account.actor';
import { useSelector } from '@xstate/vue';
import { computed } from 'vue';

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

  // Rate limiting state
  const remainingAttempts = useSelector(accountActor, (state) => state.context.remainingAttempts);
  const blockedUntil = useSelector(accountActor, (state) => state.context.blockedUntil);
  const isBlocked = computed(() => {
    const until = blockedUntil.value;
    return until !== null && Date.now() < until;
  });

  // Actions
  const updateEmail = (email: string, password: string) => {
    accountActor.send({ type: Event.UPDATE_EMAIL, email, password });
  };

  const resetRateLimit = () => {
    accountActor.send({ type: Event.RESET_RATE_LIMIT });
  };

  return {
    // State checks
    idle,
    updating,
    // Rate limiting
    remainingAttempts,
    blockedUntil,
    isBlocked,
    // Actions
    updateEmail,
    resetRateLimit,
    // Actor ref
    actorRef: accountActor,
  };
}
