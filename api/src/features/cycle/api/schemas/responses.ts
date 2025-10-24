import { Schema as S } from 'effect';
import { CycleStateSchema } from '../../domain';

/**
 * Response Schemas
 *
 * These schemas define the structure of HTTP API responses.
 * They are used to validate and type outgoing data.
 */

export const CycleResponseSchema = S.Struct({
  actorId: S.String,
  state: S.String,
  cycle: S.Struct({
    id: S.NullOr(S.String),
    startDate: S.NullOr(S.DateFromSelf),
    endDate: S.NullOr(S.DateFromSelf),
  }),
});

/**
 * Dapr Actor State Response Schema
 * Used for decoding Dapr actor method responses
 */
const CycleIdSchema = S.UUID.pipe(S.brand('CycleId'));

export const CycleActorStateResponseSchema = S.Struct({
  value: CycleStateSchema,
  context: S.Struct({
    id: S.NullOr(CycleIdSchema),
    actorId: S.NullOr(S.String),
    startDate: S.NullOr(S.Date),
    endDate: S.NullOr(S.Date),
  }),
});
