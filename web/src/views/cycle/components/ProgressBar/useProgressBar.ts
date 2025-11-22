import { MILLISECONDS_PER_HOUR } from '@/shared/constants';
import { getFastingStageByHours } from '@/views/cycle/domain/domain';
import { differenceInMilliseconds } from 'date-fns';
import { computed, onUnmounted, ref, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { useSelector } from '@xstate/vue';
import { Emit, CycleState, type CycleMetadata } from '../../actors/cycle.actor';

const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;

interface UseProgressBarParams {
  cycleActor: Actor<AnyActorLogic>;
  cycleMetadata: Ref<CycleMetadata | null>;
  startDate: Ref<Date>;
  endDate: Ref<Date>;
}

export function useProgressBar({ cycleActor, cycleMetadata, startDate, endDate }: UseProgressBarParams) {
  // Track current time for real-time calculations
  const now = ref(new Date());

  // Check if the cycle should update in real-time (timer is running)
  const shouldUpdateRealTime = useSelector(cycleActor, (state) =>
    state.matches(CycleState.InProgress) ||
    state.matches(CycleState.Updating) ||
    state.matches(CycleState.ConfirmCompletion)
  );

  const hours = computed(() => {
    // If no cycle exists, show 0 hours
    if (!cycleMetadata.value) {
      return 0;
    }

    // Only use real-time if timer is running, otherwise use end date
    const referenceTime = shouldUpdateRealTime.value ? now.value : endDate.value;
    const diffInMs = differenceInMilliseconds(referenceTime, startDate.value);
    return Math.round(diffInMs / MILLISECONDS_PER_HOUR);
  });

  const stage = computed(() => getFastingStageByHours(hours.value));

  const progressPercentage = computed(() => {
    // If no cycle exists, show 0% progress
    if (!cycleMetadata.value) {
      return MIN_PERCENTAGE;
    }

    const totalDuration = endDate.value.getTime() - startDate.value.getTime();

    // Only use real-time if timer is running, otherwise use end date
    const referenceTime = shouldUpdateRealTime.value ? now.value : endDate.value;
    const elapsed = referenceTime.getTime() - startDate.value.getTime();

    const percentage = (elapsed / totalDuration) * MAX_PERCENTAGE;
    return Math.max(MIN_PERCENTAGE, Math.min(percentage, MAX_PERCENTAGE));
  });

  // Subscribe to TICK events to update current time
  const tickSubscription = cycleActor.on(Emit.TICK, () => {
    now.value = new Date();
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
