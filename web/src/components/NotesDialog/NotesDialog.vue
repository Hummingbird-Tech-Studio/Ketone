<template>
  <Dialog
    :visible="visible"
    modal
    header="Notes"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleDialogVisibilityChange"
  >
    <div class="notes-dialog">
      <Textarea
        v-model="localNotes"
        placeholder="Add a note about this fast"
        rows="4"
        :class="['notes-dialog__textarea', { 'notes-dialog__textarea--error': notesError }]"
        :maxlength="NOTES_MAX_LENGTH"
      />
      <div class="notes-dialog__footer">
        <span class="notes-dialog__counter">{{ localNotes.length }}/{{ NOTES_MAX_LENGTH }}</span>
      </div>
      <Message v-if="notesError" severity="error" variant="simple" size="small">
        {{ notesError }}
      </Message>
    </div>

    <template #footer>
      <div class="notes-dialog__actions">
        <Button label="Cancel" severity="secondary" outlined @click="handleCancel" />
        <Button label="Save Notes" :loading="loading" :disabled="!canSave" @click="handleSave" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { NOTES_MAX_LENGTH, NotesSchema } from '@ketone/shared';
import { Schema } from 'effect';
import { computed, ref, watch } from 'vue';

interface Props {
  visible: boolean;
  notes: string | null;
  loading?: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'save', notes: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localNotes = ref(props.notes ?? '');
const notesError = ref<string | null>(null);

// Sync local notes when prop changes (e.g., after successful save)
watch(
  () => props.notes,
  (newVal) => {
    localNotes.value = newVal ?? '';
    validateNotes(localNotes.value);
  },
);

// Reset local state when dialog opens
watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      localNotes.value = props.notes ?? '';
      notesError.value = null;
    }
  },
);

// Validate on input change
watch(localNotes, (newVal) => {
  validateNotes(newVal);
});

function validateNotes(value: string): boolean {
  const result = Schema.decodeUnknownEither(NotesSchema)(value);
  if (result._tag === 'Left') {
    notesError.value = `Notes must be at most ${NOTES_MAX_LENGTH} characters`;
    return false;
  }
  notesError.value = null;
  return true;
}

const hasNotesChanged = computed(() => {
  return localNotes.value !== (props.notes ?? '');
});

const canSave = computed(() => {
  return hasNotesChanged.value && notesError.value === null;
});

function handleDialogVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleCancel() {
  emit('update:visible', false);
}

function handleSave() {
  if (validateNotes(localNotes.value)) {
    emit('save', localNotes.value);
  }
}
</script>

<style scoped lang="scss">
.notes-dialog {
  &__textarea {
    width: 100%;
    resize: none;

    &--error {
      border-color: var(--p-red-500);
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  &__counter {
    font-size: 12px;
    color: var(--p-text-muted-color);
  }

  &__actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
