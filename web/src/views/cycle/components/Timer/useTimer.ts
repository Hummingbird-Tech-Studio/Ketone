import { useCycleRealTimeTracking } from '@/composables/useCycleRealTimeTracking';
import { formatTime } from '@/utils';
import { computed, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import type { CycleMetadata } from '../../actors/cycle.actor';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;

interface UseTimerParams {
  cycleActor: Actor<AnyActorLogic>;
  cycleMetadata: Ref<CycleMetadata | null>;
  startDate: Ref<Date>;
  endDate: Ref<Date>;
}

export function useTimer({ cycleActor, cycleMetadata, startDate, endDate }: UseTimerParams) {
  const { now, shouldUpdateRealTime } = useCycleRealTimeTracking(cycleActor);

  function calculateTime(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    return formatTime(hours, minutes, seconds);
  }

  const elapsedTime = computed(() => {
    if (!cycleMetadata.value) {
      return formatTime(0, 0, 0);
    }

    const referenceTime = shouldUpdateRealTime.value ? now.value : endDate.value;
    const elapsedSeconds = Math.max(0, Math.floor((referenceTime.getTime() - startDate.value.getTime()) / 1000));
    return calculateTime(elapsedSeconds);
  });

  const remainingTime = computed(() => {
    if (!cycleMetadata.value) {
      return formatTime(0, 0, 0);
    }

    if (!shouldUpdateRealTime.value) {
      return formatTime(0, 0, 0);
    }

    const remainingSeconds = Math.max(0, Math.floor((endDate.value.getTime() - now.value.getTime()) / 1000));
    return calculateTime(remainingSeconds);
  });

  return {
    elapsedTime,
    remainingTime,
  };
}
