/**
 * PlanTemplate Boundary Mappers — DTO ↔ Domain
 *
 * Pure transformations between API DTOs and domain types.
 * No Effect, no HTTP — just data mapping.
 */
import type { PlanTemplateResponse, PlanTemplateWithPeriodsResponse } from '@ketone/shared';
import {
  EatingWindow,
  FastingDuration,
  PeriodCount,
  PeriodOrder,
  PlanDescription,
  PlanName,
  type PlanTemplateDetail,
  PlanTemplateDetail as PlanTemplateDetailClass,
  type PlanTemplateId,
  PlanTemplateSummary,
  TemplatePeriodConfig,
} from '../domain/plan-template.model';

/**
 * Map a single API DTO to a PlanTemplateSummary domain type.
 * Branded types are applied during mapping.
 */
export const fromTemplateResponse = (dto: PlanTemplateResponse) =>
  new PlanTemplateSummary({
    id: dto.id as PlanTemplateId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    periodCount: PeriodCount(dto.periodCount),
    updatedAt: dto.updatedAt,
  });

/**
 * Map an API DTO array to PlanTemplateSummary[] domain types.
 */
export const fromTemplateListResponse = (dtos: ReadonlyArray<PlanTemplateResponse>) => dtos.map(fromTemplateResponse);

/**
 * Map a period config DTO to a TemplatePeriodConfig domain type.
 */
export const fromPeriodConfigResponse = (dto: { order: number; fastingDuration: number; eatingWindow: number }) =>
  new TemplatePeriodConfig({
    order: PeriodOrder(dto.order),
    fastingDuration: FastingDuration(dto.fastingDuration),
    eatingWindow: EatingWindow(dto.eatingWindow),
  });

/**
 * Map an API DTO with periods to a PlanTemplateDetail domain type.
 */
export const fromTemplateDetailResponse = (dto: PlanTemplateWithPeriodsResponse): PlanTemplateDetail =>
  new PlanTemplateDetailClass({
    id: dto.id as PlanTemplateId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    periodCount: PeriodCount(dto.periodCount),
    periods: dto.periods.map(fromPeriodConfigResponse),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map domain update input to API PATCH payload.
 * Pure function — always succeeds.
 */
export const toUpdatePayload = (input: {
  name: string;
  description: string | null;
  periods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
}) => ({
  name: input.name,
  description: input.description ?? '',
  periods: input.periods.map((p) => ({
    fastingDuration: p.fastingDuration,
    eatingWindow: p.eatingWindow,
  })),
});
