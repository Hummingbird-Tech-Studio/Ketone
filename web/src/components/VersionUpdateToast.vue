<template>
  <Toast position="top-center" group="version-update">
    <template #message="slotProps">
      <div class="version-update-toast">
        <div class="version-update-toast__content">
          <i class="pi pi-refresh version-update-toast__icon"></i>
          <div class="version-update-toast__text">
            <span class="version-update-toast__summary">{{ slotProps.message.summary }}</span>
            <p class="version-update-toast__detail">{{ slotProps.message.detail }}</p>
          </div>
        </div>
        <div class="version-update-toast__actions">
          <Button label="Update Now" severity="primary" size="small" @click="handleUpdate" />
        </div>
      </div>
    </template>
  </Toast>
</template>

<script setup lang="ts">
import { useVersionChecker } from '@/composables/useVersionChecker';

const { reload } = useVersionChecker();

const handleUpdate = () => {
  reload();
};
</script>

<style scoped lang="scss">
.version-update-toast {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;

  &__content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  &__icon {
    font-size: 1.5rem;
    color: var(--p-primary-color);
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
  }

  &__summary {
    font-weight: 600;
    display: block;
    margin-bottom: 4px;
  }

  &__detail {
    margin: 0;
    font-size: 0.875rem;
    color: var(--p-text-muted-color);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
