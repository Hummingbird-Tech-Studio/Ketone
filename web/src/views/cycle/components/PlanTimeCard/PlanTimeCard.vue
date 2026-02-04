<template>
  <div class="plan-time-card" :class="{ 'plan-time-card--start': isStart, 'plan-time-card--end': !isStart }">
    <template v-if="loading">
      <div class="plan-time-card__icon">
        <Skeleton width="32px" height="32px" border-radius="8px" />
      </div>
      <div class="plan-time-card__content">
        <Skeleton width="80px" height="16px" border-radius="4px" />
        <Skeleton width="100px" height="14px" border-radius="4px" />
      </div>
    </template>

    <template v-else>
      <div class="plan-time-card__icon">
        <component :is="isStart ? StartTimeIcon : EndTimeIcon" />
      </div>
      <div class="plan-time-card__content">
        <div class="plan-time-card__label">{{ title }}:</div>
        <div class="plan-time-card__value">{{ formattedDateTime }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import EndTimeIcon from '@/components/Icons/EndTime.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
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

const formattedDateTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(props.date);
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-time-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba($color-primary-button-outline, 0.3);
  border-radius: 8px;

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
    background: rgba($color-theme-green, 0.1);
  }

  &--end &__icon {
    background: rgba($color-dark-purple, 0.1);
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__label {
    font-weight: 600;
    font-size: 16px;
    color: $color-primary-button-text;
  }

  &__value {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
}
</style>
