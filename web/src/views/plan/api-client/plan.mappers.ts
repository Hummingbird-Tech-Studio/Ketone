/**
 * Plan Boundary Mappers — DTO ↔ Domain
 *
 * Pure transformations between API DTOs and domain types.
 * No Effect, no HTTP — just data mapping.
 */
import type { CreatePlanInput, UpdateMetadataInput, UpdatePeriodsInput } from '@/views/plan/domain';
import {
  EatingWindow,
  FastingDuration,
  PeriodCount,
  type PeriodId,
  PeriodOrder,
  PlanDescription,
  PlanDetail,
  type PlanId,
  PlanName,
  PlanPeriod,
  PlanSummary,
} from '@/views/plan/domain';
import type { PeriodResponse, PlanResponse, PlanWithPeriodsResponse } from '@ketone/shared';

/**
 * Map a period DTO to a PlanPeriod domain type.
 * Branded types are applied during mapping.
 */
export const fromPeriodResponse = (dto: PeriodResponse) =>
  new PlanPeriod({
    id: dto.id as PeriodId,
    planId: dto.planId as PlanId,
    order: PeriodOrder(dto.order),
    fastingDuration: FastingDuration(dto.fastingDuration),
    eatingWindow: EatingWindow(dto.eatingWindow),
    startDate: dto.startDate,
    endDate: dto.endDate,
    fastingStartDate: dto.fastingStartDate,
    fastingEndDate: dto.fastingEndDate,
    eatingStartDate: dto.eatingStartDate,
    eatingEndDate: dto.eatingEndDate,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map a plan response DTO to a PlanSummary domain type.
 * Used for list endpoints.
 */
export const fromPlanResponse = (dto: PlanResponse) =>
  new PlanSummary({
    id: dto.id as PlanId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    status: dto.status,
    startDate: dto.startDate,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map a plan-with-periods DTO to a PlanDetail domain type.
 */
export const fromPlanWithPeriodsResponse = (dto: PlanWithPeriodsResponse) =>
  new PlanDetail({
    id: dto.id as PlanId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    status: dto.status,
    startDate: dto.startDate,
    periodCount: PeriodCount(dto.periods.length),
    periods: dto.periods.map(fromPeriodResponse),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map domain CreatePlanInput to API payload.
 * Pure function — always succeeds.
 */
export const toCreatePlanPayload = (input: CreatePlanInput) => ({
  name: input.name,
  description: (input.description as string | null) ?? undefined,
  startDate: input.startDate,
  periods: input.periods.map((p) => ({
    fastingDuration: p.fastingDuration,
    eatingWindow: p.eatingWindow,
  })),
});

/**
 * Map domain UpdateMetadataInput to API payload.
 * Only includes fields that are defined.
 */
export const toUpdateMetadataPayload = (input: UpdateMetadataInput) => {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name as string;
  if (input.description !== undefined) payload.description = (input.description as string | null) ?? '';
  if (input.startDate !== undefined) payload.startDate = input.startDate;
  return payload;
};

/**
 * Map domain UpdatePeriodsInput to API payload.
 */
export const toUpdatePeriodsPayload = (input: UpdatePeriodsInput) => ({
  periods: input.periods.map((p) => ({
    ...(p.id !== undefined ? { id: p.id as string } : {}),
    fastingDuration: p.fastingDuration as number,
    eatingWindow: p.eatingWindow as number,
  })),
});
