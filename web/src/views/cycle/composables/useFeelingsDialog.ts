import { useSelector } from '@xstate/vue';
import { ref } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { CycleState, Event, type cycleMachine } from '../actors/cycle.actor';

/**
 * Composable for managing the Feelings dialog state.
 * Uses a simple ref-based approach since feelings validation is handled by the API
 * and the saving state is already managed by the parent cycle actor.
 */
export function useFeelingsDialog(cycleActorRef: ActorRefFrom<typeof cycleMachine>) {
  const dialogVisible = ref(false);

  const feelings = useSelector(cycleActorRef, (state) => state.context.feelings ?? []);
  const savingFeelings = useSelector(cycleActorRef, (state) => state.matches(CycleState.SavingFeelings));

  const openDialog = () => {
    dialogVisible.value = true;
  };

  const closeDialog = () => {
    dialogVisible.value = false;
  };

  const saveFeelings = (selectedFeelings: string[]) => {
    cycleActorRef.send({ type: Event.SAVE_FEELINGS, feelings: selectedFeelings });
  };

  return {
    dialogVisible,
    feelings,
    savingFeelings,
    openDialog,
    closeDialog,
    saveFeelings,
  };
}
