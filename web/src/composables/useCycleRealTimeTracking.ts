import { CycleState, Emit } from '@/views/cycle/actors/cycle.actor';
import { useSelector } from '@xstate/vue';
import { onUnmounted, ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';

/**
 * Composable for tracking real-time cycle updates.
 * Manages the current time reference and determines when to use real-time vs static time.
 *
 * @param cycleActor - The cycle state machine actor
 * @returns Object with current time and real-time update flag
 */
export function useCycleRealTimeTracking(cycleActor: Actor<AnyActorLogic>) {
  const now = ref(new Date());

  const shouldUpdateRealTime = useSelector(
    cycleActor,
    (state) =>
      state.matches(CycleState.InProgress) ||
      state.matches(CycleState.Creating) ||
      state.matches(CycleState.Updating) ||
      state.matches(CycleState.ConfirmCompletion) ||
      state.matches(CycleState.Finishing) ||
      state.matches(CycleState.SavingNotes),
  );

  const tickSubscription = cycleActor.on(Emit.TICK, () => {
    now.value = new Date();
  });

  onUnmounted(() => {
    tickSubscription.unsubscribe();
  });

  return {
    now,
    shouldUpdateRealTime,
  };
}
