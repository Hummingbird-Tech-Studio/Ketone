import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiError } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  CycleActorErrorSchema,
  CycleRepositoryErrorSchema,
  OrleansClientErrorSchema,
  CycleAlreadyInProgressErrorSchema,
} from './schemas';
import { CreateCycleOrleansSchema, UpdateCycleOrleansSchema } from './schemas';
import { CycleResponseSchema } from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

// ============================================================================
// API Contract definition.
// ============================================================================

export class CycleApiGroup extends HttpApiGroup.make('cycle')
  .add(
    // POST /cycle/orleans - Create cycle (Orleans) with authentication
    HttpApiEndpoint.post('createCycleOrleans', '/cycle/orleans')
      .setPayload(CreateCycleOrleansSchema)
      .addSuccess(CycleResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleAlreadyInProgressErrorSchema, { status: 409 })
      .addError(CycleActorErrorSchema, { status: 500 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(OrleansClientErrorSchema, { status: 500 })
      .middleware(Authentication),
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
