import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import {
  CreateCycleOrleansSchema,
  CycleActorErrorSchema,
  CycleRepositoryErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
  CycleResponseSchema,
  OrleansClientErrorSchema,
  UpdateCycleOrleansSchema,
  UpdateCycleDatesSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

// ============================================================================
// API Contract definition.
// ============================================================================

export class CycleApiGroup extends HttpApiGroup.make('cycle')
  .add(
    // POST /cycle/orleans - Create cycle (Orleans) with authentication
    HttpApiEndpoint.post('createCycleOrleans', '/cycle')
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
    // GET /cycle - Get current user's cycle state (requires authentication)
    HttpApiEndpoint.get('getCycleStateOrleans', '/cycle')
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleActorErrorSchema, { status: 404 })
      .addError(OrleansClientErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    // PATCH /cycle - Update cycle dates for in-progress cycle (requires authentication)
    HttpApiEndpoint.patch('updateCycleDates', '/cycle')
      .setPayload(UpdateCycleDatesSchema)
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleActorErrorSchema, { status: 404 })
      .addError(CycleIdMismatchErrorSchema, { status: 409 })
      .addError(CycleInvalidStateErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(OrleansClientErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    // POST /cycle/complete - Complete current user's cycle (requires authentication)
    HttpApiEndpoint.post('updateCycleOrleans', '/cycle/complete')
      .setPayload(UpdateCycleOrleansSchema)
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleActorErrorSchema, { status: 404 })
      .addError(CycleIdMismatchErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(OrleansClientErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
