import type { PeriodConfig } from '@/components/Timeline';
import { canAddPeriod, canRemovePeriod, computeNextContiguousPeriod } from '@/views/plan/domain';
import type { Ref } from 'vue';

/**
 * Shell utility for period list management.
 *
 * Encapsulates shell concerns (ID generation via crypto.randomUUID,
 * ref mutation) while delegating business rules to FC predicates
 * (canAddPeriod, canRemovePeriod) and calculation (computeNextContiguousPeriod).
 */
export function usePeriodManager(periodConfigs: Ref<PeriodConfig[]>) {
  const addPeriod = () => {
    if (!canAddPeriod(periodConfigs.value.length)) return;

    const lastPeriod = periodConfigs.value[periodConfigs.value.length - 1];
    if (!lastPeriod) return;

    const nextPeriod = computeNextContiguousPeriod(lastPeriod);
    periodConfigs.value = [...periodConfigs.value, { id: crypto.randomUUID(), ...nextPeriod }];
  };

  const removePeriod = () => {
    if (!canRemovePeriod(periodConfigs.value.length)) return;
    periodConfigs.value = periodConfigs.value.slice(0, -1);
  };

  return { addPeriod, removePeriod };
}
