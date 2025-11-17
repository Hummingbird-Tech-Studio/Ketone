import { Emit, Event, type cycleMachine } from '@/views/cycle/actors/cycle.actor';
import type { SchedulerView } from '@/views/cycle/domain/domain';
import { startOfMinute } from 'date-fns';
import { onUnmounted, ref } from 'vue';
import type { ActorRefFrom } from 'xstate';

interface UseSchedulerParams {
  cycleActor: ActorRefFrom<typeof cycleMachine>;
  view: SchedulerView;
}

export function useScheduler({ cycleActor, view }: UseSchedulerParams) {
  const open = ref(false);

  function openDialog() {
    open.value = true;
  }

  function closeDialog() {
    open.value = false;
  }

  function updateDate(newDate: Date) {
    const event = view._tag === 'Start' ? Event.UPDATE_START_DATE : Event.UPDATE_END_DATE;
    cycleActor.send({ type: event, date: startOfMinute(newDate) });
  }

  const subscription = cycleActor.on(Emit.UPDATE_COMPLETE, () => {
    closeDialog();
  });

  onUnmounted(() => {
    subscription.unsubscribe();
  });

  return {
    open,
    openDialog,
    closeDialog,
    updateDate,
  };
}
