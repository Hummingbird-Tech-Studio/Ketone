import { Schema as S } from 'effect';
import { EmailSchema } from '@ketone/shared';

/**
 * JWT Payload Schema
 */
export class JwtPayload extends S.Class<JwtPayload>('JwtPayload')({
  userId: S.UUID,
  email: EmailSchema,
  iat: S.Number.pipe(S.int({ message: () => 'iat must be an integer' })),
  exp: S.Number.pipe(S.int({ message: () => 'exp must be an integer' })),
  passwordChangedAt: S.OptionFromSelf(S.Number.pipe(S.int({ message: () => 'passwordChangedAt must be an integer' }))),
}) {}
