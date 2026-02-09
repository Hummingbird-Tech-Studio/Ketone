<template>
  <div class="plan-template-card">
    <div class="plan-template-card__content" @click="$emit('edit')">
      <div class="plan-template-card__info">
        <h3 class="plan-template-card__name">{{ name }}</h3>
        <p v-if="description" class="plan-template-card__description">{{ description }}</p>
        <span class="plan-template-card__period-count">{{ periodCountLabel }}</span>
      </div>
    </div>

    <div class="plan-template-card__actions">
      <Button
        icon="pi pi-ellipsis-v"
        variant="text"
        severity="secondary"
        rounded
        aria-label="Actions"
        :disabled="isBusy"
        @click="toggleMenu"
      />
      <Menu ref="menuRef" :model="menuItems" :popup="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatPeriodCountLabel } from '../domain/services/plan-template.service';

const props = defineProps<{
  /** Template display name */
  name: string;
  /** Optional description */
  description: string | null;
  /** Number of periods in this template */
  periodCount: number;
  /** Whether an operation is in progress (disables actions) */
  isBusy: boolean;
  /** Whether the template limit has been reached (disables duplicate) */
  isLimitReached: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  duplicate: [];
  delete: [];
}>();

const menuRef = ref();

const periodCountLabel = computed(() => formatPeriodCountLabel(props.periodCount));

const menuItems = computed(() => [
  {
    label: 'Edit',
    icon: 'pi pi-pencil',
    command: () => emit('edit'),
  },
  {
    label: 'Duplicate',
    icon: 'pi pi-copy',
    disabled: props.isLimitReached,
    command: () => emit('duplicate'),
  },
  {
    separator: true,
  },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => emit('delete'),
  },
]);

const toggleMenu = (event: Event) => {
  menuRef.value.toggle(event);
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-template-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: $color-white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;
  transition: all 0.2s;

  &:hover {
    border-color: $color-primary-light-text;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  &__content {
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__name {
    font-size: 15px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__description {
    font-size: 13px;
    color: $color-primary-light-text;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__period-count {
    font-size: 12px;
    color: $color-primary-light-text;
    opacity: 0.7;
  }

  &__actions {
    flex-shrink: 0;
  }
}
</style>
