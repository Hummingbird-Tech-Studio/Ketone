<template>
  <div class="statistics">
    <div class="statistics__header">
      <h1 class="statistics__title">Fasting Statistics</h1>
      <SelectButton
        v-model="selectedPeriodLocal"
        :options="periodOptions"
        optionLabel="label"
        optionValue="value"
        class="statistics__period-selector"
      />
    </div>
    <StatisticsCards
      :total-time="totalTime"
      :completed-fasts="completedFasts"
      :total-attempts="totalAttempts"
      :daily-average="dailyAverage"
      :longest-fast="longestFast"
      :selected-period="selectedPeriod"
      :loading="loading"
      :show-skeleton="showSkeleton"
    />
  </div>
</template>

<script setup lang="ts">
import { STATISTICS_PERIOD, type PeriodType } from '@ketone/shared';
import { computed, onMounted, ref, watch } from 'vue';
import StatisticsCards from './components/StatisticsCards.vue';
import { useStatistics } from './composables/useStatistics';
import { useStatisticsNotifications } from './composables/useStatisticsNotifications';

const periodOptions = [
  { label: 'Week', value: STATISTICS_PERIOD.WEEKLY },
  { label: 'Month', value: STATISTICS_PERIOD.MONTHLY },
];

const selectedPeriodLocal = ref<PeriodType>(STATISTICS_PERIOD.WEEKLY);

const { loadStatistics, actorRef, statistics, selectedPeriod, loading, showSkeleton, changePeriod } = useStatistics();

useStatisticsNotifications(actorRef);

// Helper to format duration in ms to "Xh Ym"
const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

// Calculate cycle duration
const getCycleDuration = (cycle: { startDate: Date; endDate: Date }) =>
  cycle.endDate.getTime() - cycle.startDate.getTime();

// Total time: sum of all durations
const totalTime = computed(() => {
  if (!statistics.value?.cycles.length) return '0m';
  const total = statistics.value.cycles.reduce((acc, c) => acc + getCycleDuration(c), 0);
  return formatDuration(total);
});

const completedFasts = computed(() => statistics.value?.cycles.filter((c) => c.status === 'Completed').length ?? 0);
const totalAttempts = computed(() => statistics.value?.cycles.length ?? 0);

// Average duration: total / completedFasts
const dailyAverage = computed(() => {
  const completed = statistics.value?.cycles.filter((c) => c.status === 'Completed') ?? [];
  if (completed.length === 0) return '0m';
  const total = completed.reduce((acc, c) => acc + getCycleDuration(c), 0);
  return formatDuration(total / completed.length);
});

// Longest fast: the longest cycle
const longestFast = computed(() => {
  if (!statistics.value?.cycles.length) return '0m';
  const longest = Math.max(...statistics.value.cycles.map(getCycleDuration));
  return formatDuration(longest);
});

// Sync local period with actor and trigger reload
watch(selectedPeriodLocal, (newPeriod) => {
  changePeriod(newPeriod);
});

onMounted(() => {
  loadStatistics();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.statistics {
  display: flex;
  flex-direction: column;
  width: 312px;
  margin: auto;
  gap: 16px;

  &__header {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__title {
    font-size: 18px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__period-selector {
    :deep(.p-selectbutton) {
      display: flex;
      border-radius: 8px;
      overflow: hidden;
    }

    :deep(.p-button) {
      flex: 1;
      background: $color-primary-button-outline;
      border: 1px solid $color-primary-button-outline;
      color: $color-primary-button-text;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 0;

      &:first-child {
        border-top-left-radius: 8px;
        border-bottom-left-radius: 8px;
      }

      &:last-child {
        border-top-right-radius: 8px;
        border-bottom-right-radius: 8px;
        border-left: none;
      }

      &.p-highlight {
        background: $color-primary-button-text;
        color: white;
        border-color: $color-primary-button-text;
      }

      &:hover:not(.p-highlight) {
        background: $color-primary-button-text;
      }
    }
  }
}
</style>
