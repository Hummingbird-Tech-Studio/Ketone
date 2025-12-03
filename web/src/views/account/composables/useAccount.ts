import { accountActor, AccountState, Event } from '@/views/account/actors/account.actor';
import { useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing account state and actions
 * Uses the global account actor singleton
 *
 * @example
 * ```ts
 * const { idle, updatingEmail, updatingPassword, updateEmail, updatePassword, actorRef } = useAccount();
 * ```
 */
export function useAccount() {
  const idle = useSelector(accountActor, (state) => state.matches(AccountState.Idle));
  const updatingEmail = useSelector(accountActor, (state) => state.matches(AccountState.UpdatingEmail));
  const updatingPassword = useSelector(accountActor, (state) => state.matches(AccountState.UpdatingPassword));

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

  const updatePassword = (currentPassword: string, newPassword: string) => {
    accountActor.send({ type: Event.UPDATE_PASSWORD, currentPassword, newPassword });
  };

  const resetRateLimit = () => {
    accountActor.send({ type: Event.RESET_RATE_LIMIT });
  };

  return {
    // State checks
    idle,
    updatingEmail,
    updatingPassword,
    // Rate limiting
    remainingAttempts,
    blockedUntil,
    isBlocked,
    // Actions
    updateEmail,
    updatePassword,
    resetRateLimit,
    // Actor ref
    actorRef: accountActor,
  };
}
