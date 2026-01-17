<template>
  <div class="plan-settings-card">
    <div class="plan-settings-card__field">
      <span class="plan-settings-card__label">Name:</span>
      <span class="plan-settings-card__value">{{ name }}</span>
      <button class="plan-settings-card__edit" @click="editName">
        <i class="pi pi-pencil"></i>
      </button>
    </div>
    <div class="plan-settings-card__field">
      <span class="plan-settings-card__label">Description:</span>
      <span class="plan-settings-card__value plan-settings-card__value--placeholder">
        {{ description || 'Add a description...' }}
      </span>
      <button class="plan-settings-card__edit" @click="editDescription">
        <i class="pi pi-pencil"></i>
      </button>
    </div>

    <Dialog v-model:visible="showNameDialog" header="Edit Name" modal :style="{ width: '300px' }">
      <InputText v-model="editedName" class="plan-settings-card__input" placeholder="Plan name" />
      <template #footer>
        <Button label="Cancel" severity="secondary" variant="text" @click="showNameDialog = false" />
        <Button label="Save" @click="saveName" />
      </template>
    </Dialog>

    <Dialog v-model:visible="showDescriptionDialog" header="Edit Description" modal :style="{ width: '300px' }">
      <Textarea
        v-model="editedDescription"
        class="plan-settings-card__input"
        placeholder="Add a description..."
        rows="3"
      />
      <template #footer>
        <Button label="Cancel" severity="secondary" variant="text" @click="showDescriptionDialog = false" />
        <Button label="Save" @click="saveDescription" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { ref } from 'vue';

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

    &--placeholder {
      color: $color-primary-light-text;
      font-style: italic;
    }
  }

  &__edit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid $color-primary-button-outline;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    i {
      font-size: 14px;
      color: $color-primary-light-text;
    }

    &:hover {
      border-color: $color-primary-light-text;

      i {
        color: $color-primary-button-text;
      }
    }
  }

  &__input {
    width: 100%;
  }
}
</style>
