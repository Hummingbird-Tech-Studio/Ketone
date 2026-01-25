<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="plan-ended-dialog">
      <div class="plan-ended-dialog__icon">
        <i class="pi pi-check-circle"></i>
      </div>
      <h2 class="plan-ended-dialog__title">Plan Ended</h2>
      <p class="plan-ended-dialog__message">Your completed fasting days have been saved.</p>

      <div class="plan-ended-dialog__actions">
        <Button label="View statistics" severity="secondary" outlined @click="handleViewStatistics" />
        <Button label="Start new fast" severity="secondary" outlined @click="handleStartNewFast" />
        <Button label="Start new plan" severity="primary" @click="handleStartNewPlan" />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'viewStatistics'): void;
  (e: 'startNewFast'): void;
  (e: 'startNewPlan'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleViewStatistics() {
  emit('viewStatistics');
}

function handleStartNewFast() {
  emit('startNewFast');
}

function handleStartNewPlan() {
  emit('startNewPlan');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-ended-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background-color: var(--p-green-50);

    i {
      font-size: 32px;
      color: var(--p-green-500);
    }
  }

  &__title {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__message {
    font-size: 14px;
    line-height: 1.5;
    color: $color-primary-light-text;
    margin: 0;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    margin-top: 8px;
  }
}
</style>
