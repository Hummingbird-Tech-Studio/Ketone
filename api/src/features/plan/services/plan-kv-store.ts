import { KeyValueStore } from '@effect/platform';
import { BunKeyValueStore } from '@effect/platform-bun';
import { Layer, Schema as S } from 'effect';
import { PlanStatusSchema, PeriodStatusSchema } from '@ketone/shared';

/**
 * Schema for KeyValueStore JSON serialization.
 *
 * Uses S.Date instead of S.DateFromSelf because:
 * - BunKeyValueStore.layerFileSystem() serializes to JSON
 * - JSON.stringify(Date) produces ISO strings (e.g., "2026-01-20T22:48:04.041Z")
 * - S.DateFromSelf expects Date objects and fails on ISO strings
 * - S.Date accepts ISO strings and converts them to Date objects on parse
 */
const PeriodKVSchema = S.Struct({
  id: S.UUID,
  planId: S.UUID,
  order: S.Number,
  fastingDuration: S.Number,
  eatingWindow: S.Number,
  startDate: S.Date,
  endDate: S.Date,
  status: PeriodStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
});

const PlanKVBaseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  startDate: S.Date,
  status: PlanStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
  periods: S.Array(PeriodKVSchema),
});

// Schema for KeyValueStore serialization with metadata
export const PlanKVSchema = S.Struct({
  ...PlanKVBaseSchema.fields,
  cachedAt: S.Date,
});

export type PlanKVRecord = S.Schema.Type<typeof PlanKVSchema>;

// Key prefix for active plans
export const PLAN_KEY_PREFIX = 'plan:active:';

export const createPlanKey = (userId: string): string => `${PLAN_KEY_PREFIX}${userId}`;

// SchemaStore for type-safe plan storage
export const PlanSchemaStore = KeyValueStore.layerSchema(PlanKVSchema, 'PlanSchemaStore');

// File-system backed KeyValueStore layer
export const PLANS_DATA_DIRECTORY = './data/plans';

export const PlanKeyValueStoreLive = BunKeyValueStore.layerFileSystem(PLANS_DATA_DIRECTORY);

// Combined layer: SchemaStore + FileSystem backing
export const PlanSchemaStoreLive = PlanSchemaStore.layer.pipe(Layer.provide(PlanKeyValueStoreLive));
