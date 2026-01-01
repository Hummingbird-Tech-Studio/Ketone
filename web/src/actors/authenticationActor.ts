import { programCheckSession, programRemoveSession, programStoreSession } from '@/services/auth/auth-session.service';
import {
  createAuthenticationMachine,
  State,
  Event,
  Emit,
  type AuthSession,
  type EmitType,
  type AuthenticationMachine,
  type AuthenticationActor,
} from '@ketone/shared/actors/authentication.actor';
import { createActor } from 'xstate';

// Re-export enums and types for consumers
export { State, Event, Emit };
export type { AuthSession, EmitType, AuthenticationMachine, AuthenticationActor };

// Create the authentication machine using the factory with web's storage programs
export const authenticationMachine = createAuthenticationMachine({
  programCheckSession,
  programStoreSession,
  programRemoveSession,
});

export const authenticationActor = createActor(authenticationMachine);
