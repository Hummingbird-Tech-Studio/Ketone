<template>
  <div class="cycle-completed">
    <div class="cycle-completed__message">You have successfully completed your fast.</div>
    <div class="cycle-completed__time">
      <span class="cycle-completed__time__label">Total fasting time:</span>
      <span class="cycle-completed__time__value">{{ summaryDuration }}</span>
    </div>
    <div class="cycle-completed__footer">
      <Button severity="secondary" @click="onViewStatistics" outlined label="View statistics" size="small"/>
      <Button @click="onStartNewFast" :loading outlined label="Start new fast" size="small"/>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  onViewStatistics: () => void;
  onStartNewFast: () => void;
  loading: boolean;
  summaryDuration: string;
}

defineProps<Props>();
</script>

<style lang="scss">
@use '@/styles/variables' as *;

.cycle-completed {
  display: flex;
  flex-direction: column;
  gap: $horizontal-gap;

  &__message {
    font-weight: 400;
    font-size: 12px;
    color: $color-primary-button-text;
  }

  &__time {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 50px;
    justify-content: space-around;
    color: $color-primary-button-text;

    &__label {
      font-size: 14px;
    }

    &__value {
      font-weight: 700;
      font-size: 20px;
    }
  }

  &__footer {
    display: flex;
    flex-direction: row;
    margin-left: auto;
    gap: 8px;
  }
}
</style>