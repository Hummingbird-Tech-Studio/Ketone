<template>
  <Dialog
    :visible="visible"
    modal
    header="Plan Created"
    :style="{ width: '350px' }"
    :draggable="false"
    :closable="!savingTemplate"
    @update:visible="handleVisibilityChange"
  >
    <div class="plan-created-dialog">
      <div class="plan-created-dialog__icon">
        <i class="pi pi-check-circle"></i>
      </div>
      <p class="plan-created-dialog__message">Your plan is ready. Would you like to save it as a reusable template?</p>
    </div>

    <template #footer>
      <div class="plan-created-dialog__actions">
        <Button
          label="Save as Template"
          severity="secondary"
          outlined
          :loading="savingTemplate"
          :disabled="savingTemplate"
          @click="$emit('saveAsTemplate')"
        />
        <Button label="Go to Plan" :disabled="savingTemplate" @click="$emit('goToPlan')" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean;
  savingTemplate: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'saveAsTemplate'): void;
  (e: 'goToPlan'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-created-dialog {
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
    background-color: var(--p-green-50);

    i {
      font-size: 28px;
      color: var(--p-green-500);
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
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
