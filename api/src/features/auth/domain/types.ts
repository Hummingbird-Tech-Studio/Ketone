import { Schema as S } from 'effect';

/**
 * Reusable email validation schema
 */
export const EmailSchema = S.String.pipe(
  S.maxLength(255, { message: () => 'Email must be at most 255 characters long' }),
  S.filter(
    (email) => {
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
      return emailRegex.test(email);
    },
    { message: () => 'Invalid email format' },
  ),
  S.filter((email) => !email.includes('..'), {
    message: () => 'Email cannot contain consecutive dots',
  }),
  S.filter((email) => !email.includes('.@'), {
    message: () => 'Email cannot have a dot immediately before @',
  }),
  S.filter((email) => !email.startsWith('.'), {
    message: () => 'Email cannot start with a dot',
  }),
);

/**
 * User Schema
 */
export class User extends S.Class<User>('User')({
  id: S.String.pipe(S.minLength(1)),
  email: EmailSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
}) {}

/**
 * JWT Payload Schema
 */
export class JwtPayload extends S.Class<JwtPayload>('JwtPayload')({
  userId: S.String.pipe(S.minLength(1)),
  email: EmailSchema,
  iat: S.Number.pipe(S.int({ message: () => 'iat must be an integer' })),
  exp: S.Number.pipe(S.int({ message: () => 'exp must be an integer' })),
}) {}

/**
 * Signup Request Schema
 */
export class SignupRequest extends S.Class<SignupRequest>('SignupRequest')({
  email: EmailSchema,
  password: S.String.pipe(S.minLength(1)),
}) {}

/**
 * Signup Response Schema
 */
export class SignupResponse extends S.Class<SignupResponse>('SignupResponse')({
  user: User,
}) {}
