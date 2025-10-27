import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';
import {
  CycleActorErrorSchema,
  CycleInProgressErrorSchema,
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
    // POST /cycle/orleans - Create cycle (Orleans)
    // Grain ID is automatically extracted from authenticated user ID
    HttpApiEndpoint.post('createCycleOrleans', '/cycle/orleans')
      .setPayload(CreateCycleOrleansSchema)
      .addSuccess(CycleResponseSchema, { status: 201 })
      .addError(CycleInProgressErrorSchema, { status: 409 })
      .addError(CycleActorErrorSchema, { status: 500 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(OrleansClientErrorSchema, { status: 500 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .middleware(Authentication),
  )
  .add(
    // GET /cycle/orleans/:id - Get cycle state (Orleans)
    HttpApiEndpoint.get('getCycleStateOrleans', '/cycle/orleans/:id')
      .setPath(S.Struct({ id: S.String }))
      .addSuccess(CycleResponseSchema, { status: 200 })
      .addError(CycleActorErrorSchema, { status: 404 })
      .addError(OrleansClientErrorSchema, { status: 500 }),
  )
  .add(
    // PUT /cycle/orleans/:id - Update cycle state (Orleans)
    HttpApiEndpoint.put('updateCycleOrleans', '/cycle/orleans/:id')
      .setPath(S.Struct({ id: S.String }))
      .setPayload(UpdateCycleOrleansSchema)
      .addSuccess(CycleResponseSchema, { status: 200 })
      .addError(CycleActorErrorSchema, { status: 500 })
      .addError(OrleansClientErrorSchema, { status: 500 }),
  ) {}

export class CycleApi extends HttpApi.make('cycle-api').add(CycleApiGroup) {}
