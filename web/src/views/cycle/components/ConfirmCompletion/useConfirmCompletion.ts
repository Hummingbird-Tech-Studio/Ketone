import { formatDate, formatHour, formatTime } from '@/utils/formatting';
import { useSelector } from '@xstate/vue';
import { type Ref, computed, ref, watch } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { type cycleMachine } from '../../actors/cycle.actor';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;

interface UseConfirmCompletionParams {
  actorRef: ActorRefFrom<typeof cycleMachine>;
  visible: Ref<boolean>;
}

export function useConfirmCompletion({ actorRef, visible }: UseConfirmCompletionParams) {
  const startDate = useSelector(actorRef, (state) => state.context.startDate);
  const endDate = useSelector(actorRef, (state) => state.context.endDate);
  const pendingStartDate = useSelector(actorRef, (state) => state.context.pendingStartDate);
  const pendingEndDate = useSelector(actorRef, (state) => state.context.pendingEndDate);

  // Use pending dates if available, otherwise use regular dates
  const effectiveStartDate = computed(() => pendingStartDate.value ?? startDate.value);
  const effectiveEndDate = computed(() => pendingEndDate.value ?? endDate.value);

  // Calculate total fasting time (from effective start date to effective end date)
  const totalFastingTime = ref(formatTime(0, 0, 0));

  function updateTotalFastingTime() {
    // Calculate from effective start date to effective end date
    const start = effectiveStartDate.value;
    const end = effectiveEndDate.value;

    const elapsedSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

    const hours = Math.floor(elapsedSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((elapsedSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
    const seconds = elapsedSeconds % SECONDS_PER_MINUTE;

    totalFastingTime.value = formatTime(hours, minutes, seconds);
  }

  // Format start date and time
  const startHour = computed(() => formatHour(effectiveStartDate.value));
  const startDateFormatted = computed(() => formatDate(effectiveStartDate.value));

  // Format end date and time
  const endHour = computed(() => formatHour(effectiveEndDate.value));
  const endDateFormatted = computed(() => formatDate(effectiveEndDate.value));

  // Watch for modal opening to calculate initial time
  watch(
    visible,
    (newVisible, oldVisible) => {
      // Calculate when modal opens
      if (newVisible && !oldVisible) {
        updateTotalFastingTime();
      }
    },
    { immediate: true },
  );

  // Recalculate when pending start or end date changes (user editing dates)
  watch([pendingStartDate, pendingEndDate], () => {
    if (visible.value) {
      updateTotalFastingTime();
    }
  });

  return {
    // Formatted dates
    startHour,
    startDateFormatted,
    endHour,
    endDateFormatted,
    // Fasting time
    totalFastingTime,
    // Effective dates for external use
    effectiveStartDate,
    effectiveEndDate,
    // Actor ref for external use
    actorRef,
  };
}
