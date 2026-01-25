<template>
  <div class="plan-settings-card">
    <div class="plan-settings-card__field">
      <span class="plan-settings-card__label">Name:</span>
      <span class="plan-settings-card__value">{{ name }}</span>
      <Button
        type="button"
        icon="pi pi-pencil"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Edit Name"
        @click="editName"
      />
    </div>
    <div class="plan-settings-card__field">
      <span class="plan-settings-card__label">Description:</span>
      <span
        class="plan-settings-card__value"
        :class="description ? 'plan-settings-card__value--description' : 'plan-settings-card__value--placeholder'"
      >
        {{ description || 'Add a description...' }}
      </span>
      <Button
        type="button"
        icon="pi pi-pencil"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Edit Description"
        @click="editDescription"
      />
    </div>

    <Dialog v-model:visible="showNameDialog" header="Edit Name" modal :draggable="false" :style="{ width: '300px' }">
      <InputText
        v-model="editedName"
        class="plan-settings-card__input"
        :class="{ 'p-invalid': nameError }"
        placeholder="Plan name"
      />
      <div class="plan-settings-card__char-count">{{ editedName.length }}/100</div>
      <Message v-if="nameError" severity="error" variant="simple" size="small">
        {{ nameError }}
      </Message>
      <template #footer>
        <Button label="Cancel" severity="secondary" variant="text" @click="showNameDialog = false" />
        <Button label="Save" :disabled="!canSaveName" @click="saveName" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showDescriptionDialog"
      header="Edit Description"
      modal
      :draggable="false"
      :style="{ width: '350px' }"
    >
      <Textarea
        v-model="editedDescription"
        class="plan-settings-card__input"
        :class="{ 'p-invalid': descriptionError }"
        placeholder="Add a description..."
        rows="5"
      />
      <div class="plan-settings-card__char-count">{{ editedDescription.length }}/500</div>
      <Message v-if="descriptionError" severity="error" variant="simple" size="small">
        {{ descriptionError }}
      </Message>
      <template #footer>
        <Button label="Cancel" severity="secondary" variant="text" @click="showDescriptionDialog = false" />
        <Button label="Save" :disabled="!canSaveDescription" @click="saveDescription" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { Either, Schema } from 'effect';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, ref } from 'vue';

const PlanDescriptionSchema = Schema.String.pipe(
  Schema.maxLength(500, { message: () => 'Description must be at most 500 characters' }),
);

const props = defineProps<{
  name: string;
  description: string;
}>();

const emit = defineEmits<{
  'update:name': [value: string];
  'update:description': [value: string];
}>();

const showNameDialog = ref(false);
const showDescriptionDialog = ref(false);
const editedName = ref('');
const editedDescription = ref('');

const nameError = computed(() => {
  if (!editedName.value || editedName.value.length === 0) {
    return 'Name is required';
  }

  if (editedName.value.length > 100) {
    return 'Name must be at most 100 characters';
  }
  return null;
});

const descriptionError = computed(() => {
  if (!editedDescription.value) return null;
  const result = Schema.decodeUnknownEither(PlanDescriptionSchema)(editedDescription.value);
  return Either.isLeft(result) ? 'Description must be at most 500 characters' : null;
});

const canSaveName = computed(() => !nameError.value);
const canSaveDescription = computed(() => !descriptionError.value);

const editName = () => {
  editedName.value = props.name;
  showNameDialog.value = true;
};

const saveName = () => {
  emit('update:name', editedName.value);
  showNameDialog.value = false;
};

const editDescription = () => {
  editedDescription.value = props.description;
  showDescriptionDialog.value = true;
};

const saveDescription = () => {
  emit('update:description', editedDescription.value);
  showDescriptionDialog.value = false;
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-settings-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: $color-white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;

  &__field {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  &__label {
    font-size: 14px;
    font-weight: 600;
    color: $color-primary-button-text;
    min-width: 90px;
  }

  &__value {
    flex: 1;
    font-size: 14px;
    color: $color-primary-button-text;
    word-break: break-word;

    &--placeholder {
      color: $color-primary-light-text;
      font-style: italic;
    }

    &--description {
      display: -webkit-box;
      line-clamp: 5;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }

  &__input {
    width: 100%;
  }

  &__char-count {
    font-size: 12px;
    color: $color-primary-light-text;
    text-align: right;
    margin-top: 4px;
  }
}
</style>
