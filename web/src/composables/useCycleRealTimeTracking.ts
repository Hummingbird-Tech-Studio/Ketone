import { onUnmounted, ref } from 'vue';
import { useSelector } from '@xstate/vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { CycleState, Emit } from '@/views/cycle/actors/cycle.actor';

/**
 * Composable for tracking real-time cycle updates.
 * Manages the current time reference and determines when to use real-time vs static time.
 *
 * @param cycleActor - The cycle state machine actor
 * @returns Object with current time and real-time update flag
 */
export function useCycleRealTimeTracking(cycleActor: Actor<AnyActorLogic>) {
  // Track current time for real-time calculations
  const now = ref(new Date());

  // Check if the cycle should update in real-time (timer is running)
  const shouldUpdateRealTime = useSelector(cycleActor, (state) =>
    state.matches(CycleState.InProgress) ||
    state.matches(CycleState.Updating) ||
    state.matches(CycleState.ConfirmCompletion)
  );

  // Subscribe to TICK events to update current time
  const tickSubscription = cycleActor.on(Emit.TICK, () => {
    now.value = new Date();
  });

  // Cleanup subscription on unmount
  onUnmounted(() => {
    tickSubscription.unsubscribe();
  });

  return {
    now,
    shouldUpdateRealTime,
  };
}
