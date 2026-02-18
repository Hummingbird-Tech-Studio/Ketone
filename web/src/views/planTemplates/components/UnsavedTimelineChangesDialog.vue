<template>
  <Dialog
    :visible="visible"
    modal
    header="Unsaved Timeline Changes"
    :style="{ width: '380px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="unsaved-timeline-dialog">
      <div class="unsaved-timeline-dialog__icon">
        <i class="pi pi-exclamation-circle"></i>
      </div>
      <p class="unsaved-timeline-dialog__message">
        Your timeline has unsaved changes. How would you like to handle them before starting the plan?
      </p>

      <div class="unsaved-timeline-dialog__actions">
        <Button label="Start Plan Without Saving" severity="secondary" outlined @click="handleStartWithoutSaving" />
        <Button label="Save as New & Start" outlined @click="handleSaveAsNew" />
        <Button label="Update Template & Start" @click="handleUpdateTemplate" />
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
  (e: 'updateTemplate'): void;
  (e: 'saveAsNew'): void;
  (e: 'startWithoutSaving'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleUpdateTemplate() {
  emit('updateTemplate');
}

function handleSaveAsNew() {
  emit('saveAsNew');
}

function handleStartWithoutSaving() {
  emit('startWithoutSaving');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.unsaved-timeline-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--p-orange-50);

    i {
      font-size: 28px;
      color: var(--p-orange-500);
    }
  }

  &__message {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: $color-primary-light-text;
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
