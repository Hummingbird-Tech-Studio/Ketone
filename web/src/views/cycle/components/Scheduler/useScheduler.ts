import { Emit, Event, type cycleMachine } from '@/views/cycle/actors/cycle.actor';
import type { SchedulerView } from '@/views/cycle/domain/domain';
import { startOfMinute } from 'date-fns';
import { onUnmounted, type Ref } from 'vue';
import type { ActorRefFrom } from 'xstate';

interface UseSchedulerParams {
  cycleActor: ActorRefFrom<typeof cycleMachine>;
  view: SchedulerView;
  schedulerRef: Ref<{ close: () => void } | null>;
}

export function useScheduler({ cycleActor, view, schedulerRef }: UseSchedulerParams) {
  function updateDate(newDate: Date) {
    const event = view._tag === 'Start' ? Event.UPDATE_START_DATE : Event.UPDATE_END_DATE;
    cycleActor.send({ type: event, date: startOfMinute(newDate) });
  }

  const subscription = cycleActor.on(Emit.UPDATE_COMPLETE, () => {
    schedulerRef.value?.close();
  });

  onUnmounted(() => {
    subscription.unsubscribe();
  });

  return {
    updateDate,
  };
}
