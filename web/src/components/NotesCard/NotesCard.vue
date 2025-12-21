<template>
  <div class="notes-card">
    <div class="notes-card__title">{{ title }}</div>
    <div class="notes-card__row">
      <div class="notes-card__content">
        <div class="notes-card__icon">
          <NoteIcon />
        </div>
        <div v-if="notes" class="notes-card__preview">{{ notes }}</div>
        <div v-else class="notes-card__empty">No notes added</div>
      </div>

      <Button
        type="button"
        icon="pi pi-pencil"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Edit Notes"
        @click="$emit('edit')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import NoteIcon from '@/components/Icons/NoteIcon.vue';

withDefaults(
  defineProps<{
    title?: string;
    notes: string | null;
  }>(),
  {
    title: 'Note about this fast',
  },
);

defineEmits<{
  (e: 'edit'): void;
}>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.notes-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 8px;

  &__title {
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__content {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    background: $color-orange-light;
    border-radius: 8px;
    flex-shrink: 0;

    svg {
      width: 36px;
      height: 36px;
    }
  }

  &__preview {
    font-size: 14px;
    color: $color-primary-button-text;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__empty {
    font-size: 14px;
    color: $color-primary-button-text;
    opacity: 0.6;
  }
}
</style>
