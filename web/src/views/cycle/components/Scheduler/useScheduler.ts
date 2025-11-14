import { Event } from '@/views/cycle/actors/cycle.actor';
import type { Actor, AnyActorLogic } from 'xstate';

interface UseSchedulerParams {
  cycleActor: Actor<AnyActorLogic>;
}

export function useScheduler({ cycleActor }: UseSchedulerParams) {
  function updateStartDate(newDate: Date) {
    cycleActor.send({ type: Event.UPDATE_START_DATE, date: newDate });
  }

  function updateEndDate(newDate: Date) {
    cycleActor.send({ type: Event.UPDATE_END_DATE, date: newDate });
  }

  return {
    updateStartDate,
    updateEndDate,
  };
}
