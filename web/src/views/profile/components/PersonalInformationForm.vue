<template>
  <div class="personal-info-form">
    <h2 class="personal-info-form__title">Personal Information</h2>

    <div class="personal-info-form__fields">
      <div class="personal-info-form__field">
        <input
          v-model="formData.name"
          type="text"
          placeholder="Name"
          class="personal-info-form__input"
          :disabled="loading"
        />
      </div>

      <div class="personal-info-form__field">
        <DatePicker
          v-model="dateOfBirthValue"
          placeholder="Date of birth"
          dateFormat="yy-mm-dd"
          showIcon
          iconDisplay="input"
          :disabled="loading"
          class="personal-info-form__datepicker"
        />
      </div>
    </div>

    <div class="personal-info-form__actions">
      <button
        class="personal-info-form__button"
        :disabled="saving || loading"
        @click="handleSave"
      >
        {{ saving ? 'Saving...' : 'Save changes' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';

interface Profile {
  name: string | null;
  dateOfBirth: string | null;
}

const props = defineProps<{
  profile: Profile | null;
  loading: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [data: { name: string | null; dateOfBirth: string | null }];
}>();

const formData = reactive({
  name: '',
  dateOfBirth: null as Date | null,
});

const dateOfBirthValue = computed({
  get: () => formData.dateOfBirth,
  set: (value: Date | null) => {
    formData.dateOfBirth = value;
  },
});

watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      formData.name = newProfile.name || '';
      formData.dateOfBirth = newProfile.dateOfBirth ? new Date(newProfile.dateOfBirth) : null;
    }
  },
  { immediate: true }
);

function formatDateToString(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function handleSave() {
  emit('save', {
    name: formData.name || null,
    dateOfBirth: formatDateToString(formData.dateOfBirth),
  });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.personal-info-form {
  width: 100%;
  max-width: 360px;

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    margin: 0 0 24px 0;
  }

  &__fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  &__field {
    width: 100%;
  }

  &__input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #e9e9e9;
    border-radius: 8px;
    font-size: 14px;
    color: #333;
    background: $color-light-grey;
    box-sizing: border-box;

    &::placeholder {
      color: #999;
    }

    &:focus {
      outline: none;
      border-color: $color-success;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &__datepicker {
    width: 100%;

    :deep(.p-datepicker-input) {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #e9e9e9;
      border-radius: 8px;
      font-size: 14px;
      color: #333;
      background: $color-light-grey;

      &::placeholder {
        color: #999;
      }

      &:focus {
        outline: none;
        border-color: $color-success;
        box-shadow: none;
      }
    }

    :deep(.p-datepicker-input-icon-container) {
      right: 12px;
    }

    :deep(.p-datepicker-input-icon) {
      color: #999;
    }
  }

  &__actions {
    display: flex;
    justify-content: center;
  }

  &__button {
    padding: 10px 24px;
    border: 1px solid $color-success;
    border-radius: 20px;
    background: transparent;
    color: $color-success;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: $color-success;
      color: $color-white;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}
</style>
