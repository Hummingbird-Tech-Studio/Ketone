import type { PeriodConfig } from '@/components/Timeline';
import { Either } from 'effect';
import { ref, watch } from 'vue';
import {
  extractSchemaErrors,
  validateCreatePlanInput,
  type CreatePlanDomainInput,
} from '../domain/schemas/create-plan-input.schema';
import { MAX_PERIODS, MIN_PERIODS } from '../constants';

export interface PlanDetailOptions {
  presetRatio: string;
  initialFastingDuration: number;
  initialEatingWindow: number;
  initialPeriods: number;
}

/**
 * Composable for plan creation form state and logic.
 *
 * Extracts business logic from PlanDetailView.vue:
 * - Period config initialization from preset
 * - Start date change → shift all period start times
 * - Period add/remove with contiguous scheduling
 * - Build + validate create plan payload via Schema
 */
export function usePlanDetail(options: PlanDetailOptions) {
  const planName = ref(options.presetRatio);
  const planDescription = ref('');
  const startDate = ref(new Date());
  const errors = ref<Record<string, string[]>>({});

  // Initialize period configs with contiguous scheduling
  const createInitialPeriodConfigs = (
    numPeriods: number,
    firstStartTime: Date,
    fastingDuration: number,
    eatingWindow: number,
  ): PeriodConfig[] => {
    const configs: PeriodConfig[] = [];
    let currentStartTime = new Date(firstStartTime);

    for (let i = 0; i < numPeriods; i++) {
      configs.push({
        id: crypto.randomUUID(),
        startTime: new Date(currentStartTime),
        fastingDuration,
        eatingWindow,
      });

      const periodDuration = fastingDuration + eatingWindow;
      currentStartTime = new Date(currentStartTime.getTime() + periodDuration * 60 * 60 * 1000);
    }

    return configs;
  };

  const periodConfigs = ref<PeriodConfig[]>(
    createInitialPeriodConfigs(
      options.initialPeriods,
      startDate.value,
      options.initialFastingDuration,
      options.initialEatingWindow,
    ),
  );

  // When start date changes, shift all periods by the same delta
  watch(startDate, (newStartDate, oldStartDate) => {
    if (!oldStartDate) return;
    const deltaMs = newStartDate.getTime() - oldStartDate.getTime();
    if (deltaMs === 0) return;

    periodConfigs.value = periodConfigs.value.map((config) => ({
      ...config,
      startTime: new Date(config.startTime.getTime() + deltaMs),
    }));
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

  const reset = () => {
    planName.value = options.presetRatio;
    planDescription.value = '';
    startDate.value = new Date();
    periodConfigs.value = createInitialPeriodConfigs(
      options.initialPeriods,
      new Date(),
      options.initialFastingDuration,
      options.initialEatingWindow,
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
