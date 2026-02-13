import type { PeriodConfig } from '@/components/Timeline';
import {
  computeNextContiguousPeriod,
  validateSaveTimelineInput,
  type SaveTimelineDomainInput,
} from '@/views/plan/domain';
import { DateTime, Effect, Either } from 'effect';
import { computed, ref, watch, type Ref } from 'vue';
import { MAX_PERIODS, MIN_PERIODS } from '../constants';
import type { PlanDetail } from '../domain';

/** Shell clock access — uses Effect DateTime for testability */
const getNow = (): Date => Effect.runSync(DateTime.nowAsDate);

/**
 * Composable for plan edit form state and change detection.
 *
 * Shell responsibilities:
 * - Clock access (getNow) and ID generation (crypto.randomUUID)
 * - Reactive state (refs, watchers)
 * - Boundary mapping (domain PlanPeriod[] → PeriodConfig[])
 * - Change detection (comparing current vs original configs)
 *
 * FC delegation:
 * - computeNextContiguousPeriod (from PlanPeriodCalculationService)
 */
export function usePlanEditForm(options: { plan: Ref<PlanDetail | null>; savingTimeline: Ref<boolean> }) {
  // Local form state
  const planName = ref('');
  const planDescription = ref('');
  const startDate = ref(getNow());
  const periodConfigs = ref<PeriodConfig[]>([]);
  const originalPeriodConfigs = ref<PeriodConfig[]>([]);

  // Period progress (updated via Timeline event)
  const currentPeriodIndex = ref(0);
  const currentPeriodDisplay = computed(() => currentPeriodIndex.value + 1);

  // Convert domain PlanPeriod[] to PeriodConfig[] for Timeline component
  function toPeriodConfigs(plan: PlanDetail): PeriodConfig[] {
    return plan.periods.map((period) => ({
      id: period.id,
      startTime: new Date(period.startDate),
      fastingDuration: period.fastingDuration,
      eatingWindow: period.eatingWindow,
    }));
  }

  function clonePeriodConfigs(configs: PeriodConfig[]): PeriodConfig[] {
    return configs.map((config) => ({
      ...config,
      startTime: new Date(config.startTime),
    }));
  }

  // Change detection
  const hasStartTimeChange = computed(() => {
    const firstPeriod = periodConfigs.value[0];
    const originalFirstPeriod = originalPeriodConfigs.value[0];
    if (!firstPeriod || !originalFirstPeriod) return false;
    return firstPeriod.startTime.getTime() !== originalFirstPeriod.startTime.getTime();
  });

  const hasDurationChanges = computed(() => {
    if (periodConfigs.value.length !== originalPeriodConfigs.value.length) return true;
    return periodConfigs.value.some((config, index) => {
      const original = originalPeriodConfigs.value[index];
      if (!original) return true;
      return config.fastingDuration !== original.fastingDuration || config.eatingWindow !== original.eatingWindow;
    });
  });

  const hasTimelineChanges = computed(() => hasStartTimeChange.value || hasDurationChanges.value);

  // Sync local form state from actor plan context
  // Skip updates while saving to prevent chart re-renders behind the loading overlay
  watch(
    [options.plan, options.savingTimeline],
    ([newPlan, saving]) => {
      if (newPlan && !saving) {
        planName.value = newPlan.name;
        planDescription.value = newPlan.description ?? '';
        startDate.value = new Date(newPlan.startDate);
        const configs = toPeriodConfigs(newPlan);
        periodConfigs.value = configs;
        originalPeriodConfigs.value = clonePeriodConfigs(configs);
      }
    },
    { immediate: true },
  );

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

  const resetTimeline = () => {
    periodConfigs.value = clonePeriodConfigs(originalPeriodConfigs.value);
  };

  const handlePeriodProgress = (payload: { completedCount: number; currentIndex: number; total: number }) => {
    currentPeriodIndex.value = payload.currentIndex;
  };

  /**
   * Build and validate save timeline payload using Schema validation.
   * Always passes current startDate and periods — the FC decision ADT
   * in the application service determines what actually changed.
   * Returns the domain-typed input or null if validation fails.
   */
  const buildSaveTimelinePayload = (): SaveTimelineDomainInput | null => {
    const currentPlan = options.plan.value;
    if (!currentPlan) return null;

    const firstPeriod = periodConfigs.value[0];
    if (!firstPeriod) return null;

    const originalIds = new Set(originalPeriodConfigs.value.map((c) => c.id));
    const raw = {
      planId: currentPlan.id,
      originalPlan: currentPlan,
      currentStartDate: firstPeriod.startTime,
      currentPeriods: periodConfigs.value.map((config) => ({
        id: originalIds.has(config.id) ? config.id : undefined,
        fastingDuration: config.fastingDuration,
        eatingWindow: config.eatingWindow,
      })),
    };

    const result = validateSaveTimelineInput(raw);
    if (Either.isLeft(result)) return null;

    return result.right;
  };

  return {
    // Form state
    planName,
    planDescription,
    startDate,
    periodConfigs,

    // Change detection
    hasStartTimeChange,
    hasDurationChanges,
    hasTimelineChanges,

    // Period progress
    currentPeriodIndex,
    currentPeriodDisplay,
    handlePeriodProgress,

    // Actions
    addPeriod,
    removePeriod,
    resetTimeline,
    buildSaveTimelinePayload,
  };
}
