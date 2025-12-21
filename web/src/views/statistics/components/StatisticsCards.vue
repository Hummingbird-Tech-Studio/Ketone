<template>
  <div class="statistics__cards">
    <template v-if="showSkeleton">
      <div class="statistics__cards__card" v-for="i in 4" :key="i">
        <div class="statistics__cards__card__icon">
          <Skeleton width="32px" height="32px" border-radius="20%" />
        </div>
        <div class="statistics__cards__card__content">
          <Skeleton width="80px" height="17px" border-radius="4px" />
          <Skeleton width="60px" height="20px" border-radius="4px" />
          <Skeleton width="100px" height="15px" border-radius="4px" />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="statistics__cards__card" v-for="card in cards" :key="card.title">
        <div :class="['statistics__cards__card__icon', `statistics__cards__card__icon--${card.id}`]">
          <component :is="card.icon" />
        </div>
        <div class="statistics__cards__card__content">
          <div class="statistics__cards__card__title">{{ card.title }}</div>
          <ProgressSpinner v-if="loading" :style="{ width: '21px', height: '21px', margin: 'unset' }" />
          <div v-else class="statistics__cards__card__value">{{ card.value }}</div>
          <div class="statistics__cards__card__subtitle">{{ card.subtitle }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import ChartIcon from '@/components/Icons/Chart.vue';
import ClockIcon from '@/components/Icons/Clock.vue';
import CompletedIcon from '@/components/Icons/Completed.vue';
import TrophyIcon from '@/components/Icons/Trophy.vue';
import { STATISTICS_PERIOD, type PeriodType } from '@ketone/shared';
import { computed } from 'vue';

interface Props {
  totalTime: string;
  completedFasts: number;
  totalAttempts: number;
  dailyAverage: string;
  longestFast: string;
  selectedPeriod: PeriodType;
  loading: boolean;
  showSkeleton: boolean;
}

const props = defineProps<Props>();
const cards = computed(() => [
  {
    id: 'clock',
    icon: ClockIcon,
    title: 'Total time',
    value: props.totalTime,
    subtitle: props.selectedPeriod === STATISTICS_PERIOD.WEEKLY ? 'This week' : 'This month',
  },
  {
    id: 'completed',
    icon: CompletedIcon,
    title: 'Completed fasts',
    value: props.completedFasts,
    subtitle: `out of ${props.totalAttempts} attempts`,
  },
  {
    id: 'chart',
    icon: ChartIcon,
    title: 'Average Fast Duration',
    value: props.dailyAverage,
    subtitle: 'Per fasting session',
  },
  {
    id: 'trophy',
    icon: TrophyIcon,
    title: 'Longest fast',
    value: props.longestFast,
    subtitle: props.selectedPeriod === STATISTICS_PERIOD.WEEKLY ? 'This week' : 'This month',
  },
]);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.statistics__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media only screen and (min-width: $breakpoint-tablet-min-width) {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  &__card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;

    &__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      flex-shrink: 0;

      svg {
        width: 16px;
        height: 16px;
      }

      &--clock {
        background: #f6e6ff;
      }

      &--completed {
        background: #c7f9cc;
      }

      &--chart {
        background: $color-light-blue;
      }

      &--trophy {
        background: $color-orange-light;
      }
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
