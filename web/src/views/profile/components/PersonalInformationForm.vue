<template>
  <form class="personal-info-form" @submit.prevent="onSubmit">
    <h2 class="personal-info-form__title">Personal Information</h2>

    <div class="personal-info-form__fields">
      <template v-if="loading">
        <Skeleton height="38px" border-radius="6px" />
        <Skeleton height="38px" border-radius="6px" />
      </template>

      <template v-else>
        <Field name="name" v-slot="{ field, errorMessage }">
          <div class="personal-info-form__field">
            <InputText
              v-bind="field"
              :class="{ 'personal-info-form__input--error': errorMessage }"
              placeholder="Name"
            />
            <Message
              v-if="errorMessage"
              class="personal-info-form__error-message"
              severity="error"
              variant="simple"
              size="small"
            >
              {{ errorMessage }}
            </Message>
          </div>
        </Field>
        <DatePicker
          v-model="dateOfBirth"
          placeholder="Date of birth"
          dateFormat="dd-mm-yy"
          showIcon
          iconDisplay="input"
          fluid
        />
      </template>
    </div>

    <Skeleton v-if="loading" class="personal-info-form__actions" width="130px" height="38px" border-radius="20px" />
    <Button
      v-else
      type="submit"
      class="personal-info-form__actions"
      label="Save changes"
      :loading="saving"
      outlined
      rounded
      :disabled="saving"
    />
  </form>
</template>

<script setup lang="ts">
import { format, parse } from 'date-fns';
import { Schema } from 'effect';
import { configure, Field, useForm } from 'vee-validate';
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

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const NameSchema = Schema.String.pipe(
  Schema.filter((name) => name === '' || name.length <= 255, { message: () => 'Name must be at most 255 characters' }),
);

const schemaStruct = Schema.Struct({
  name: NameSchema,
});

type FormValues = Schema.Schema.Type<typeof schemaStruct>;

const StandardSchemaClass = Schema.standardSchemaV1(schemaStruct);
const validationSchema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit, setFieldValue } = useForm<FormValues>({
  validationSchema,
  initialValues: {
    name: '',
  },
});

const dateOfBirth = ref<Date>();

function parseDateString(dateString: string): Date {
  return parse(dateString, 'yyyy-MM-dd', new Date());
}

watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      setFieldValue('name', newProfile.name || '');
      dateOfBirth.value = newProfile.dateOfBirth ? parseDateString(newProfile.dateOfBirth) : undefined;
    }
  },
  { immediate: true },
);

function formatDateToString(date: Date | undefined): string | null {
  if (!date) return null;
  return format(date, 'yyyy-MM-dd');
}

const onSubmit = handleSubmit((values) => {
  emit('save', {
    name: values.name || null,
    dateOfBirth: formatDateToString(dateOfBirth.value),
  });
});
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

  &__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__input--error {
    border-color: $color-error;
  }

  &__error-message {
    font-size: 12px;
  }

  &__actions {
    align-self: center;
  }
}
</style>
