import { authenticationActor, Event } from '@/actors/authenticationActor';
import {
  create401Interceptor as create401InterceptorFactory,
  createHttpClientWith401Interceptor,
} from '@ketone/shared/services/http/http-interceptor';

/**
 * HTTP Response Interceptor
 * Handles 401 Unauthorized responses by deauthenticating the user
 */
export const create401Interceptor = create401InterceptorFactory(authenticationActor, { type: Event.DEAUTHENTICATE });

/**
 * HTTP Client Layer with 401 interceptor
 * Use this layer in services that need automatic 401 handling
 */
export const HttpClientWith401Interceptor = createHttpClientWith401Interceptor(authenticationActor, {
  type: Event.DEAUTHENTICATE,
});
