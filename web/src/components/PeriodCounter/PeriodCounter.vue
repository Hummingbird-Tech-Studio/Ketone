<template>
  <div class="period-counter">
    <span class="period-counter__label">Periods</span>
    <div class="period-counter__controls">
      <Button
        type="button"
        icon="pi pi-minus"
        rounded
        variant="outlined"
        severity="secondary"
        size="small"
        aria-label="Remove period"
        :disabled="disabled || count <= min"
        @click="$emit('decrement')"
      />
      <span class="period-counter__count">{{ count }}</span>
      <Button
        type="button"
        icon="pi pi-plus"
        rounded
        variant="outlined"
        severity="secondary"
        size="small"
        aria-label="Add period"
        :disabled="disabled || count >= max"
        @click="$emit('increment')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { MAX_PERIODS, MIN_PERIODS } from '@/views/plan/domain';

const min = MIN_PERIODS;
const max = MAX_PERIODS;

withDefaults(
  defineProps<{
    count: number;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

defineEmits<{
  (e: 'increment'): void;
  (e: 'decrement'): void;
}>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.period-counter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;
  align-self: center;

  &__label {
    font-size: 14px;
    font-weight: 600;
    color: $color-primary-button-text;
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  &__count {
    font-size: 20px;
    font-weight: 700;
    color: $color-primary-button-text;
    min-width: 32px;
    text-align: center;
  }
}
</style>
