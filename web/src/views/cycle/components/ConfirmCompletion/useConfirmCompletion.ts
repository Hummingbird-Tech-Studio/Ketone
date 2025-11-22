import { useFastingTimeCalculation } from '@/composables/useFastingTimeCalculation';
import { useSelector } from '@xstate/vue';
import type { ActorRefFrom } from 'xstate';
import { type cycleMachine } from '../../actors/cycle.actor';

interface UseConfirmCompletionParams {
  actorRef: ActorRefFrom<typeof cycleMachine>;
}

export function useConfirmCompletion({ actorRef }: UseConfirmCompletionParams) {
  const pendingStartDate = useSelector(actorRef, (state) => state.context.pendingStartDate);
  const pendingEndDate = useSelector(actorRef, (state) => state.context.pendingEndDate);

  // Calculate total fasting time using the composable
  const totalFastingTime = useFastingTimeCalculation(pendingStartDate, pendingEndDate);

  return {
    // Pending dates for formatting in component
    pendingStartDate,
    pendingEndDate,
    // Fasting time
    totalFastingTime,
    // Actor ref for external use
    actorRef,
  };
}
