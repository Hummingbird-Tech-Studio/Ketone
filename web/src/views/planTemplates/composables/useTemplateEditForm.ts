/**
 * Template Edit Form Composable (Input Shell)
 *
 * Owns draft state, validates reactively via computed, exposes
 * validationErrors + validatedInput + hasChanges.
 * Initializes from template data once on first load.
 * Provides selective sync methods so individual saves don't overwrite
 * unsaved changes in other fields.
 */
import type { PeriodConfig } from '@/components/Timeline';
import { extractSchemaErrors } from '@/utils/validation';
import { usePeriodManager } from '@/views/plan/composables/usePeriodManager';
import {
  computeShiftedPeriodConfigs,
  createContiguousPeriodsFromDurations,
  hasPeriodDurationsChanged,
  type CreatePlanInput,
} from '@/views/plan/domain';
import { validateCreatePlanInput } from '@/views/plan/input-validation/create-plan-input.mapper';
import {
  PlanDescription,
  PlanName,
  type PlanTemplateDetail,
  type TemplatePeriodConfig,
} from '@/views/planTemplates/domain';
import {
  validateUpdateTemplateInput,
  type UpdateTemplateDomainInput,
} from '@/views/planTemplates/input-validation/update-template-input.mapper';
import { Either } from 'effect';
import { computed, ref, watch, type Ref } from 'vue';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert template periods (order + durations) to PeriodConfig[]
 * with synthetic start times for the Timeline component.
 * Delegates date math to FC; assigns IDs here (shell concern).
 */
function templatePeriodsToPeriodConfigs(
  periods: readonly TemplatePeriodConfig[],
  baseDate = new Date(),
): PeriodConfig[] {
  return createContiguousPeriodsFromDurations(periods, baseDate).map((p) => ({
    id: crypto.randomUUID(),
    ...p,
  }));
}

/** Deep clone PeriodConfig array preserving Date objects */
function clonePeriodConfigs(configs: PeriodConfig[]): PeriodConfig[] {
  return configs.map((config) => ({
    ...config,
    startTime: new Date(config.startTime),
  }));
}

// ============================================================================
// Composable
// ============================================================================

export function useTemplateEditForm(template: Ref<PlanTemplateDetail | null>) {
  // Draft state
  const nameInput = ref('');
  const descriptionInput = ref('');
  const periodConfigs = ref<PeriodConfig[]>([]);
  const startDate = ref(new Date());

  // Original state (for reset + hasChanges)
  const originalName = ref('');
  const originalDescription = ref('');
  const originalPeriodConfigs = ref<PeriodConfig[]>([]);

  // One-time initialization flag — prevents losing local period changes
  // when template updates after name/description saves
  const isInitialized = ref(false);

  /** Apply template data to all draft + original refs */
  const applyTemplateState = (t: PlanTemplateDetail) => {
    nameInput.value = t.name;
    descriptionInput.value = t.description ?? '';
    originalName.value = t.name;
    originalDescription.value = t.description ?? '';

    const configs = templatePeriodsToPeriodConfigs(t.periods);
    periodConfigs.value = configs;
    originalPeriodConfigs.value = clonePeriodConfigs(configs);
  };

  // Initialize from template only once (first load)
  watch(
    template,
    (t) => {
      if (!t || isInitialized.value) return;
      isInitialized.value = true;
      applyTemplateState(t);
    },
    { immediate: true },
  );

  // When start date changes, shift all periods by the same delta (FC)
  watch(startDate, (newDate, oldDate) => {
    if (!oldDate) return;
    const shifted = computeShiftedPeriodConfigs(periodConfigs.value, oldDate, newDate);
    if (shifted) periodConfigs.value = shifted;
  });

  // ============================================================================
  // Selective Sync (called from emission handlers)
  // ============================================================================

  /** Sync name from server after a successful name save */
  const syncNameFromServer = (name: string) => {
    nameInput.value = name;
    originalName.value = name;
  };

  /** Sync description from server after a successful description save */
  const syncDescriptionFromServer = (description: string | null) => {
    const desc = description ?? '';
    descriptionInput.value = desc;
    originalDescription.value = desc;
  };

  /** Full reinit from server after timeline save (all fields are now in sync) */
  const syncAllFromServer = (t: PlanTemplateDetail) => {
    applyTemplateState(t);
  };

  // ============================================================================
  // Input Builders (for individual saves)
  // ============================================================================

  /** Build input for name-only save: new name + ORIGINAL description/periods from DB */
  const buildNameUpdateInput = (name: string): UpdateTemplateDomainInput | null => {
    if (!template.value) return null;
    return {
      name: PlanName(name.trim()),
      description: template.value.description,
      periods: template.value.periods.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    };
  };

  /** Build input for description-only save: ORIGINAL name + new description + ORIGINAL periods from DB */
  const buildDescriptionUpdateInput = (description: string): UpdateTemplateDomainInput | null => {
    if (!template.value) return null;
    const desc = description.trim();
    return {
      name: template.value.name,
      description: desc === '' ? null : PlanDescription(desc),
      periods: template.value.periods.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    };
  };

  /** Build input for creating a plan from the current template + period configs */
  const buildCreatePlanInput = (): CreatePlanInput | null => {
    if (!template.value) return null;

    const firstPeriod = periodConfigs.value[0];
    if (!firstPeriod) return null;

    const result = validateCreatePlanInput({
      name: template.value.name,
      description: template.value.description ?? '',
      startDate: firstPeriod.startTime,
      periods: periodConfigs.value.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    });

    return Either.isRight(result) ? result.right : null;
  };

  // Reactive validation (computed)
  const rawInput = computed(() => ({
    name: nameInput.value,
    description: descriptionInput.value,
    periods: periodConfigs.value.map((p) => ({
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    })),
  }));

  const validationResult = computed(() => validateUpdateTemplateInput(rawInput.value));

  const validationErrors = computed(() =>
    Either.isLeft(validationResult.value) ? extractSchemaErrors(validationResult.value.left) : {},
  );

  const validatedInput = computed<UpdateTemplateDomainInput | null>(() =>
    Either.isRight(validationResult.value) ? validationResult.value.right : null,
  );

  const isValid = computed(() => validatedInput.value !== null);

  // Change detection — delegates to FC pure function
  const hasTimelineChanges = computed(() =>
    hasPeriodDurationsChanged(originalPeriodConfigs.value, periodConfigs.value),
  );

  const hasChanges = computed(() => {
    if (nameInput.value !== originalName.value) return true;
    if (descriptionInput.value !== originalDescription.value) return true;
    return hasTimelineChanges.value;
  });

  // Period management — delegated to shared shell utility (FC predicates + ID gen)
  const { addPeriod, removePeriod } = usePeriodManager(periodConfigs);

  // Reset to original values
  const reset = () => {
    nameInput.value = originalName.value;
    descriptionInput.value = originalDescription.value;
    periodConfigs.value = clonePeriodConfigs(originalPeriodConfigs.value);
  };

  return {
    // Draft state
    nameInput,
    descriptionInput,
    periodConfigs,
    startDate,

    // Validation
    validationErrors,
    validatedInput,
    isValid,

    // Change detection
    hasChanges,
    hasTimelineChanges,

    // Period management
    addPeriod,
    removePeriod,

    // Selective sync
    syncNameFromServer,
    syncDescriptionFromServer,
    syncAllFromServer,

    // Input builders
    buildNameUpdateInput,
    buildDescriptionUpdateInput,
    buildCreatePlanInput,

    // Reset
    reset,
  };
}
