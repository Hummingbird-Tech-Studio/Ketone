<template>
  <div class="personal-info-form">
    <h2 class="personal-info-form__title">Personal Information</h2>

    <div class="personal-info-form__fields">
      <InputText v-model="formData.name" placeholder="Name" :disabled="loading" />

      <DatePicker
        v-model="formData.dateOfBirth"
        placeholder="Date of birth"
        dateFormat="yy-mm-dd"
        showIcon
        iconDisplay="input"
        fluid
        :disabled="loading"
      />
    </div>

    <Button
      class="personal-info-form__actions"
      label="Save changes"
      :loading="saving"
      outlined
      rounded
      :disabled="saving || loading"
      @click="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { format, parse } from 'date-fns';
import { reactive, watch } from 'vue';

interface Profile {
  name: string | null;
  dateOfBirth: string | null;
}

interface Props {
  profile: Profile | null;
  loading: boolean;
  saving: boolean;
}

interface Emits {
  (e: 'save', data: { name: string | null; dateOfBirth: string | null }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const formData = reactive({
  name: '',
  dateOfBirth: null as Date | null,
});

function parseDateString(dateString: string): Date {
  return parse(dateString, 'yyyy-MM-dd', new Date());
}

watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      formData.name = newProfile.name || '';
      formData.dateOfBirth = newProfile.dateOfBirth ? parseDateString(newProfile.dateOfBirth) : null;
    }
  },
  { immediate: true },
);

function formatDateToString(date: Date | null): string | null {
  if (!date) return null;
  return format(date, 'yyyy-MM-dd');
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
  display: flex;
  flex-direction: column;
  width: 312px;
  padding: 22px;
  border: 1px solid #e9e9e9;
  border-radius: 16px;

  &__title {
    color: $color-primary-button-text;
    font-weight: 700;
    font-size: 18px;
    margin-bottom: 22px;
  }

  &__fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 22px;
  }

  &__actions {
    align-self: center;
  }
}
</style>
