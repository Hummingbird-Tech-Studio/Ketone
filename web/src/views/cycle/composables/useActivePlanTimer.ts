import { formatTime } from '@/utils';
import type { PeriodResponse } from '@ketone/shared';
import { useSelector } from '@xstate/vue';
import { computed, onUnmounted, ref, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';
import { ActivePlanState, Emit } from '../actors/activePlan.actor';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;
const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;

interface UseActivePlanTimerParams {
  activePlanActor: Actor<AnyActorLogic>;
  currentPeriod: Ref<PeriodResponse | null>;
  windowPhase: Ref<'fasting' | 'eating' | null>;
  endedAt: Ref<Date | null>;
}

/**
 * Composable for calculating timer values for active plan view.
 * Calculates elapsed and remaining time based on the current window phase.
 *
 * For fasting window: tracks time from fastingStartDate to fastingEndDate
 * For eating window: tracks time from fastingEndDate to eatingEndDate
 */
export function useActivePlanTimer({ activePlanActor, currentPeriod, windowPhase, endedAt }: UseActivePlanTimerParams) {
  const now = ref(new Date());

  const shouldUpdateRealTime = useSelector(
    activePlanActor,
    (state) =>
      state.matches(ActivePlanState.WaitingForPlanStart) ||
      state.matches(ActivePlanState.InFastingWindow) ||
      state.matches(ActivePlanState.InEatingWindow),
  );

  const tickSubscription = activePlanActor.on(Emit.TICK, () => {
    now.value = new Date();
  });

  onUnmounted(() => {
    tickSubscription.unsubscribe();
  });

  function calculateTime(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    return formatTime(hours, minutes, seconds);
  }

  /**
   * Get the start and end dates for the current window (using explicit API timestamps)
   */
  const windowBounds = computed(() => {
    if (!currentPeriod.value || !windowPhase.value) {
      return { start: new Date(), end: new Date() };
    }

    const period = currentPeriod.value;

    if (windowPhase.value === 'fasting') {
      return {
        start: period.fastingStartDate,
        end: period.fastingEndDate,
      };
    }

    // Eating window
    return {
      start: period.fastingEndDate,
      end: period.eatingEndDate,
    };
  });

  /**
   * Fasting start date
   */
  const fastingStartDate = computed(() => {
    if (!currentPeriod.value) return new Date();
    return currentPeriod.value.fastingStartDate;
  });

  /**
   * Fasting end date
   */
  const fastingEndDate = computed(() => {
    if (!currentPeriod.value) return new Date();
    return currentPeriod.value.fastingEndDate;
  });

  /**
   * Elapsed time within the current window
   */
  const elapsedTime = computed(() => {
    if (!currentPeriod.value || !windowPhase.value) {
      return formatTime(0, 0, 0);
    }

    const { start } = windowBounds.value;
    // Use real-time when active, snapshot time when plan was ended, or window end as fallback
    const referenceTime = shouldUpdateRealTime.value ? now.value : (endedAt.value ?? windowBounds.value.end);
    const elapsedSeconds = Math.max(0, Math.floor((referenceTime.getTime() - start.getTime()) / 1000));
    return calculateTime(elapsedSeconds);
  });

  /**
   * Remaining time within the current window
   */
  const remainingTime = computed(() => {
    if (!currentPeriod.value || !windowPhase.value) {
      return formatTime(0, 0, 0);
    }

    const { end } = windowBounds.value;
    // Use real-time when active, snapshot time when plan was ended, or window end as fallback
    const referenceTime = shouldUpdateRealTime.value ? now.value : (endedAt.value ?? end);
    const remainingSeconds = Math.max(0, Math.floor((end.getTime() - referenceTime.getTime()) / 1000));
    return calculateTime(remainingSeconds);
  });

  /**
   * Progress percentage within the current window (0-100)
   */
  const progressPercentage = computed(() => {
    if (!currentPeriod.value || !windowPhase.value) {
      return MIN_PERCENTAGE;
    }

    const { start, end } = windowBounds.value;
    const totalDuration = end.getTime() - start.getTime();

    if (totalDuration <= 0) {
      return MIN_PERCENTAGE;
    }

    // Use real-time when active, snapshot time when plan was ended, or window end as fallback
    const referenceTime = shouldUpdateRealTime.value ? now.value : (endedAt.value ?? end);
    const elapsed = referenceTime.getTime() - start.getTime();
    const percentage = (elapsed / totalDuration) * MAX_PERCENTAGE;

    return Math.max(MIN_PERCENTAGE, Math.min(percentage, MAX_PERCENTAGE));
  });

  return {
    now,
    elapsedTime,
    remainingTime,
    progressPercentage,
    fastingStartDate,
    fastingEndDate,
    windowBounds,
  };
}
