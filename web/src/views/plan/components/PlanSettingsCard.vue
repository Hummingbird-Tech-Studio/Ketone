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
      <div class="plan-settings-card__char-count">{{ editedName.length }}/{{ NAME_MAX_LENGTH }}</div>
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
      />
      <div class="plan-settings-card__char-count">{{ editedDescription.length }}/{{ DESCRIPTION_MAX_LENGTH }}</div>
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

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

const PlanNameSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => 'Name is required' }),
  Schema.maxLength(NAME_MAX_LENGTH, {
    message: () => `Name must be at most ${NAME_MAX_LENGTH} characters`,
  }),
);

const PlanDescriptionSchema = Schema.String.pipe(
  Schema.maxLength(DESCRIPTION_MAX_LENGTH, {
    message: () => `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
  }),
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
  const result = Schema.decodeUnknownEither(PlanNameSchema)(editedName.value);
  if (Either.isLeft(result)) {
    // Extract the first error message from the schema validation
    const issue = result.left.issue;
    if ('message' in issue && typeof issue.message === 'string') {
      return issue.message;
    }

    return 'Invalid name';
  }
  return null;
});

const descriptionError = computed(() => {
  if (!editedDescription.value) return null;
  const result = Schema.decodeUnknownEither(PlanDescriptionSchema)(editedDescription.value);
  if (Either.isLeft(result)) {
    const issue = result.left.issue;
    if ('message' in issue && typeof issue.message === 'string') {
      return issue.message;
    }
    return 'Invalid description';
  }
  return null;
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
