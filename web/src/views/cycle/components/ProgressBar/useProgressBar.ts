import { useCycleRealTimeTracking } from '@/composables/useCycleRealTimeTracking';
import { MILLISECONDS_PER_HOUR } from '@/shared/constants';
import { getFastingStageByHours } from '@/views/cycle/domain/domain';
import { differenceInMilliseconds } from 'date-fns';
import { computed, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import type { CycleMetadata } from '../../actors/cycle.actor';

const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;

interface UseProgressBarParams {
  cycleActor: Actor<AnyActorLogic>;
  cycleMetadata: Ref<CycleMetadata | null>;
  startDate: Ref<Date>;
  endDate: Ref<Date>;
}

export function useProgressBar({ cycleActor, cycleMetadata, startDate, endDate }: UseProgressBarParams) {
  const { now, shouldUpdateRealTime } = useCycleRealTimeTracking(cycleActor);

  const hours = computed(() => {
    if (!cycleMetadata.value) {
      return 0;
    }

    const referenceTime = shouldUpdateRealTime.value ? now.value : endDate.value;
    const diffInMs = differenceInMilliseconds(referenceTime, startDate.value);

    return Math.round(diffInMs / MILLISECONDS_PER_HOUR);
  });

  const stage = computed(() => getFastingStageByHours(hours.value));

  const progressPercentage = computed(() => {
    if (!cycleMetadata.value) {
      return MIN_PERCENTAGE;
    }

    const totalDuration = endDate.value.getTime() - startDate.value.getTime();
    const referenceTime = shouldUpdateRealTime.value ? now.value : endDate.value;
    const elapsed = referenceTime.getTime() - startDate.value.getTime();
    const percentage = (elapsed / totalDuration) * MAX_PERCENTAGE;

    return Math.max(MIN_PERCENTAGE, Math.min(percentage, MAX_PERCENTAGE));
  });

  return {
    progressPercentage,
    stage,
    hours,
  };
}
