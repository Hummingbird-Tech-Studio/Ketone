<template>
  <button
    type="button"
    class="plan-template-card"
    :aria-label="`${name} - ${periodCountLabel}`"
    @click="$emit('edit')"
    @contextmenu.prevent="toggleMenu"
  >
    <div class="plan-template-card__name">{{ name }}</div>
    <div class="plan-template-card__period-count">{{ periodCountLabel }}</div>
    <div v-if="description" class="plan-template-card__description">
      {{ description }}
    </div>
    <Menu ref="menuRef" :model="menuItems" :popup="true" />
  </button>
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
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: $color-white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
  width: 100%;

  &:hover {
    border-color: $color-primary-light-text;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  &:focus-visible {
    outline: 2px solid $color-primary;
    outline-offset: 2px;
  }

  &__name {
    font-size: 20px;
    font-weight: 700;
    color: $color-primary-button-text;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__period-count {
    font-size: 12px;
    color: $color-primary-light-text;
  }

  &__description {
    font-size: 13px;
    font-weight: 500;
    color: $color-primary;
    margin-top: 8px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
  }
}
</style>
