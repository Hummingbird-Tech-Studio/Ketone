import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  CreatePlanTemplateRequestSchema,
  UpdatePlanTemplateRequestSchema,
  ApplyPlanTemplateRequestSchema,
  PlanTemplateWithPeriodsResponseSchema,
  PlanTemplatesListResponseSchema,
  PlanWithPeriodsResponseSchema,
  PlanTemplateRepositoryErrorSchema,
  PlanTemplateNotFoundErrorSchema,
  PlanTemplateLimitReachedErrorSchema,
  PlanTemplateInvalidPeriodCountErrorSchema,
  PlanNotFoundErrorSchema,
  PlanAlreadyActiveErrorSchema,
  ActiveCycleExistsErrorSchema,
  PeriodOverlapWithCycleErrorSchema,
  PlanRepositoryErrorSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class PlanTemplateApiGroup extends HttpApiGroup.make('planTemplate')
  .add(
    HttpApiEndpoint.post('createPlanTemplate', '/v1/plan-templates')
      .setPayload(CreatePlanTemplateRequestSchema)
      .addSuccess(PlanTemplateWithPeriodsResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanNotFoundErrorSchema, { status: 404 })
      .addError(PlanTemplateLimitReachedErrorSchema, { status: 409 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('listPlanTemplates', '/v1/plan-templates')
      .addSuccess(PlanTemplatesListResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('getPlanTemplate', '/v1/plan-templates/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(PlanTemplateWithPeriodsResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanTemplateNotFoundErrorSchema, { status: 404 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.patch('updatePlanTemplate', '/v1/plan-templates/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .setPayload(UpdatePlanTemplateRequestSchema)
      .addSuccess(PlanTemplateWithPeriodsResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanTemplateNotFoundErrorSchema, { status: 404 })
      .addError(PlanTemplateInvalidPeriodCountErrorSchema, { status: 422 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.del('deletePlanTemplate', '/v1/plan-templates/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(S.Void)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanTemplateNotFoundErrorSchema, { status: 404 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post('duplicatePlanTemplate', '/v1/plan-templates/:id/duplicate')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(PlanTemplateWithPeriodsResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanTemplateNotFoundErrorSchema, { status: 404 })
      .addError(PlanTemplateLimitReachedErrorSchema, { status: 409 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post('applyPlanTemplate', '/v1/plan-templates/:id/apply')
      .setPath(S.Struct({ id: S.UUID }))
      .setPayload(ApplyPlanTemplateRequestSchema)
      .addSuccess(PlanWithPeriodsResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanTemplateNotFoundErrorSchema, { status: 404 })
      .addError(PlanAlreadyActiveErrorSchema, { status: 409 })
      .addError(ActiveCycleExistsErrorSchema, { status: 409 })
      .addError(PeriodOverlapWithCycleErrorSchema, { status: 409 })
      .addError(PlanTemplateRepositoryErrorSchema, { status: 500 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
