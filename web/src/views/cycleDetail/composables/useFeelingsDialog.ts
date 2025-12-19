import { useSelector } from '@xstate/vue';
import { ref } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { CycleDetailState, Event, type cycleDetailMachine } from '../actors/cycleDetail.actor';

/**
 * Composable for managing the Feelings dialog state in CycleDetailView.
 * Uses a simple ref-based approach since feelings validation is handled by the API
 * and the saving state is already managed by the parent cycle detail actor.
 */
export function useFeelingsDialog(actorRef: ActorRefFrom<typeof cycleDetailMachine>) {
  const dialogVisible = ref(false);

  const feelings = useSelector(actorRef, (state) => state.context.cycle?.feelings ?? []);
  const savingFeelings = useSelector(actorRef, (state) => state.matches(CycleDetailState.SavingFeelings));

  const openDialog = () => {
    dialogVisible.value = true;
  };

  const closeDialog = () => {
    dialogVisible.value = false;
  };

  const saveFeelings = (selectedFeelings: string[]) => {
    actorRef.send({ type: Event.SAVE_FEELINGS, feelings: selectedFeelings });
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
