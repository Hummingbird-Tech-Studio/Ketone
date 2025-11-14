import { formatTime } from '@/utils';
import { onUnmounted, ref, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit } from '../../actors/cycle.actor';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;

interface UseTimerParams {
  cycleActor: Actor<AnyActorLogic>;
  startDate: Ref<Date>;
  endDate: Ref<Date>;
}

export function useTimer({ cycleActor, startDate, endDate }: UseTimerParams) {
  const elapsedTime = ref(formatTime(0, 0, 0));
  const remainingTime = ref(formatTime(0, 0, 0));

  function calculateTime(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    return formatTime(hours, minutes, seconds);
  }

  function updateElapsedTime() {
    const now = new Date();
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startDate.value.getTime()) / 1000));
    elapsedTime.value = calculateTime(elapsedSeconds);
  }

  function updateRemainingTime() {
    const now = new Date();
    const remainingSeconds = Math.max(0, Math.floor((endDate.value.getTime() - now.getTime()) / 1000));
    remainingTime.value = calculateTime(remainingSeconds);
  }

  const tickSubscription = cycleActor.on(Emit.TICK, () => {
    updateElapsedTime();
    updateRemainingTime();
  });

  onUnmounted(() => {
    tickSubscription.unsubscribe();
  });

  return {
    elapsedTime,
    remainingTime,
  };
}
