import { SIGNUP_IP_LIMIT, SIGNUP_IP_WINDOW_SECONDS } from '@ketone/shared';
import { Effect } from 'effect';
import { createIpRateLimitService } from '../../../lib/attempt-rate-limit';

export class SignupIpRateLimitService extends Effect.Service<SignupIpRateLimitService>()('SignupIpRateLimitService', {
  effect: createIpRateLimitService({
    limit: SIGNUP_IP_LIMIT,
    windowSeconds: SIGNUP_IP_WINDOW_SECONDS,
    serviceName: 'SignupIpRateLimitService',
  }),
  accessors: true,
}) {}
