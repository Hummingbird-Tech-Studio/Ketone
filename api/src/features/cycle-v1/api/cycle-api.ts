import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  CreateCycleSchema,
  UpdateCycleDatesSchema,
  CompleteCycleSchema,
  CycleRepositoryErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleNotFoundErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
  CycleOverlapErrorSchema,
  CycleResponseSchema,
  ValidateOverlapResponseSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class CycleApiGroup extends HttpApiGroup.make('cycle-v1')
  .add(
    HttpApiEndpoint.get('getCycle', '/v1/cycles/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post('createCycle', '/v1/cycles')
      .setPayload(CreateCycleSchema)
      .addSuccess(CycleResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleAlreadyInProgressErrorSchema, { status: 409 })
      .addError(CycleOverlapErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.patch('updateCycleDates', '/v1/cycles/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .setPayload(UpdateCycleDatesSchema)
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleIdMismatchErrorSchema, { status: 409 })
      .addError(CycleInvalidStateErrorSchema, { status: 409 })
      .addError(CycleOverlapErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post('completeCycle', '/v1/cycles/:id/complete')
      .setPath(S.Struct({ id: S.UUID }))
      .setPayload(CompleteCycleSchema)
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleInvalidStateErrorSchema, { status: 409 })
      .addError(CycleOverlapErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post('validateCycleOverlap', '/v1/cycles/:id/validate-overlap')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(ValidateOverlapResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleIdMismatchErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
