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
import { MAX_PERIODS, MIN_PERIODS } from '@/views/plan/constants';
import {
  PlanDescription,
  PlanName,
  type PlanTemplateDetail,
  type TemplatePeriodConfig,
} from '@/views/planTemplates/domain';
import {
  extractSchemaErrors,
  validateUpdateTemplateInput,
  type UpdateTemplateDomainInput,
} from '@/views/planTemplates/domain/schemas/update-template-input.schema';
import type { UpdateTemplateDomainInput } from '@/views/planTemplates/domain';
import { Either } from 'effect';
import { computed, ref, watch, type Ref } from 'vue';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert template periods (order + durations) to PeriodConfig[]
 * with synthetic start times for the Timeline component.
 */
function templatePeriodsToPeriodConfigs(
  periods: readonly TemplatePeriodConfig[],
  baseDate = new Date(),
): PeriodConfig[] {
  const configs: PeriodConfig[] = [];
  let currentStart = new Date(baseDate);

  for (const p of periods) {
    configs.push({
      id: crypto.randomUUID(),
      startTime: new Date(currentStart),
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    });
    currentStart = new Date(currentStart.getTime() + (p.fastingDuration + p.eatingWindow) * 3600000);
  }

  return configs;
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

  // Original state (for reset + hasChanges)
  const originalName = ref('');
  const originalDescription = ref('');
  const originalPeriodConfigs = ref<PeriodConfig[]>([]);

  // One-time initialization flag — prevents losing local period changes
  // when template updates after name/description saves
  const isInitialized = ref(false);

  // Initialize from template only once (first load)
  watch(
    template,
    (t) => {
      if (!t || isInitialized.value) return;
      isInitialized.value = true;

      nameInput.value = t.name;
      descriptionInput.value = t.description ?? '';
      originalName.value = t.name;
      originalDescription.value = t.description ?? '';

      const configs = templatePeriodsToPeriodConfigs(t.periods);
      periodConfigs.value = configs;
      originalPeriodConfigs.value = clonePeriodConfigs(configs);
    },
    { immediate: true },
  );

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
    nameInput.value = t.name;
    descriptionInput.value = t.description ?? '';
    originalName.value = t.name;
    originalDescription.value = t.description ?? '';

    const configs = templatePeriodsToPeriodConfigs(t.periods);
    periodConfigs.value = configs;
    originalPeriodConfigs.value = clonePeriodConfigs(configs);
  };

  // ============================================================================
  // Input Builders (for individual saves)
  // ============================================================================

  /** Build input for name-only save: new name + ORIGINAL description/periods from DB */
  const buildNameUpdateInput = (name: string): UpdateTemplateDomainInput | null => {
    if (!template.value) return null;
    return {
      name: PlanName(name),
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

  // Change detection
  const hasTimelineChanges = computed(() => {
    if (periodConfigs.value.length !== originalPeriodConfigs.value.length) return true;

    return periodConfigs.value.some((config, index) => {
      const original = originalPeriodConfigs.value[index];
      if (!original) return true;
      return config.fastingDuration !== original.fastingDuration || config.eatingWindow !== original.eatingWindow;
    });
  });

  const hasChanges = computed(() => {
    if (nameInput.value !== originalName.value) return true;
    if (descriptionInput.value !== originalDescription.value) return true;
    return hasTimelineChanges.value;
  });

  // Period management
  const addPeriod = () => {
    if (periodConfigs.value.length >= MAX_PERIODS) return;
    const lastPeriod = periodConfigs.value[periodConfigs.value.length - 1];
    if (!lastPeriod) return;

    const periodDuration = lastPeriod.fastingDuration + lastPeriod.eatingWindow;
    const newStartTime = new Date(lastPeriod.startTime.getTime() + periodDuration * 60 * 60 * 1000);

    periodConfigs.value = [
      ...periodConfigs.value,
      {
        id: crypto.randomUUID(),
        startTime: newStartTime,
        fastingDuration: lastPeriod.fastingDuration,
        eatingWindow: lastPeriod.eatingWindow,
      },
    ];
  };

  const removePeriod = () => {
    if (periodConfigs.value.length <= MIN_PERIODS) return;
    periodConfigs.value = periodConfigs.value.slice(0, -1);
  };

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

    // Reset
    reset,
  };
}
