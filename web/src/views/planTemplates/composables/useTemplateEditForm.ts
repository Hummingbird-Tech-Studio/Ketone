/**
 * Template Edit Form Composable (Input Shell)
 *
 * Owns draft state, validates reactively via computed, exposes
 * validationErrors + validatedInput + hasChanges.
 * Initializes from template data once on first load.
 * Provides selective sync methods so individual saves don't overwrite
 * unsaved changes in other fields.
 */
import { extractSchemaErrors } from '@/utils/validation';
import { canAddPeriod, canRemovePeriod, hasPeriodDurationsChanged } from '@/views/plan/domain';
import { PlanDescription, PlanName, type PlanTemplateDetail } from '@/views/planTemplates/domain';
import {
  validateUpdateTemplateInput,
  type UpdateTemplateDomainInput,
} from '@/views/planTemplates/input-validation/update-template-input.mapper';
import { Either } from 'effect';
import { computed, ref, watch, type Ref } from 'vue';
import type { PeriodDuration } from './useTemplateApplyForm';

// ============================================================================
// Helpers
// ============================================================================

/** Shallow clone PeriodDuration array */
function clonePeriods(periods: PeriodDuration[]): PeriodDuration[] {
  return periods.map((p) => ({ ...p }));
}

// ============================================================================
// Composable
// ============================================================================

export function useTemplateEditForm(template: Ref<PlanTemplateDetail | null>) {
  // Draft state
  const nameInput = ref('');
  const descriptionInput = ref('');
  const periods = ref<PeriodDuration[]>([]);

  // Original state (for reset + hasChanges)
  const originalName = ref('');
  const originalDescription = ref('');
  const originalPeriods = ref<PeriodDuration[]>([]);

  // One-time initialization flag — prevents losing local period changes
  // when template updates after name/description saves
  const isInitialized = ref(false);

  /** Apply template data to all draft + original refs */
  const applyTemplateState = (t: PlanTemplateDetail) => {
    nameInput.value = t.name;
    descriptionInput.value = t.description ?? '';
    originalName.value = t.name;
    originalDescription.value = t.description ?? '';

    const durations: PeriodDuration[] = t.periods.map((p) => ({
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    }));
    periods.value = durations;
    originalPeriods.value = clonePeriods(durations);
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

  // Reactive validation (computed)
  const rawInput = computed(() => ({
    name: nameInput.value,
    description: descriptionInput.value,
    periods: periods.value.map((p) => ({
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
  const hasTimelineChanges = computed(() => hasPeriodDurationsChanged(originalPeriods.value, periods.value));

  const hasChanges = computed(() => {
    if (nameInput.value !== originalName.value) return true;
    if (descriptionInput.value !== originalDescription.value) return true;
    return hasTimelineChanges.value;
  });

  // Period management — inline (no dates/IDs needed)
  const addPeriod = () => {
    if (!canAddPeriod(periods.value.length)) return;
    const last = periods.value[periods.value.length - 1];
    if (!last) return;
    periods.value = [...periods.value, { ...last }];
  };

  const removePeriod = () => {
    if (!canRemovePeriod(periods.value.length)) return;
    periods.value = periods.value.slice(0, -1);
  };

  // Reset to original values
  const reset = () => {
    nameInput.value = originalName.value;
    descriptionInput.value = originalDescription.value;
    periods.value = clonePeriods(originalPeriods.value);
  };

  return {
    // Draft state
    nameInput,
    descriptionInput,
    periods,

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
