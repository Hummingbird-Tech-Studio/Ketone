import { Schema as S } from 'effect';

export const CycleStatusSchema = S.Literal('InProgress', 'Completed');

const CycleDataSchema = S.Struct({
  userId: S.String,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf, // DB returns Date objects, not strings
  endDate: S.DateFromSelf,
});

export const CycleRecordSchema = S.Struct({
  id: S.String,
  userId: S.String,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf, // DB returns Date objects, not strings
  endDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Type inference from schemas
export type CycleData = S.Schema.Type<typeof CycleDataSchema>;
