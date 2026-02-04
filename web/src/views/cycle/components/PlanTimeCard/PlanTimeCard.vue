<template>
  <div class="plan-time-card" :class="{ 'plan-time-card--start': isStart, 'plan-time-card--end': !isStart }">
    <template v-if="loading">
      <div class="plan-time-card__icon">
        <Skeleton width="32px" height="32px" border-radius="8px" />
      </div>
      <div class="plan-time-card__content">
        <Skeleton width="80px" height="14px" border-radius="4px" />
        <Skeleton width="100px" height="24px" border-radius="4px" />
        <Skeleton width="90px" height="14px" border-radius="4px" />
      </div>
    </template>

    <template v-else>
      <div class="plan-time-card__icon">
        <component :is="isStart ? StartTimeIcon : EndTimeIcon" />
      </div>
      <div class="plan-time-card__content">
        <div class="plan-time-card__title">
          {{ title }}
        </div>
        <div class="plan-time-card__hour">
          {{ formatHour(date) }}
        </div>
        <div class="plan-time-card__date">
          {{ formatDate(date) }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import EndTimeIcon from '@/components/Icons/EndTime.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import { formatDate, formatHour } from '@/utils';
import { computed } from 'vue';

interface Props {
  title: string;
  date: Date;
  variant?: 'start' | 'end';
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'start',
  loading: false,
});

const isStart = computed(() => props.variant === 'start');
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-time-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background-color: #fafafa;

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  &--start &__icon {
    background: rgba(45, 179, 94, 0.1);
  }

  &--end &__icon {
    background: rgba(171, 67, 234, 0.1);
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__hour {
    font-size: 20px;
    color: $color-primary-button-text;
  }

  &__date {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-light-text;
  }
}
</style>
