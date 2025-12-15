import { cycleMachine, CycleState, Event } from '@/views/cycle/actors/cycle.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing cycle state and actions
 *
 * @example
 * ```ts
 * const { loading, inProgress, cycleMetadata, startDate, endDate, loadActiveCycle } = useCycle();
 * ```
 */
export function useCycle() {
  const { send, actorRef } = useActor(cycleMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(CycleState.Idle));
  const isActionButtonLoading = useSelector(
    actorRef,
    (state) =>
      state.matches(CycleState.Creating) || state.matches(CycleState.Updating) || state.matches(CycleState.Finishing),
  );
  const creating = useSelector(actorRef, (state) => state.matches(CycleState.Creating));
  const inProgress = useSelector(actorRef, (state) => state.matches(CycleState.InProgress));
  const updating = useSelector(actorRef, (state) => state.matches(CycleState.Updating));
  const confirmCompletion = useSelector(
    actorRef,
    (state) => state.matches(CycleState.ConfirmCompletion) || state.matches(CycleState.Finishing),
  );
  const finishing = useSelector(actorRef, (state) => state.matches(CycleState.Finishing));
  const completed = useSelector(actorRef, (state) => state.matches(CycleState.Completed));
  const savingNotes = useSelector(actorRef, (state) => state.matches(CycleState.SavingNotes));

  // Context data
  const cycleMetadata = useSelector(actorRef, (state) => state.context.cycleMetadata);
  const startDate = useSelector(actorRef, (state) => state.context.startDate);
  const endDate = useSelector(actorRef, (state) => state.context.endDate);
  const notes = useSelector(actorRef, (state) => state.context.notes);

  const loading = useSelector(actorRef, (state) => state.matches(CycleState.Loading));
  const showSkeleton = computed(() => loading.value && cycleMetadata.value === null);

  // Actions
  const loadActiveCycle = () => {
    send({
      type: Event.LOAD,
    });
  };

  const createCycle = () => {
    send({
      type: Event.CREATE,
    });
  };

  const saveNotes = (notesText: string) => {
    send({ type: Event.SAVE_NOTES, notes: notesText });
  };

  const buttonText = computed(() => {
    if (idle.value || creating.value) {
      return 'Start Fasting';
    }

    if (completed.value) {
      return 'Start New Fast';
    }

    if (inProgress.value || updating.value || finishing.value || confirmCompletion.value) {
      return 'Finish Fasting';
    }

    return 'Start Fasting';
  });

  const handleButtonClick = () => {
    if (idle.value) {
      send({ type: Event.CREATE });
    }

    if (inProgress.value) {
      send({ type: Event.CONFIRM_COMPLETION });
    }

    if (completed.value) {
      send({ type: Event.CREATE });
    }
  };

  return {
    // State checks
    idle,
    isActionButtonLoading,
    creating,
    inProgress,
    updating,
    confirmCompletion,
    finishing,
    completed,
    savingNotes,
    // Context data
    cycleMetadata,
    startDate,
    endDate,
    notes,
    // UI helpers
    showSkeleton,
    // Actions
    loadActiveCycle,
    createCycle,
    saveNotes,
    handleButtonClick,
    // UI text
    buttonText,
    // Actor ref
    actorRef,
  };
}
