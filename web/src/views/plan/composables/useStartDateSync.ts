import type { PeriodConfig } from '@/components/Timeline';
import { computeShiftedPeriodConfigs } from '@/views/plan/domain';
import { watch, type Ref } from 'vue';

/**
 * Shell utility for bidirectional sync between startDate and periodConfigs.
 *
 * - When startDate changes (date picker): shifts all periods using the first
 *   period's actual startTime as reference (not the stale startDate ref).
 * - When periodConfigs[0].startTime changes (timeline drag): syncs startDate
 *   so the date picker always reflects the real first period position.
 */
export function useStartDateSync(startDate: Ref<Date>, periodConfigs: Ref<PeriodConfig[]>) {
  watch(startDate, (newDate) => {
    const firstPeriod = periodConfigs.value[0];
    if (!firstPeriod) return;
    const shifted = computeShiftedPeriodConfigs(periodConfigs.value, firstPeriod.startTime, newDate);
    if (shifted) periodConfigs.value = shifted;
  });

  watch(
    () => periodConfigs.value[0]?.startTime,
    (firstStart) => {
      if (firstStart && firstStart.getTime() !== startDate.value.getTime()) {
        startDate.value = firstStart;
      }
    },
  );
}
