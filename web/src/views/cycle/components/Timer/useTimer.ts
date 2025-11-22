import { formatTime } from '@/utils';
import { computed, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { useCycleRealTimeTracking } from '@/composables/useCycleRealTimeTracking';
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

  // Computed property that reacts to date changes AND current time
  const elapsedTime = computed(() => {
    // If no cycle exists (Idle/Creating state), show 00:00:00
    if (!cycleMetadata.value) {
      return formatTime(0, 0, 0);
    }

    // Only use real-time updates if the timer is actually running
    const referenceTime = shouldUpdateRealTime.value ? now.value : endDate.value;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((referenceTime.getTime() - startDate.value.getTime()) / 1000)
    );
    return calculateTime(elapsedSeconds);
  });

  const remainingTime = computed(() => {
    // If no cycle exists, show 00:00:00
    if (!cycleMetadata.value) {
      return formatTime(0, 0, 0);
    }

    // Only calculate remaining time if timer is running
    if (!shouldUpdateRealTime.value) {
      return formatTime(0, 0, 0);
    }

    // For in-progress cycles, calculate from current time
    const remainingSeconds = Math.max(
      0,
      Math.floor((endDate.value.getTime() - now.value.getTime()) / 1000)
    );
    return calculateTime(remainingSeconds);
  });

  return {
    elapsedTime,
    remainingTime,
  };
}
