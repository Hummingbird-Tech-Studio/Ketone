<template>
  <div class="statistics">
    <div class="statistics__header">
      <h1 class="statistics__title">Fasting Statistics</h1>
      <SelectButton
        v-model="selectedPeriod"
        :options="periodOptions"
        optionLabel="label"
        optionValue="value"
        class="statistics__period-selector"
      />
    </div>
    <!--    <StatisticsCards-->
    <!--      :total-time="totalTime"-->
    <!--      :completed-fasts="completedFasts"-->
    <!--      :total-attempts="totalAttempts"-->
    <!--      :daily-average="dailyAverage"-->
    <!--      :longest-fast="longestFast"-->
    <!--      :selected-period="selectedPeriod"-->
    <!--      :loading="isLoading"-->
    <!--    />-->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

enum TimePeriod {
  Week = 'week',
  Month = 'month',
}

const periodOptions = [
  { label: 'Week', value: TimePeriod.Week },
  { label: 'Month', value: TimePeriod.Month },
];

const selectedPeriod = ref<TimePeriod>(TimePeriod.Week);
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
