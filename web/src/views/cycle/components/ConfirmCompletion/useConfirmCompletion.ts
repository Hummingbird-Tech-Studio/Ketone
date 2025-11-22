import { calculateFastingTime, formatDate, formatHour, formatTime } from '@/utils/formatting';
import { useSelector } from '@xstate/vue';
import { type Ref, computed, ref, watch } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { type cycleMachine } from '../../actors/cycle.actor';

interface UseConfirmCompletionParams {
  actorRef: ActorRefFrom<typeof cycleMachine>;
  visible: Ref<boolean>;
}

export function useConfirmCompletion({ actorRef, visible }: UseConfirmCompletionParams) {
  const pendingStartDate = useSelector(actorRef, (state) => state.context.pendingStartDate);
  const pendingEndDate = useSelector(actorRef, (state) => state.context.pendingEndDate);

  // Calculate total fasting time
  const totalFastingTime = ref(formatTime(0, 0, 0));

  function updateTotalFastingTime() {
    totalFastingTime.value = calculateFastingTime(pendingStartDate.value!, pendingEndDate.value!);
  }

  // Format start date and time
  const startHour = computed(() => formatHour(pendingStartDate.value!));
  const startDate = computed(() => formatDate(pendingStartDate.value!));

  // Format end date and time
  const endHour = computed(() => formatHour(pendingEndDate.value!));
  const endDate = computed(() => formatDate(pendingEndDate.value!));

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
    startDate,
    endHour,
    endDate,
    // Fasting time
    totalFastingTime,
    // Actor ref for external use
    actorRef,
  };
}
