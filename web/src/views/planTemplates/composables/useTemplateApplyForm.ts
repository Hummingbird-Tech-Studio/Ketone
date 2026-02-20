/**
 * Template Apply Form Composable (Input Shell)
 *
 * Manages form state for applying a template to create a plan.
 * Owns draft state for plan name/description, period configs, and start date.
 * Provides input builders for both plan creation and timeline saving.
 */
import type { PeriodConfig } from '@/components/Timeline';
import { usePeriodManager } from '@/views/plan/composables/usePeriodManager';
import { useStartDateSync } from '@/views/plan/composables/useStartDateSync';
import {
  clonePeriodConfigs,
  createContiguousPeriodsFromDurations,
  type CreatePlanInput,
  hasPeriodDurationsChanged,
} from '@/views/plan/domain';
import { validateCreatePlanInput } from '@/views/plan/input-validation/create-plan-input.mapper';
import type { PlanTemplateDetail } from '@/views/planTemplates/domain';
import {
  type UpdateTemplateDomainInput,
  validateUpdateTemplateInput,
} from '@/views/planTemplates/input-validation/update-template-input.mapper';
import { Either } from 'effect';
import { computed, ref, type Ref, watch } from 'vue';

/**
 * Convert period durations to PeriodConfig[] with synthetic start times for the Timeline component.
 * Accepts both TemplatePeriodConfig (from server) and PeriodDuration (from router state).
 */
function periodDurationsToPeriodConfigs(
  periods: ReadonlyArray<{ readonly fastingDuration: number; readonly eatingWindow: number }>,
  baseDate: Date,
): PeriodConfig[] {
  return createContiguousPeriodsFromDurations(periods, baseDate).map((p) => ({
    id: crypto.randomUUID(),
    ...p,
  }));
}

export interface PeriodDuration {
  fastingDuration: number;
  eatingWindow: number;
}

export interface UseTemplateApplyFormOptions {
  /** Override periods from router state (unsaved edits from Edit view) */
  overridePeriods?: PeriodDuration[];
}

export function useTemplateApplyForm(
  template: Ref<PlanTemplateDetail | null>,
  options: UseTemplateApplyFormOptions = {},
) {
  // Draft state for the plan (local — not saved to template)
  const planName = ref('');
  const planDescription = ref('');
  const periodConfigs = ref<PeriodConfig[]>([]);
  const startDate = ref(new Date());

  // Original period state (for reset + hasTimelineChanges)
  const originalPeriodConfigs = ref<PeriodConfig[]>([]);

  // One-time initialization flag
  const isInitialized = ref(false);

  /** Initialize form state from template data */
  const initFromTemplate = (t: PlanTemplateDetail) => {
    planName.value = t.name;
    planDescription.value = t.description ?? '';

    // Use override periods (from Edit view) if provided, otherwise template periods
    const periods = options.overridePeriods ?? t.periods;
    periodConfigs.value = periodDurationsToPeriodConfigs(periods, startDate.value);
    // Original = template's saved periods (for change detection + reset)
    const originalConfigs = periodDurationsToPeriodConfigs(t.periods, startDate.value);
    originalPeriodConfigs.value = clonePeriodConfigs(originalConfigs);
  };

  // Initialize from template only once (first load)
  watch(
    template,
    (t) => {
      if (!t || isInitialized.value) return;
      isInitialized.value = true;
      initFromTemplate(t);
    },
    { immediate: true },
  );

  // Bidirectional sync between startDate and first period's startTime
  useStartDateSync(startDate, periodConfigs);

  const hasTimelineChanges = computed(() =>
    hasPeriodDurationsChanged(originalPeriodConfigs.value, periodConfigs.value),
  );

  // Input Builders

  /** Build input for creating a plan from the current template + period configs */
  const buildCreatePlanInput = (): CreatePlanInput | null => {
    const firstPeriod = periodConfigs.value[0];
    if (!firstPeriod) return null;

    const result = validateCreatePlanInput({
      name: planName.value,
      description: planDescription.value,
      startDate: firstPeriod.startTime,
      periods: periodConfigs.value.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    });

    return Either.isRight(result) ? result.right : null;
  };

  /** Build input for saving timeline changes back to the template */
  const buildTimelineUpdateInput = (): UpdateTemplateDomainInput | null => {
    if (!template.value) return null;

    const result = validateUpdateTemplateInput({
      name: template.value.name,
      description: template.value.description ?? '',
      periods: periodConfigs.value.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    });

    return Either.isRight(result) ? result.right : null;
  };

  const { addPeriod, removePeriod } = usePeriodManager(periodConfigs);

  /** Reset periods to original template values */
  const reset = () => {
    periodConfigs.value = clonePeriodConfigs(originalPeriodConfigs.value);
  };

  /** Sync timeline from server after successful timeline save */
  const syncTimelineFromServer = (t: PlanTemplateDetail) => {
    const configs = periodDurationsToPeriodConfigs(t.periods, startDate.value);
    periodConfigs.value = configs;
    originalPeriodConfigs.value = clonePeriodConfigs(configs);
  };

  return {
    // Draft state
    planName,
    planDescription,
    periodConfigs,
    startDate,

    // Change detection
    hasTimelineChanges,

    // Period management
    addPeriod,
    removePeriod,

    // Input builders
    buildCreatePlanInput,
    buildTimelineUpdateInput,

    // Reset & sync
    reset,
    syncTimelineFromServer,
  };
}
