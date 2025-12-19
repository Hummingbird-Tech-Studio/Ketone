<template>
  <Dialog
    :visible="visible"
    modal
    header="How did you feel?"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleDialogVisibilityChange"
  >
    <div class="feelings-dialog">
      <div class="feelings-dialog__grid">
        <button
          v-for="feeling in FASTING_FEELINGS"
          :key="feeling"
          type="button"
          :class="['feelings-dialog__option', { 'feelings-dialog__option--selected': localFeelings.includes(feeling) }]"
          :disabled="!localFeelings.includes(feeling) && localFeelings.length >= MAX_FEELINGS_PER_CYCLE"
          @click="toggleFeeling(feeling)"
        >
          <div :class="['feelings-dialog__icon', `feelings-dialog__icon--${feeling}`]">
            <component :is="getFeelingIcon(feeling)" />
          </div>
          <span class="feelings-dialog__label">{{ formatFeelingLabel(feeling) }}</span>
        </button>
      </div>
    </div>

    <template #footer>
      <div class="feelings-dialog__actions">
        <Button label="Cancel" severity="secondary" outlined @click="handleCancel" />
        <Button label="Save" :loading="loading" :disabled="!hasChanged" @click="handleSave" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { getFeelingIcon } from '@/components/Icons/Feelings/feelingIcons';
import { FASTING_FEELINGS, MAX_FEELINGS_PER_CYCLE } from '@ketone/shared';
import { computed, ref, watch } from 'vue';

interface Props {
  visible: boolean;
  feelings: readonly string[];
  loading?: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'save', feelings: string[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localFeelings = ref<string[]>([...props.feelings]);

function formatFeelingLabel(feeling: string): string {
  return feeling.charAt(0).toUpperCase() + feeling.slice(1);
}

function toggleFeeling(feeling: string) {
  const index = localFeelings.value.indexOf(feeling);
  if (index === -1) {
    if (localFeelings.value.length < MAX_FEELINGS_PER_CYCLE) {
      localFeelings.value.push(feeling);
    }
  } else {
    localFeelings.value.splice(index, 1);
  }
}

// Reset local state when dialog opens
watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      localFeelings.value = [...props.feelings];
    }
  },
);

// Sync local feelings when prop changes
watch(
  () => props.feelings,
  (newVal) => {
    localFeelings.value = [...newVal];
  },
);

const hasChanged = computed(() => {
  if (localFeelings.value.length !== props.feelings.length) return true;
  const sortedLocal = [...localFeelings.value].sort();
  const sortedProps = [...props.feelings].sort();
  return sortedLocal.some((f, i) => f !== sortedProps[i]);
});

function handleDialogVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleSave() {
  emit('save', [...localFeelings.value]);
}

function handleCancel() {
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.feelings-dialog {
  &__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  &__option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid $color-primary-button-outline;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      border-color: $color-primary;
    }

    &--selected {
      border-color: $color-primary;
      background: rgba(16, 185, 129, 0.1);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 8px;

    svg {
      width: 40px;
      height: 40px;
    }

    &--energetic,
    &--motivated,
    &--calm {
      background: rgba(45, 179, 94, 0.1);
    }

    &--normal,
    &--hungry,
    &--tired {
      background: $color-light-blue;
    }

    &--swollen,
    &--anxious,
    &--dizzy {
      background: $color-ultra-light-purple;
    }

    &--weak,
    &--suffering,
    &--irritable {
      background: $color-orange-light;
    }
  }

  &__label {
    font-size: 12px;
    color: $color-primary-button-text;
  }

  &__actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
