<template>
  <div v-if="loading" class="delete-fast-card delete-fast-card--skeleton">
    <Skeleton width="100px" height="21px" border-radius="4px" />
    <div class="delete-fast-card__description-skeleton">
      <Skeleton width="100%" height="14px" border-radius="4px" />
      <Skeleton width="80%" height="14px" border-radius="4px" />
      <Skeleton width="30%" height="14px" border-radius="4px" />
    </div>
    <Skeleton width="120px" height="38px" border-radius="20px" class="delete-fast-card__button-skeleton" />
  </div>

  <div v-else-if="!error" class="delete-fast-card">
    <h2 class="delete-fast-card__title">Delete Fast</h2>
    <p class="delete-fast-card__description">This action will permanently delete your fast and all associated data.</p>
    <Button
      class="delete-fast-card__button"
      variant="outlined"
      label="Delete Fast"
      rounded
      severity="danger"
      :loading="deleting"
      :disabled="disabled || deleting"
      @click="confirmDialogVisible = true"
    />

    <Dialog
      :visible="confirmDialogVisible"
      modal
      :style="{ width: '350px' }"
      :draggable="false"
      :closable="!deleting"
      @update:visible="confirmDialogVisible = $event"
    >
      <template #header>
        <div class="confirm-delete-header">
          <i class="pi pi-exclamation-circle confirm-delete-header__icon"></i>
          <span class="confirm-delete-header__title">Delete Fast</span>
        </div>
      </template>
      <p class="confirm-delete-message">
        Are you sure you want to delete this fast? <strong>This action cannot be undone.</strong>
      </p>
      <template #footer>
        <div class="confirm-delete-footer">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="deleting"
            @click="confirmDialogVisible = false"
          />
          <Button label="Delete" severity="danger" outlined :loading="deleting" @click="handleConfirmDelete" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  loading: boolean;
  error: boolean;
  deleting: boolean;
  disabled: boolean;
}

interface Emits {
  (e: 'delete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const confirmDialogVisible = ref(false);

function handleConfirmDelete() {
  emit('delete');
}

watch(
  () => props.deleting,
  (isDeleting) => {
    if (!isDeleting) {
      confirmDialogVisible.value = false;
    }
  },
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.delete-fast-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: white;
  border: 1px solid $color-error;
  border-radius: 12px;
  padding: 20px;

  &--skeleton {
    border-color: $color-primary-button-outline;
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-error;
    margin: 0;
  }

  &__description {
    font-size: 14px;
    color: $color-primary-button-text;
    margin: 0;
    line-height: 1.5;
  }

  &__description-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__button {
    align-self: center;
  }

  &__button-skeleton {
    align-self: center;
  }
}

.confirm-delete-header {
  display: flex;
  align-items: center;
  gap: 8px;

  &__icon {
    font-size: 20px;
    color: $color-error;
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
  }
}

.confirm-delete-message {
  margin: 0;
  color: $color-primary-button-text;

  strong {
    font-weight: 700;
  }
}

.confirm-delete-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
