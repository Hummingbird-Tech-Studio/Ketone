// Public exports for @ketone/shared

// Constants
export {
  // Password change rate limiting
  MAX_PASSWORD_ATTEMPTS,
  LOCKOUT_DURATION_SECONDS,
  ATTEMPT_DELAYS_SECONDS,
  getAttemptDelaySeconds,
  // Login rate limiting
  MAX_LOGIN_ATTEMPTS,
  LOGIN_ATTEMPT_DELAYS_SECONDS,
  getLoginAttemptDelaySeconds,
  // Password reset IP rate limiting
  PASSWORD_RESET_IP_LIMIT,
  PASSWORD_RESET_IP_WINDOW_SECONDS,
  // Signup IP rate limiting
  SIGNUP_IP_LIMIT,
  SIGNUP_IP_WINDOW_SECONDS,
} from './constants';

// Request validation schemas
export { EmailSchema } from './schemas/email';
export { PasswordSchema } from './schemas/password';
export { NotesSchema, NOTES_MAX_LENGTH } from './schemas/notes';
export { TimezoneSchema } from './schemas/timezone';

// Auth response schemas
export {
  UserResponseSchema,
  SignupResponseSchema,
  LoginResponseSchema,
  UpdatePasswordResponseSchema,
  ForgotPasswordResponseSchema,
  ResetPasswordResponseSchema,
} from './schemas/auth';

// Cycle response schemas
export {
  FastingFeelingSchema,
  FASTING_FEELINGS,
  MAX_FEELINGS_PER_CYCLE,
  type FastingFeeling,
  CycleResponseSchema,
  AdjacentCycleSchema,
  CycleDetailResponseSchema,
  ValidateOverlapResponseSchema,
  CycleStatisticsItemSchema,
  CycleStatisticsResponseSchema,
  STATISTICS_PERIOD,
  PeriodTypeSchema,
  type AdjacentCycle,
  type CycleDetailResponse,
  type CycleStatisticsItem,
  type PeriodType,
} from './schemas/cycle';

// Profile response schemas
export {
  ProfileResponseSchema,
  type ProfileResponse,
  NullableProfileResponseSchema,
  type NullableProfileResponse,
  GenderSchema,
  type Gender,
  WeightUnitSchema,
  type WeightUnit,
  HeightUnitSchema,
  type HeightUnit,
  PhysicalInfoResponseSchema,
  type PhysicalInfoResponse,
  NullablePhysicalInfoResponseSchema,
  type NullablePhysicalInfoResponse,
} from './schemas/profile';

// Version response schemas
export { VersionResponseSchema } from './schemas/version';

// HTTP Status Constants
export { HttpStatus, type HttpStatusCode } from './constants/http-status';

// Effect Utilities
export { runWithUi, runStreamWithUi } from './utils/effects/helpers';

// HTTP Error Utilities
export {
  extractErrorMessage,
  ValidationError,
  ServerError,
  UnauthorizedError,
  InvalidPasswordError,
  TooManyRequestsError,
  handleUnauthorizedResponse,
  handleValidationErrorResponse,
  handleServerErrorResponse,
  handleInvalidPasswordResponse,
  handleTooManyRequestsResponse,
} from './services/http/errors';

// HTTP Client
export {
  API_BASE_URL,
  HttpClientLive,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  type HttpClientError,
} from './services/http/http-client.service';

// Sign-In Service
export {
  SignInService,
  SignInServiceLive,
  programSignIn,
  InvalidCredentialsError,
  type SignInSuccess,
  type SignInError,
} from './services/sign-in.service';

// Sign-In Actor
export {
  signInMachine,
  SignInState,
  Event as SignInEvent,
  Emit as SignInEmit,
  type EmitType as SignInEmitType,
} from './actors/signIn.actor';

// Authentication Actor Factory
export {
  createAuthenticationMachine,
  State as AuthState,
  Event as AuthEvent,
  Emit as AuthEmit,
  type AuthSession,
  type StoragePrograms,
  type EmitType as AuthEmitType,
  type AuthenticationMachine,
  type AuthenticationActor,
} from './actors/authentication.actor';

// HTTP Interceptor Factory
export {
  create401Interceptor,
  createHttpClientWith401Interceptor,
} from './services/http/http-interceptor';

// Authenticated HTTP Client Factory
export {
  createAuthenticatedHttpClient,
  type AuthSessionServiceInterface,
  type AuthenticatedHttpClientType,
} from './services/http/authenticated-http-client.service';
