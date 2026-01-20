import { KeyValueStore } from '@effect/platform';
import { BunKeyValueStore } from '@effect/platform-bun';
import { Layer, Schema as S } from 'effect';
import { PlanWithPeriodsRecordSchema } from '../repositories';

// Schema for KeyValueStore serialization with metadata
export const PlanKVSchema = S.Struct({
  ...PlanWithPeriodsRecordSchema.fields,
  cachedAt: S.DateFromSelf,
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
