import { Effect } from 'effect';
import { type Plan, type Period, type PeriodDates } from '../plan.model';
import { recalculatePeriodDates } from './period-calculation.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MetadataUpdateInput {
  readonly existingPlan: Plan;
  readonly existingPeriods: ReadonlyArray<Period>;
  readonly metadata: {
    readonly name?: string;
    readonly description?: string;
    readonly startDate?: Date;
  };
}

/**
 * Recalculated period with its original ID and updated date fields.
 * Only includes persistence-relevant fields (id + dates) — excludes
 * order/fastingDuration/eatingWindow since those don't change on startDate shift.
 */
export interface RecalculatedPeriodWithId extends PeriodDates {
  readonly id: string;
}

export interface MetadataUpdateResult {
  readonly planUpdate: {
    readonly name?: string;
    readonly description?: string | null;
    readonly startDate?: Date;
  };
  readonly recalculatedPeriods: ReadonlyArray<RecalculatedPeriodWithId> | null;
}

// ============================================================================
// FUNCTIONAL CORE — Pure metadata update logic (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported as standalone pure functions (for consumers that don't
// use dependency injection).
//
// Three Phases usage (in PlanService.updatePlanMetadata):
//   1. COLLECTION (Shell): Repository loads plan + periods from DB
//   2. LOGIC (Core):       computeMetadataUpdate normalizes description,
//                           detects startDate change, recalculates periods
//   3. PERSISTENCE (Shell): Repository persists update data (overlap check
//                           + period updates + plan update)
//
// Business rules:
//   - Empty/whitespace-only description is normalized to null
//   - If startDate changes, all periods are recalculated to maintain contiguity
//   - Recalculated periods preserve original period IDs
// ============================================================================

/**
 * Compute the metadata update data from the input.
 *
 * Pure function that normalizes description, detects startDate changes,
 * and recalculates periods if needed. No I/O, no Effect.
 *
 * @param input - MetadataUpdateInput with existingPlan, existingPeriods, metadata
 * @returns MetadataUpdateResult with planUpdate fields and optional recalculated periods
 */
export const computeMetadataUpdate = (input: MetadataUpdateInput): MetadataUpdateResult => {
  const { existingPlan, existingPeriods, metadata } = input;

  // Build plan update object
  const planUpdate: {
    name?: string;
    description?: string | null;
    startDate?: Date;
  } = {};

  if (metadata.name !== undefined) {
    planUpdate.name = metadata.name;
  }

  if (metadata.description !== undefined) {
    planUpdate.description = metadata.description.trim() === '' ? null : metadata.description;
  }

  if (metadata.startDate !== undefined) {
    planUpdate.startDate = metadata.startDate;
  }

  // Detect startDate change and recalculate periods if needed
  const startDateChanged =
    metadata.startDate !== undefined && metadata.startDate.getTime() !== existingPlan.startDate.getTime();

  if (startDateChanged && existingPeriods.length > 0) {
    // Sort by order to guarantee stable index-based ID mapping
    const sortedPeriods = [...existingPeriods].sort((a, b) => a.order - b.order);

    const durationInputs = sortedPeriods.map((p) => ({
      fastingDuration: p.fastingDuration as number,
      eatingWindow: p.eatingWindow as number,
    }));

    const recalculated = recalculatePeriodDates(metadata.startDate!, durationInputs);

    const recalculatedPeriods: RecalculatedPeriodWithId[] = recalculated.map((calc, index) => ({
      id: sortedPeriods[index]!.id as string,
      startDate: calc.startDate,
      endDate: calc.endDate,
      fastingStartDate: calc.fastingStartDate,
      fastingEndDate: calc.fastingEndDate,
      eatingStartDate: calc.eatingStartDate,
      eatingEndDate: calc.eatingEndDate,
    }));

    return { planUpdate, recalculatedPeriods };
  }

  return { planUpdate, recalculatedPeriods: null };
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanMetadataService {
  computeMetadataUpdate(input: MetadataUpdateInput): MetadataUpdateResult;
}

export class PlanMetadataService extends Effect.Service<PlanMetadataService>()('PlanMetadataService', {
  effect: Effect.succeed({
    computeMetadataUpdate,
  } satisfies IPlanMetadataService),
  accessors: true,
}) {}
