<template>
  <WeeklyStatisticsChart
    v-if="selectedPeriod === STATISTICS_PERIOD.WEEKLY"
    :cycles="cycles"
    :period-start="periodStart"
    :period-end="periodEnd"
    :loading="loading"
    @previous-period="emit('previousPeriod')"
    @next-period="emit('nextPeriod')"
    @cycle-click="emit('cycleClick', $event)"
  />
  <MonthlyStatisticsChart
    v-else
    :cycles="cycles"
    :period-start="periodStart"
    :period-end="periodEnd"
    :loading="loading"
    @previous-period="emit('previousPeriod')"
    @next-period="emit('nextPeriod')"
    @cycle-click="emit('cycleClick', $event)"
  />
</template>

<script setup lang="ts">
import { type CycleStatisticsItem, type PeriodType, STATISTICS_PERIOD } from '@ketone/shared';
import WeeklyStatisticsChart from './WeeklyStatisticsChart.vue';
import MonthlyStatisticsChart from './MonthlyStatisticsChart.vue';

interface Props {
  selectedPeriod: PeriodType;
  cycles: readonly CycleStatisticsItem[];
  periodStart: Date | undefined;
  periodEnd: Date | undefined;
  loading: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  nextPeriod: [];
  previousPeriod: [];
  cycleClick: [cycleId: string];
}>();
</script>
