import { Effect } from 'effect';
import {
  PlanName,
  type PlanDescription,
  type PlanWithPeriods,
  MIN_PERIODS,
  MAX_PERIODS,
  MAX_PLAN_NAME_LENGTH,
} from '../../../plan/domain';
import { TemplatePeriodConfig } from '../plan-template.model';
import {
  type PlanTemplateCreationInput,
  PlanTemplateCreationDecision,
  type PlanTemplateDuplicationInput,
  PlanTemplateDuplicationDecision,
  type PlanTemplateUpdateInput,
  PlanTemplateUpdateDecision,
  type PlanTemplateDeletionInput,
  PlanTemplateDeletionDecision,
  type PlanTemplateApplicationInput,
  PlanTemplateApplicationDecision,
} from '../contracts';

// ============================================================================
// FUNCTIONAL CORE — Pure functions (no I/O, no Effect error signaling, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for direct use and testing)
// and wrapped in an Effect.Service for dependency injection.
// ============================================================================

/**
 * Decide whether a plan template can be created based on the user's current
 * template count vs the maximum allowed.
 */
export const decidePlanTemplateCreation = (input: PlanTemplateCreationInput): PlanTemplateCreationDecision => {
  if (input.currentCount >= input.maxTemplates) {
    return PlanTemplateCreationDecision.LimitReached({
      currentCount: input.currentCount,
      maxTemplates: input.maxTemplates,
    });
  }
  return PlanTemplateCreationDecision.CanCreate();
};

/**
 * Decide whether a plan template can be duplicated based on the user's current
 * template count vs the maximum allowed.
 */
export const decidePlanTemplateDuplication = (input: PlanTemplateDuplicationInput): PlanTemplateDuplicationDecision => {
  if (input.currentCount >= input.maxTemplates) {
    return PlanTemplateDuplicationDecision.LimitReached({
      currentCount: input.currentCount,
      maxTemplates: input.maxTemplates,
    });
  }
  return PlanTemplateDuplicationDecision.CanDuplicate();
};

/**
 * Decide whether a plan template update is valid based on the new period count.
 */
export const decidePlanTemplateUpdate = (input: PlanTemplateUpdateInput): PlanTemplateUpdateDecision => {
  if (input.periodCount < MIN_PERIODS || input.periodCount > MAX_PERIODS) {
    return PlanTemplateUpdateDecision.InvalidPeriodCount({
      periodCount: input.periodCount,
      minPeriods: MIN_PERIODS,
      maxPeriods: MAX_PERIODS,
    });
  }
  return PlanTemplateUpdateDecision.CanUpdate();
};

/**
 * Decide whether a plan template can be deleted based on existence/ownership.
 */
export const decidePlanTemplateDeletion = (input: PlanTemplateDeletionInput): PlanTemplateDeletionDecision => {
  if (!input.exists) {
    return PlanTemplateDeletionDecision.TemplateNotFound({
      planTemplateId: input.planTemplateId,
    });
  }

  return PlanTemplateDeletionDecision.CanDelete();
};

/**
 * Decide whether a plan template can be applied (used to create a new plan).
 * Checks that the template has at least one period config.
 * Plan creation rules (active plan limit, cycle conflict) are evaluated
 * downstream by existing PlanCreationDecision.
 */
export const decidePlanTemplateApplication = (input: PlanTemplateApplicationInput): PlanTemplateApplicationDecision => {
  if (input.periodConfigs.length === 0) {
    return PlanTemplateApplicationDecision.EmptyTemplate({
      planTemplateId: input.planTemplateId,
    });
  }
  return PlanTemplateApplicationDecision.CanApply({
    periodConfigs: input.periodConfigs,
  });
};

/**
 * Extract template configuration from an existing plan with periods.
 * Strips date fields and identity, keeping only the reusable config.
 */
export const extractTemplateFromPlan = (
  plan: PlanWithPeriods,
): {
  name: PlanName;
  description: PlanDescription | null;
  periods: ReadonlyArray<TemplatePeriodConfig>;
} => ({
  name: plan.name,
  description: plan.description,
  periods: plan.periods.map(
    (p) =>
      new TemplatePeriodConfig({
        order: p.order,
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      }),
  ),
});

/**
 * Build a duplicate name by appending " (copy)" to the original name.
 * Truncates the base name if the result would exceed MAX_PLAN_NAME_LENGTH.
 */
export const buildDuplicateName = (name: PlanName): PlanName => {
  const suffix = ' (copy)';
  const maxBase = MAX_PLAN_NAME_LENGTH - suffix.length;
  const base = name.length > maxBase ? name.slice(0, maxBase) : name;
  return PlanName(`${base}${suffix}`);
};

/**
 * Assign 1-based order to period inputs based on array position.
 * Used when the API receives periods without explicit order (e.g., template update).
 */
export const assignPeriodOrders = (
  periods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>,
): ReadonlyArray<{ order: number; fastingDuration: number; eatingWindow: number }> =>
  periods.map((p, i) => ({
    order: i + 1,
    fastingDuration: p.fastingDuration,
    eatingWindow: p.eatingWindow,
  }));

/**
 * Extract plain period inputs from TemplatePeriodConfig value objects.
 * Strips the order field, keeping only duration configs for PlanService.createPlan.
 */
export const toPeriodInputs = (
  periodConfigs: ReadonlyArray<TemplatePeriodConfig>,
): ReadonlyArray<{ fastingDuration: number; eatingWindow: number }> =>
  periodConfigs.map((p) => ({
    fastingDuration: p.fastingDuration,
    eatingWindow: p.eatingWindow,
  }));

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanTemplateDomainService {
  decidePlanTemplateCreation(input: PlanTemplateCreationInput): PlanTemplateCreationDecision;
  decidePlanTemplateDuplication(input: PlanTemplateDuplicationInput): PlanTemplateDuplicationDecision;
  decidePlanTemplateUpdate(input: PlanTemplateUpdateInput): PlanTemplateUpdateDecision;
  decidePlanTemplateDeletion(input: PlanTemplateDeletionInput): PlanTemplateDeletionDecision;
  decidePlanTemplateApplication(input: PlanTemplateApplicationInput): PlanTemplateApplicationDecision;
  extractTemplateFromPlan(plan: PlanWithPeriods): {
    name: PlanName;
    description: PlanDescription | null;
    periods: ReadonlyArray<TemplatePeriodConfig>;
  };
  buildDuplicateName(name: PlanName): PlanName;
  assignPeriodOrders(
    periods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>,
  ): ReadonlyArray<{ order: number; fastingDuration: number; eatingWindow: number }>;
  toPeriodInputs(
    periodConfigs: ReadonlyArray<TemplatePeriodConfig>,
  ): ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
}

export class PlanTemplateDomainService extends Effect.Service<PlanTemplateDomainService>()(
  'PlanTemplateDomainService',
  {
    effect: Effect.succeed({
      decidePlanTemplateCreation,
      decidePlanTemplateDuplication,
      decidePlanTemplateUpdate,
      decidePlanTemplateDeletion,
      decidePlanTemplateApplication,
      extractTemplateFromPlan,
      buildDuplicateName,
      assignPeriodOrders,
      toPeriodInputs,
    } satisfies IPlanTemplateDomainService),
    accessors: true,
  },
) {}
