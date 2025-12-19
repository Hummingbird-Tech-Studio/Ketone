import { Schema as S } from 'effect';
import { FastingFeelingSchema } from '@ketone/shared';

export const CycleStatusSchema = S.Literal('InProgress', 'Completed');

const CycleDataSchema = S.Struct({
  userId: S.UUID,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  notes: S.optional(S.NullOr(S.String)),
});

export const CycleRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  notes: S.NullOr(S.String),
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

export const CycleFeelingRecordSchema = S.Struct({
  id: S.UUID,
  cycleId: S.UUID,
  feeling: FastingFeelingSchema,
  createdAt: S.DateFromSelf,
});

export const CycleWithFeelingsRecordSchema = S.Struct({
  ...CycleRecordSchema.fields,
  feelings: S.Array(FastingFeelingSchema),
});

// Type inference from schemas
export type CycleData = S.Schema.Type<typeof CycleDataSchema>;
export type CycleRecord = S.Schema.Type<typeof CycleRecordSchema>;
export type CycleFeelingRecord = S.Schema.Type<typeof CycleFeelingRecordSchema>;
export type CycleWithFeelingsRecord = S.Schema.Type<typeof CycleWithFeelingsRecordSchema>;
