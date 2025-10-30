import { Schema as S } from 'effect';

/**
 * Cycle Response Schema
 */
export const CycleResponseSchema = S.Struct({
  userId: S.String,
  state: S.String,
  cycle: S.Struct({
    id: S.NullOr(S.String),
    startDate: S.NullOr(S.Date),
    endDate: S.NullOr(S.Date),
  }),
});
