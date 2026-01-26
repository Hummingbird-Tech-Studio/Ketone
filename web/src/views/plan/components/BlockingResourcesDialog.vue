<template>
  <Dialog
    :visible="visible"
    modal
    :header="dialogTitle"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="blocking-resources-dialog">
      <div class="blocking-resources-dialog__icon">
        <i class="pi pi-exclamation-circle"></i>
      </div>
      <p class="blocking-resources-dialog__message">
        {{ dialogMessage }}
      </p>
    </div>

    <template #footer>
      <div class="blocking-resources-dialog__actions">
        <Button label="Cancel" severity="secondary" outlined @click="handleCancel" />
        <Button v-if="hasCycle" label="Go to Cycle" @click="handleGoToCycle" />
        <Button v-else-if="hasPlan" label="Go to Plan" @click="handleGoToPlan" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  visible: boolean;
  hasCycle: boolean;
  hasPlan: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'goToCycle'): void;
  (e: 'goToPlan'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const dialogTitle = computed(() => {
  if (props.hasCycle && props.hasPlan) {
    return 'Resources In Progress';
  }
  if (props.hasCycle) {
    return 'Cycle In Progress';
  }
  return 'Plan In Progress';
});

const dialogMessage = computed(() => {
  if (props.hasCycle && props.hasPlan) {
    return 'You have both an active fasting cycle and a plan in progress. To start a new plan, you need to finish your current cycle first.';
  }
  if (props.hasCycle) {
    return 'You have an active fasting cycle. To start a new plan, you need to finish your current cycle first.';
  }
  return 'You have an active plan in progress. To start a new plan, you need to complete or cancel your current plan first.';
});

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleCancel() {
  emit('update:visible', false);
}

function handleGoToCycle() {
  emit('goToCycle');
}

function handleGoToPlan() {
  emit('goToPlan');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.blocking-resources-dialog {
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
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
