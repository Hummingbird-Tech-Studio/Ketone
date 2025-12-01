<template>
  <div class="personal-info-form">
    <h2 class="personal-info-form__title">Personal Information</h2>

    <div class="personal-info-form__fields">
      <template v-if="loading">
        <Skeleton height="38px" border-radius="6px" />
        <Skeleton height="38px" border-radius="6px" />
      </template>

      <template v-else>
        <InputText v-model="name" placeholder="Name" />
        <DatePicker
          v-model="dateOfBirth"
          placeholder="Date of birth"
          dateFormat="yy-mm-dd"
          showIcon
          iconDisplay="input"
          fluid
        />
      </template>
    </div>

    <Skeleton v-if="loading" class="personal-info-form__actions" width="130px" height="38px" border-radius="20px" />
    <Button
      v-else
      class="personal-info-form__actions"
      label="Save changes"
      :loading="saving"
      outlined
      rounded
      :disabled="saving"
      @click="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { format, parse } from 'date-fns';
import { ref, watch } from 'vue';

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

const name = ref('');
const dateOfBirth = ref<Date>();

function parseDateString(dateString: string): Date {
  return parse(dateString, 'yyyy-MM-dd', new Date());
}

watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      name.value = newProfile.name || '';
      dateOfBirth.value = newProfile.dateOfBirth ? parseDateString(newProfile.dateOfBirth) : undefined;
    }
  },
  { immediate: true },
);

function formatDateToString(date: Date | undefined): string | null {
  if (!date) return null;
  return format(date, 'yyyy-MM-dd');
}

function handleSave() {
  emit('save', {
    name: name.value || null,
    dateOfBirth: formatDateToString(dateOfBirth.value),
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
