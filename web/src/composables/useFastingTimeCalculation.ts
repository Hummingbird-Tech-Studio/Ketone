import { calculateFastingTime, formatTime } from '@/utils/formatting';
import { computed, type Ref } from 'vue';

/**
 * Composable to calculate fasting time between two dates
 * @param startDate - Reactive reference to the start date
 * @param endDate - Reactive reference to the end date
 * @returns Computed property with formatted fasting time (HH:MM:SS)
 */
export function useFastingTimeCalculation(
  startDate: Ref<Date | null | undefined>,
  endDate: Ref<Date | null | undefined>,
) {
  return computed(() => {
    if (startDate.value && endDate.value) {
      return calculateFastingTime(startDate.value, endDate.value);
    }
    return formatTime(0, 0, 0);
  });
}
