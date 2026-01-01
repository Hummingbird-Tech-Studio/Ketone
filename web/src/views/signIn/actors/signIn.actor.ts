// Re-export everything from shared
export {
  signInMachine,
  SignInState,
  Event,
  Emit,
  type EmitType,
} from '@ketone/shared/actors/signIn.actor';

// Re-export SignInSuccess from the service for backward compatibility
export type { SignInSuccess } from '@ketone/shared/services/sign-in.service';
