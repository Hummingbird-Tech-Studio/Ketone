import type { PeriodConfig } from '@/components/Timeline';
import { hasPeriodDurationsChanged, hasStartDateChanged, type SaveTimelineInput } from '@/views/plan/domain';
import { DateTime, Effect, Either } from 'effect';
import { computed, ref, watch, type Ref } from 'vue';
import type { PlanDetail } from '../domain';
import { validateSaveTimelineInput } from '../input-validation';
import { usePeriodManager } from './usePeriodManager';

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
 * - hasStartDateChanged, hasPeriodDurationsChanged (from PlanValidationService)
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

  // Change detection — delegates to FC pure functions
  const hasStartTimeChange = computed(() => {
    const firstPeriod = periodConfigs.value[0];
    const originalFirstPeriod = originalPeriodConfigs.value[0];
    if (!firstPeriod || !originalFirstPeriod) return false;
    return hasStartDateChanged(originalFirstPeriod.startTime, firstPeriod.startTime);
  });

  const hasDurationChanges = computed(() =>
    hasPeriodDurationsChanged(originalPeriodConfigs.value, periodConfigs.value),
  );

  const hasTimelineChanges = computed(() => hasStartTimeChange.value || hasDurationChanges.value);

  // Period management — delegated to shared shell utility (FC predicates + ID gen)
  const { addPeriod, removePeriod } = usePeriodManager(periodConfigs);

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
  const buildSaveTimelinePayload = (): SaveTimelineInput | null => {
    const currentPlan = options.plan.value;
    if (!currentPlan) return null;

    const firstPeriod = periodConfigs.value[0];
    if (!firstPeriod) return null;

    const originalIds = new Set(originalPeriodConfigs.value.map((c) => c.id));
    const timeline = {
      planId: currentPlan.id,
      originalPlan: currentPlan,
      currentStartDate: firstPeriod.startTime,
      currentPeriods: periodConfigs.value.map((config) => ({
        id: originalIds.has(config.id) ? config.id : undefined,
        fastingDuration: config.fastingDuration,
        eatingWindow: config.eatingWindow,
      })),
    };

    const result = validateSaveTimelineInput(timeline);
    if (Either.isLeft(result)) return null;

    return result.right;
  };

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
