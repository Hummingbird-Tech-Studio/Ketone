<template>
  <div class="physical-info-form">
    <h2 class="physical-info-form__title">Physical Information</h2>

    <div class="physical-info-form__fields">
      <template v-if="loading">
        <Skeleton height="38px" border-radius="6px" />
        <Skeleton height="38px" border-radius="6px" />
      </template>

      <template v-else>
        <InputText v-model="height" placeholder="Height (cm)" />
        <InputText v-model="weight" placeholder="Weight (kg)" />
      </template>
    </div>

    <Skeleton v-if="loading" class="physical-info-form__actions" width="130px" height="38px" border-radius="20px" />
    <Button
      v-else
      class="physical-info-form__actions"
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

const height = ref('');
const weight = ref('');

watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      // TODO: Load physical info when API supports it
    }
  },
  { immediate: true },
);

function handleSave() {
  // TODO: Implement save when API supports physical info
  emit('save', {
    name: null,
    dateOfBirth: null,
  });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.physical-info-form {
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
