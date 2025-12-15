import { useSelector } from '@xstate/vue';
import { ref } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { CycleState, Event, type cycleMachine } from '../actors/cycle.actor';

/**
 * Composable for managing the Notes dialog state.
 * Uses a simple ref-based approach since notes validation is local (character count only)
 * and the saving state is already managed by the parent cycle actor.
 */
export function useNotesDialog(cycleActorRef: ActorRefFrom<typeof cycleMachine>) {
  const dialogVisible = ref(false);

  const notes = useSelector(cycleActorRef, (state) => state.context.notes);
  const savingNotes = useSelector(cycleActorRef, (state) => state.matches(CycleState.SavingNotes));

  const openDialog = () => {
    dialogVisible.value = true;
  };

  const closeDialog = () => {
    dialogVisible.value = false;
  };

  const saveNotes = (notesText: string) => {
    cycleActorRef.send({ type: Event.SAVE_NOTES, notes: notesText });
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
