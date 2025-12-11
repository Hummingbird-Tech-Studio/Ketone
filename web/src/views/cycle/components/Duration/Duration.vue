<template>
  <div class="duration">
    <template v-if="loading">
      <Skeleton width="32px" height="32px" border-radius="50%" />
      <Skeleton width="100px" height="32px" border-radius="10px" />
      <Skeleton width="32px" height="32px" border-radius="50%" />
    </template>

    <template v-else>
      <Button
        type="button"
        icon="pi pi-minus"
        rounded
        outlined
        severity="secondary"
        size="small"
        @click="emit('decrement')"
        :ariaLabel="'Decrease duration'"
        :disabled="completed || !canDecrement"
      />
      <div class="duration__hours">
        {{ duration }}
      </div>
      <Button
        type="button"
        icon="pi pi-plus"
        rounded
        outlined
        severity="secondary"
        size="small"
        @click="emit('increment')"
        :ariaLabel="'Increase duration'"
        :disabled="completed"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
interface Props {
  loading: boolean;
  completed: boolean;
  duration: string;
  canDecrement: boolean;
}

interface Emits {
  (e: 'increment'): void;
  (e: 'decrement'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.duration {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: space-evenly;

  &__hours {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100px;
    height: 32px;
    border: 1px solid $color-primary-button-outline;
    border-radius: 10px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
}
</style>
