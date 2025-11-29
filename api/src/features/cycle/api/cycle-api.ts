import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  CreateCycleSchema,
  UpdateCycleDatesSchema,
  CompleteCycleSchema,
  GetCycleStatisticsQuerySchema,
  CycleRepositoryErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleNotFoundErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
  CycleOverlapErrorSchema,
  CycleRefCacheErrorSchema,
  CycleResponseSchema,
  CycleDetailResponseSchema,
  ValidateOverlapResponseSchema,
  CycleStatisticsResponseSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class CycleApiGroup extends HttpApiGroup.make('cycle')
  .add(
    HttpApiEndpoint.get('getCycle', '/v1/cycles/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(CycleDetailResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(CycleRefCacheErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('getCycleInProgress', '/v1/cycles/in-progress')
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(CycleRefCacheErrorSchema, { status: 500 })
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
      .addError(CycleRefCacheErrorSchema, { status: 500 })
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
      .addError(CycleRefCacheErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.patch('updateCompletedCycleDates', '/v1/cycles/:id/completed')
      .setPath(S.Struct({ id: S.UUID }))
      .setPayload(UpdateCycleDatesSchema)
      .addSuccess(CycleResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
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
      .addError(CycleIdMismatchErrorSchema, { status: 409 })
      .addError(CycleInvalidStateErrorSchema, { status: 409 })
      .addError(CycleOverlapErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .addError(CycleRefCacheErrorSchema, { status: 500 })
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
      .addError(CycleRefCacheErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('getValidationStream', '/v1/cycles/validation-stream')
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleRepositoryErrorSchema, { status: 500 }),
    // Note: Authentication is handled manually in the handler via query parameter token
    // WebSocket doesn't support Authorization headers in browsers
    // WebSocket endpoint returns empty response after establishing connection
  )
  .add(
    HttpApiEndpoint.get('getCycleStatistics', '/v1/cycles/statistics')
      .setUrlParams(GetCycleStatisticsQuerySchema)
      .addSuccess(CycleStatisticsResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.del('deleteCycle', '/v1/cycles/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(S.Void, { status: 204 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(CycleNotFoundErrorSchema, { status: 404 })
      .addError(CycleInvalidStateErrorSchema, { status: 409 })
      .addError(CycleRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
