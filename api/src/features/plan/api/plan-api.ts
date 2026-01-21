import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  CreatePlanRequestSchema,
  PlanWithPeriodsResponseSchema,
  PlansListResponseSchema,
  PlanResponseSchema,
  PlanRepositoryErrorSchema,
  PlanAlreadyActiveErrorSchema,
  PlanNotFoundErrorSchema,
  NoActivePlanErrorSchema,
  PlanInvalidStateErrorSchema,
  ActiveCycleExistsErrorSchema,
  InvalidPeriodCountErrorSchema,
  PeriodOverlapWithCycleErrorSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class PlanApiGroup extends HttpApiGroup.make('plan')
  .add(
    HttpApiEndpoint.post('createPlan', '/v1/plans')
      .setPayload(CreatePlanRequestSchema)
      .addSuccess(PlanWithPeriodsResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanAlreadyActiveErrorSchema, { status: 409 })
      .addError(ActiveCycleExistsErrorSchema, { status: 409 })
      .addError(PeriodOverlapWithCycleErrorSchema, { status: 409 })
      .addError(InvalidPeriodCountErrorSchema, { status: 422 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('getActivePlan', '/v1/plans/active')
      .addSuccess(PlanWithPeriodsResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(NoActivePlanErrorSchema, { status: 404 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('getPlan', '/v1/plans/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(PlanWithPeriodsResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanNotFoundErrorSchema, { status: 404 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('listPlans', '/v1/plans')
      .addSuccess(PlansListResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post('cancelPlan', '/v1/plans/:id/cancel')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(PlanResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanNotFoundErrorSchema, { status: 404 })
      .addError(PlanInvalidStateErrorSchema, { status: 409 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.del('deletePlan', '/v1/plans/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(S.Void, { status: 204 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanNotFoundErrorSchema, { status: 404 })
      .addError(PlanInvalidStateErrorSchema, { status: 409 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
