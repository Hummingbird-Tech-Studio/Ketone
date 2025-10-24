import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  CycleActorErrorSchema,
  CycleRepositoryErrorSchema,
  OrleansClientErrorSchema,
} from './schemas';
import { CreateCycleOrleansSchema, UpdateCycleOrleansSchema } from './schemas';
import { CycleResponseSchema } from './schemas';

// ============================================================================
// API Contract definition.
// ============================================================================

export class CycleApiGroup extends HttpApiGroup.make('cycle')
  .add(
    // POST /cycle/orleans/:id - Create cycle (Orleans)
    HttpApiEndpoint.post('createCycleOrleans', '/cycle/orleans/:id')
      .setPath(S.Struct({ id: S.String }))
      .setPayload(CreateCycleOrleansSchema)
      .addSuccess(CycleResponseSchema)
      .addError(CycleActorErrorSchema)
      .addError(CycleRepositoryErrorSchema)
      .addError(OrleansClientErrorSchema),
  )
  .add(
    // GET /cycle/orleans/:id - Get cycle state (Orleans)
    HttpApiEndpoint.get('getCycleStateOrleans', '/cycle/orleans/:id')
      .setPath(S.Struct({ id: S.String }))
      .addSuccess(CycleResponseSchema)
      .addError(CycleActorErrorSchema)
      .addError(OrleansClientErrorSchema),
  )
  .add(
    // PUT /cycle/orleans/:id - Update cycle state (Orleans)
    HttpApiEndpoint.put('updateCycleOrleans', '/cycle/orleans/:id')
      .setPath(S.Struct({ id: S.String }))
      .setPayload(UpdateCycleOrleansSchema)
      .addSuccess(CycleResponseSchema)
      .addError(CycleActorErrorSchema)
      .addError(OrleansClientErrorSchema),
  ) {}

export class CycleApi extends HttpApi.make('cycle-api').add(CycleApiGroup) {}
