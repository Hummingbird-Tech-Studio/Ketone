import { MILLISECONDS_PER_HOUR } from '@/shared/constants';
import { getFastingStageByHours } from '@/views/cycle/domain/domain';
import { differenceInMilliseconds } from 'date-fns';
import { computed, onUnmounted, ref, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { Emit } from '../../actors/cycle.actor';

const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;

interface UseProgressBarParams {
  cycleActor: Actor<AnyActorLogic>;
  startDate: Ref<Date>;
  endDate: Ref<Date>;
}

export function useProgressBar({ cycleActor, startDate, endDate }: UseProgressBarParams) {
  const progressPercentage = ref(0);

  const hours = computed(() => {
    const diffInMs = differenceInMilliseconds(new Date(), startDate.value);
    return Math.round(diffInMs / MILLISECONDS_PER_HOUR);
  });

  const stage = computed(() => getFastingStageByHours(hours.value));

  function updateProgressPercentage() {
    const now = new Date();
    const totalDuration = endDate.value.getTime() - startDate.value.getTime();
    const elapsed = now.getTime() - startDate.value.getTime();
    const percentage = (elapsed / totalDuration) * MAX_PERCENTAGE;

    progressPercentage.value = Math.max(MIN_PERCENTAGE, Math.min(percentage, MAX_PERCENTAGE));
  }

  const tickSubscription = cycleActor.on(Emit.TICK, () => {
    updateProgressPercentage();
  });

  onUnmounted(() => {
    tickSubscription.unsubscribe();
  });

  return {
    progressPercentage,
    stage,
    hours,
  };
}
