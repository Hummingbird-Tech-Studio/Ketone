import { authenticationActor, Event, State } from '@/actors/authenticationActor';
import type { UserResponseSchema } from '@ketone/shared';
import { useSelector } from '@xstate/vue';

/**
 * Composable for accessing authentication state and actions
 * Uses the global authentication actor singleton
 *
 * @example
 * ```ts
 * const { authenticated, user, token, logout } = useAuth();
 * ```
 */
export function useAuth() {
  // Use the global singleton actor directly with useSelector
  // Note: We don't use useActor here because we want all components
  // to share the same actor instance that was started in main.ts

  // State checks
  const initializing = useSelector(authenticationActor, (state) => state.matches(State.INITIALIZING));
  const authenticating = useSelector(authenticationActor, (state) => state.matches(State.AUTHENTICATING));
  const authenticated = useSelector(authenticationActor, (state) => state.matches(State.AUTHENTICATED));
  const deauthenticating = useSelector(authenticationActor, (state) => state.matches(State.DEAUTHENTICATING));
  const unauthenticated = useSelector(authenticationActor, (state) => state.matches(State.UNAUTHENTICATED));
  const error = useSelector(authenticationActor, (state) => state.matches(State.ERROR));

  // Context data
  const user = useSelector(authenticationActor, (state) => state.context.user);
  const token = useSelector(authenticationActor, (state) => state.context.token);

  // Actions
  const logout = () => {
    authenticationActor.send({ type: Event.DEAUTHENTICATE });
  };

  const checkAuth = () => {
    authenticationActor.send({ type: Event.CHECK_AUTH });
  };

  const authenticate = (token: string, user: UserResponseSchema) => {
    authenticationActor.send({
      type: Event.AUTHENTICATE,
      token,
      user,
    });
  };

  const retry = () => {
    authenticationActor.send({ type: Event.RETRY });
  };

  return {
    // State checks
    initializing,
    authenticating,
    authenticated,
    deauthenticating,
    unauthenticated,
    error,

    // Context data
    user,
    token,

    // Actions
    logout,
    checkAuth,
    authenticate,
    retry,

    // Raw actor reference
    actorRef: authenticationActor,
  };
}
