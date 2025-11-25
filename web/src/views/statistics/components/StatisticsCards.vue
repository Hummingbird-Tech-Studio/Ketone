<template>
  <div class="statistics__cards">
    <div class="statistics__cards__card" v-for="card in cards" :key="card.title">
      <div class="statistics__cards__card__icon">
        <component :is="card.icon" />
      </div>
      <div class="statistics__cards__card__content">
        <div class="statistics__cards__card__title">{{ card.title }}</div>
        <ProgressSpinner v-if="loading" :style="{ width: '21px', height: '21px', margin: 'unset' }" />
        <div v-else class="statistics__cards__card__value">{{ card.value }}</div>
        <div class="statistics__cards__card__subtitle">{{ card.subtitle }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ChartIcon from '@/components/Icons/Chart.vue';
import ClockIcon from '@/components/Icons/Clock.vue';
import CompletedIcon from '@/components/Icons/Completed.vue';
import TrophyIcon from '@/components/Icons/Trophy.vue';
import type { PeriodType } from '@ketone/shared';
import { computed } from 'vue';

interface Props {
  totalTime: string;
  completedFasts: number;
  totalAttempts: number;
  dailyAverage: string;
  longestFast: string;
  selectedPeriod: PeriodType;
  loading: boolean;
}

const props = defineProps<Props>();
const cards = computed(() => [
  {
    icon: ClockIcon,
    title: 'Total time',
    value: props.totalTime,
    subtitle: props.selectedPeriod === 'weekly' ? 'This week' : 'This month',
  },
  {
    icon: CompletedIcon,
    title: 'Completed fasts',
    value: props.completedFasts,
    subtitle: `out of ${props.totalAttempts} attempts`,
  },
  {
    icon: ChartIcon,
    title: 'Average Fast Duration',
    value: props.dailyAverage,
    subtitle: 'Per fasting session',
  },
  {
    icon: TrophyIcon,
    title: 'Longest fast',
    value: props.longestFast,
    subtitle: props.selectedPeriod === 'weekly' ? 'This week' : 'This month',
  },
]);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.statistics__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;

    &__icon {
      flex-shrink: 0;
    }

    &__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    &__title {
      font-size: 14px;
      color: $color-primary-button-text;
      font-weight: 500;
    }

    &__value {
      font-size: 17px;
      font-weight: 700;
      color: $color-primary-button-text;
    }

    &__subtitle {
      font-size: 12px;
      color: $color-primary-button-text;
    }
  }
}
</style>
