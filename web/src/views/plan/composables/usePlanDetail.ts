import type { PeriodConfig } from '@/components/Timeline';
import { DateTime, Effect, Either } from 'effect';
import { ref, watch } from 'vue';
import {
  extractSchemaErrors,
  validateCreatePlanInput,
  type CreatePlanDomainInput,
} from '@/views/plan/domain';
import {
  createContiguousPeriods,
  computeNextContiguousPeriod,
  shiftPeriodStartTimes,
} from '@/views/plan/domain';
import { MAX_PERIODS, MIN_PERIODS } from '../constants';

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
  watch(startDate, (newStartDate, oldStartDate) => {
    if (!oldStartDate) return;
    const deltaMs = newStartDate.getTime() - oldStartDate.getTime();
    if (deltaMs === 0) return;

    const currentConfigs = periodConfigs.value;
    const shifted = shiftPeriodStartTimes(currentConfigs, deltaMs);
    periodConfigs.value = shifted.map((config, i) => ({
      ...config,
      id: currentConfigs[i]!.id,
    }));
  });

  // Period management — delegates calculation to FC, shell assigns IDs
  const addPeriod = () => {
    if (periodConfigs.value.length >= MAX_PERIODS) return;
    const lastPeriod = periodConfigs.value[periodConfigs.value.length - 1];
    if (!lastPeriod) return;
    const nextPeriod = computeNextContiguousPeriod(lastPeriod);
    periodConfigs.value = [...periodConfigs.value, { id: crypto.randomUUID(), ...nextPeriod }];
  };

  const removePeriod = () => {
    if (periodConfigs.value.length <= MIN_PERIODS) return;
    periodConfigs.value = periodConfigs.value.slice(0, -1);
  };

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
