import { useSelector } from '@xstate/vue';
import { ref } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { CycleDetailState, Event, type cycleDetailMachine } from '../actors/cycleDetail.actor';

/**
 * Composable for managing the Notes dialog state in CycleDetailView.
 * Uses a simple ref-based approach since notes validation is local (character count only)
 * and the saving state is already managed by the parent cycle detail actor.
 */
export function useNotesDialog(actorRef: ActorRefFrom<typeof cycleDetailMachine>) {
  const dialogVisible = ref(false);

  const notes = useSelector(actorRef, (state) => state.context.cycle?.notes ?? null);
  const savingNotes = useSelector(actorRef, (state) => state.matches(CycleDetailState.SavingNotes));

  const openDialog = () => {
    dialogVisible.value = true;
  };

  const closeDialog = () => {
    dialogVisible.value = false;
  };

  const saveNotes = (notesText: string) => {
    actorRef.send({ type: Event.SAVE_NOTES, notes: notesText });
  };

  return {
    dialogVisible,
    notes,
    savingNotes,
    openDialog,
    closeDialog,
    saveNotes,
  };
}
