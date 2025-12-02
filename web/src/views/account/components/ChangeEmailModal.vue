<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="$emit('update:visible', $event)"
  >
    <template #header>
      <span class="change-email-modal__header">Change Email</span>
    </template>

    <form class="change-email-modal__form" @submit.prevent="onSubmit">
      <Field name="currentEmail" v-slot="{ field, errorMessage }">
        <div class="change-email-modal__field">
          <InputText
            v-bind="field"
            :class="['change-email-modal__input', { 'change-email-modal__input--error': errorMessage }]"
            placeholder="Current Email"
            type="email"
          />
          <Message
            v-if="errorMessage"
            class="change-email-modal__error"
            severity="error"
            variant="simple"
            size="small"
          >
            {{ errorMessage }}
          </Message>
        </div>
      </Field>

      <Field name="newEmail" v-slot="{ field, errorMessage }">
        <div class="change-email-modal__field">
          <InputText
            v-bind="field"
            :class="['change-email-modal__input', { 'change-email-modal__input--error': errorMessage }]"
            placeholder="New Email"
            type="email"
          />
          <Message
            v-if="errorMessage"
            class="change-email-modal__error"
            severity="error"
            variant="simple"
            size="small"
          >
            {{ errorMessage }}
          </Message>
        </div>
      </Field>

      <Field name="confirmEmail" v-slot="{ field, errorMessage }">
        <div class="change-email-modal__field">
          <InputText
            v-bind="field"
            :class="['change-email-modal__input', { 'change-email-modal__input--error': errorMessage || !emailsMatch }]"
            placeholder="Confirm Email"
            type="email"
          />
          <Message
            v-if="errorMessage || !emailsMatch"
            class="change-email-modal__error"
            severity="error"
            variant="simple"
            size="small"
          >
            {{ errorMessage || 'Emails do not match' }}
          </Message>
        </div>
      </Field>

      <div class="change-email-modal__footer">
        <Button type="submit" label="Change Email" variant="outlined" rounded />
      </div>
    </form>

    <ConfirmPasswordModal
      :visible="confirmPasswordVisible"
      :new-email="newEmailValue"
      @update:visible="confirmPasswordVisible = $event"
      @success="handleSuccess"
    />
  </Dialog>
</template>

<script setup lang="ts">
import { EmailSchema } from '@ketone/shared';
import { Schema } from 'effect';
import { Field, useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import ConfirmPasswordModal from './ConfirmPasswordModal.vue';

interface Props {
  visible: boolean;
  currentEmail: string;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const confirmPasswordVisible = ref(false);
const newEmailValue = ref('');

// Create schema dynamically based on current email
const createChangeEmailSchema = (actualEmail: string) => {
  return Schema.Struct({
    currentEmail: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Current email is required' }),
      Schema.filter((email) => email.toLowerCase() === actualEmail.toLowerCase(), {
        message: () => 'Current email does not match your account email',
      }),
    ),
    newEmail: EmailSchema.pipe(
      Schema.filter((email) => email.toLowerCase() !== actualEmail.toLowerCase(), {
        message: () => 'New email must be different from your current email',
      }),
    ),
    confirmEmail: Schema.String.pipe(Schema.minLength(1, { message: () => 'Please confirm your new email' })),
  });
};

type FormValues = {
  currentEmail: string;
  newEmail: string;
  confirmEmail: string;
};

const validationSchema = computed(() => {
  const schemaStruct = createChangeEmailSchema(props.currentEmail);
  const StandardSchemaClass = Schema.standardSchemaV1(schemaStruct);
  return {
    ...StandardSchemaClass,
    '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
  };
});

const { handleSubmit, resetForm, values } = useForm<FormValues>({
  validationSchema,
  initialValues: {
    currentEmail: '',
    newEmail: '',
    confirmEmail: '',
  },
});

const onSubmit = handleSubmit((formValues) => {
  // Validate that emails match (not covered by Effect Schema since it's cross-field)
  if (formValues.newEmail !== formValues.confirmEmail) {
    return;
  }

  newEmailValue.value = formValues.newEmail;
  confirmPasswordVisible.value = true;
});

// Watch for email match validation (cross-field, shown in confirmEmail)
const emailsMatch = computed(() => !values.confirmEmail || values.newEmail === values.confirmEmail);

function handleSuccess() {
  confirmPasswordVisible.value = false;
  resetForm();
  emit('update:visible', false);
}

// Reset form when modal closes
watch(
  () => props.visible,
  (isVisible) => {
    if (!isVisible) {
      resetForm();
    }
  },
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.change-email-modal {
  &__header {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__input {
    width: 100%;

    &--error {
      border-color: $color-error;
    }
  }

  &__error {
    font-size: 12px;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
}
</style>
