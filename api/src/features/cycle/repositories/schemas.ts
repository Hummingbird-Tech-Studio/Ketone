import { Schema as S } from 'effect';

const CycleDataSchema = S.Struct({
  actorId: S.String,
  startDate: S.DateFromSelf, // DB returns Date objects, not strings
  endDate: S.DateFromSelf,
});

export const CycleRecordSchema = S.Struct({
  id: S.String,
  actorId: S.String,
  startDate: S.DateFromSelf, // DB returns Date objects, not strings
  endDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Type inference from schemas
export type CycleData = S.Schema.Type<typeof CycleDataSchema>;
