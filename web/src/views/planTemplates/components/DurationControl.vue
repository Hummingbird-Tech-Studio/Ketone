<template>
  <div class="duration-control">
    <span class="duration-control__label">{{ label }}</span>
    <div class="duration-control__input">
      <Button
        type="button"
        icon="pi pi-minus"
        rounded
        outlined
        severity="secondary"
        size="small"
        :aria-label="`Decrease ${label}`"
        :disabled="disabled || !canDecrement"
        @click="decrement"
      />
      <span class="duration-control__value">{{ formatDuration(value) }}</span>
      <Button
        type="button"
        icon="pi pi-plus"
        rounded
        outlined
        severity="secondary"
        size="small"
        :aria-label="`Increase ${label}`"
        :disabled="disabled || !canIncrement"
        @click="increment"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDuration } from '@/components/Timeline';
import { DURATION_STEP_HOURS } from '@/views/plan/domain';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
  }>(),
  {
    step: DURATION_STEP_HOURS,
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: 'update:value', value: number): void;
}>();

const canDecrement = computed(() => props.value > props.min);
const canIncrement = computed(() => props.value < props.max);

const snap = (v: number) => {
  const factor = 1 / props.step;
  return Math.round(v * factor) / factor;
};

const decrement = () => {
  const newValue = snap(props.value - props.step);
  if (newValue >= props.min) emit('update:value', newValue);
};

const increment = () => {
  const newValue = snap(props.value + props.step);
  if (newValue <= props.max) emit('update:value', newValue);
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.duration-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  &__label {
    font-size: 12px;
    font-weight: 600;
    color: $color-primary-light-text;
  }

  &__input {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__value {
    font-size: 16px;
    font-weight: 700;
    color: $color-primary-button-text;
    min-width: 48px;
    text-align: center;
  }
}
</style>
