import type { PeriodConfig } from '@/components/Timeline';
import {
  computeShiftedPeriodConfigs,
  createContiguousPeriods,
  extractSchemaErrors,
  validateCreatePlanInput,
  type CreatePlanDomainInput,
} from '@/views/plan/domain';
import { DateTime, Effect, Either } from 'effect';
import { ref, watch } from 'vue';
import { usePeriodManager } from './usePeriodManager';

export interface PlanDetailOptions {
  presetRatio: string;
  initialFastingDuration: number;
  initialEatingWindow: number;
  initialPeriods: number;
}

/** Shell clock access — uses Effect DateTime for testability */
const getNow = (): Date => Effect.runSync(DateTime.nowAsDate);

/**
 * Composable for plan creation form state and logic.
 *
 * Shell responsibilities:
 * - Clock access (getNow) and ID generation (crypto.randomUUID)
 * - Reactive state (refs, watchers)
 * - Input validation (Schema)
 *
 * FC delegation:
 * - createContiguousPeriods, computeNextContiguousPeriod, shiftPeriodStartTimes
 */
export function usePlanDetail(options: PlanDetailOptions) {
  const planName = ref(options.presetRatio);
  const planDescription = ref('');
  const startDate = ref(getNow());
  const errors = ref<Record<string, string[]>>({});

  /** Shell: assigns IDs to FC-computed period configs */
  const withIds = (configs: ReadonlyArray<{ startTime: Date; fastingDuration: number; eatingWindow: number }>) =>
    configs.map((p) => ({ id: crypto.randomUUID(), ...p }));

  const periodConfigs = ref<PeriodConfig[]>(
    withIds(
      createContiguousPeriods(
        options.initialPeriods,
        startDate.value,
        options.initialFastingDuration,
        options.initialEatingWindow,
      ),
    ),
  );

  // When start date changes, shift all periods by the same delta (FC)
  watch(startDate, (newDate, oldDate) => {
    if (!oldDate) return;
    const shifted = computeShiftedPeriodConfigs(periodConfigs.value, oldDate, newDate);
    if (shifted) periodConfigs.value = shifted;
  });

  // Period management — delegated to shared shell utility (FC predicates + ID gen)
  const { addPeriod, removePeriod } = usePeriodManager(periodConfigs);

  const reset = () => {
    const now = getNow();
    planName.value = options.presetRatio;
    planDescription.value = '';
    startDate.value = now;
    periodConfigs.value = withIds(
      createContiguousPeriods(options.initialPeriods, now, options.initialFastingDuration, options.initialEatingWindow),
    );
    errors.value = {};
  };

  /**
   * Build and validate create plan payload using Schema validation.
   * Returns the domain-typed input or null if validation fails (errors are set).
   */
  const buildCreatePlanPayload = (): CreatePlanDomainInput | null => {
    const firstPeriod = periodConfigs.value[0];
    if (!firstPeriod) return null;

    const raw = {
      name: planName.value,
      description: planDescription.value,
      startDate: firstPeriod.startTime,
      periods: periodConfigs.value.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    };

    const result = validateCreatePlanInput(raw);
    if (Either.isLeft(result)) {
      errors.value = extractSchemaErrors(result.left);
      return null;
    }

    errors.value = {};
    return result.right;
  };

  return {
    planName,
    planDescription,
    startDate,
    periodConfigs,
    errors,
    addPeriod,
    removePeriod,
    reset,
    buildCreatePlanPayload,
  };
}
