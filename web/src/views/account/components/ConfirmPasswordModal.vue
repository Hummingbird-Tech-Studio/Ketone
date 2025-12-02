<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '350px' }"
    :draggable="false"
    :closable="!updating"
    @update:visible="handleVisibleChange"
  >
    <template #header>
      <span class="confirm-password-modal__header">Confirm Password</span>
    </template>

    <div class="confirm-password-modal__content">
      <p class="confirm-password-modal__description">
        To change your email address, please enter your password to verify your identity.
      </p>

      <form class="confirm-password-modal__form" @submit.prevent="onSubmit">
        <Field name="password" v-slot="{ field, errorMessage }">
          <div class="confirm-password-modal__field">
            <Password
              v-bind="field"
              :class="['confirm-password-modal__input', { 'confirm-password-modal__input--error': errorMessage }]"
              placeholder="Password"
              :feedback="false"
              toggle-mask
              :disabled="updating"
            />
            <Message
              v-if="errorMessage"
              class="confirm-password-modal__error"
              severity="error"
              variant="simple"
              size="small"
            >
              {{ errorMessage }}
            </Message>
          </div>
        </Field>

        <div class="confirm-password-modal__footer">
          <Button type="submit" label="Continue" variant="outlined" rounded :loading="updating" :disabled="updating" />
        </div>
      </form>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { Schema } from 'effect';
import { Field, useForm } from 'vee-validate';
import { onScopeDispose, watch } from 'vue';
import { useAccount } from '../composables/useAccount';
import { accountActor, Emit } from '../actors/account.actor';

interface Props {
  visible: boolean;
  newEmail: string;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'success'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Note: useAccountNotifications is called in EmailView.vue to persist subscriptions
const { updateEmail, updating } = useAccount();

// Subscribe to actor's success event - only close modal on actual success
const subscription = accountActor.on(Emit.EMAIL_UPDATED, () => {
  resetForm();
  emit('success');
});

onScopeDispose(() => subscription.unsubscribe());

const passwordSchema = Schema.Struct({
  password: Schema.String.pipe(Schema.minLength(1, { message: () => 'Password is required.' })),
});

type FormValues = Schema.Schema.Type<typeof passwordSchema>;

const StandardSchemaClass = Schema.standardSchemaV1(passwordSchema);
const validationSchema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit, resetForm } = useForm<FormValues>({
  validationSchema,
  initialValues: {
    password: '',
  },
});

const onSubmit = handleSubmit((values) => {
  updateEmail(props.newEmail, values.password);
});


function handleVisibleChange(value: boolean) {
  if (!updating.value) {
    emit('update:visible', value);
  }
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

.confirm-password-modal {
  &__header {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__description {
    font-size: 14px;
    color: $color-primary-button-text;
    margin: 0;
    line-height: 1.5;
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
      :deep(input) {
        border-color: $color-error;
      }
    }
  }

  &__error {
    font-size: 12px;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
