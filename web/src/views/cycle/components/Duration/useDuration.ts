import { formatDuration } from '@/utils';
import { Event } from '@/views/cycle/actors/cycle.actor';
import { differenceInMinutes, startOfMinute, subHours } from 'date-fns';
import { computed, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';

interface UseDurationParams {
  cycleActor: Actor<AnyActorLogic>;
  startDate: Ref<Date>;
  endDate: Ref<Date>;
}

export function useDuration({ cycleActor, startDate, endDate }: UseDurationParams) {
  const normalizedStartDate = computed(() => startOfMinute(startDate.value));
  const normalizedEndDate = computed(() => startOfMinute(endDate.value));

  const duration = computed(() => {
    const totalMinutes = differenceInMinutes(normalizedEndDate.value, normalizedStartDate.value);
    return formatDuration(totalMinutes);
  });

  const canDecrement = computed(() => {
    const date = startOfMinute(subHours(endDate.value, 1));
    return cycleActor.getSnapshot().can({ type: Event.DECREASE_DURATION, date });
  });

  function incrementDuration() {
    cycleActor.send({ type: Event.INCREMENT_DURATION });
  }

  function decrementDuration() {
    const date = startOfMinute(subHours(endDate.value, 1));
    if (canDecrement.value) {
      cycleActor.send({ type: Event.DECREASE_DURATION, date });
    }
  }

  return {
    duration,
    canDecrement,
    incrementDuration,
    decrementDuration,
  };
}
