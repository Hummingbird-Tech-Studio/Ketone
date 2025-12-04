<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '350px' }"
    :draggable="false"
    :closable="!deletingAccount"
    @update:visible="handleVisibleChange"
  >
    <template #header>
      <span class="delete-account-modal__header">Delete Account</span>
    </template>

    <div class="delete-account-modal__content">
      <Message v-if="isBlocked" severity="warn" class="delete-account-modal__rate-limit">
        Too many failed attempts. Please try again in {{ countdownText }}.
      </Message>

      <Message severity="error" icon="pi pi-exclamation-triangle" class="delete-account-modal__warning">
        This action cannot be undone. All your data will be permanently deleted.
      </Message>

      <p class="delete-account-modal__description">
        To delete your account, please enter your password to verify your identity.
      </p>

      <form class="delete-account-modal__form" @submit.prevent="onSubmit">
        <Field name="password" v-slot="{ field, errorMessage }">
          <div class="delete-account-modal__field">
            <Password
              v-bind="field"
              :class="['delete-account-modal__input', { 'delete-account-modal__input--error': errorMessage }]"
              placeholder="Password"
              :feedback="false"
              toggle-mask
              :disabled="deletingAccount || isBlocked"
              fluid
            />
            <Message
              v-if="errorMessage"
              class="delete-account-modal__error"
              severity="error"
              variant="simple"
              size="small"
            >
              {{ errorMessage }}
            </Message>
          </div>
        </Field>

        <div class="delete-account-modal__footer">
          <Button
            type="button"
            label="Cancel"
            variant="text"
            severity="secondary"
            rounded
            :disabled="deletingAccount"
            @click="handleVisibleChange(false)"
          />
          <Button
            type="submit"
            label="Delete Account"
            severity="danger"
            rounded
            :loading="deletingAccount"
            :disabled="deletingAccount || isBlocked"
          />
        </div>
      </form>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { Schema } from 'effect';
import { Field, useForm } from 'vee-validate';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { accountActor, Emit } from '../actors/account.actor';
import { useAccount } from '../composables/useAccount';

interface Props {
  visible: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Note: useAccountNotifications is called in DeleteAccountView.vue to persist subscriptions
const { deleteAccount, deletingAccount, blockedUntil, isBlocked } = useAccount();

// Countdown logic
const countdownSeconds = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

const countdownText = computed(() => {
  const minutes = Math.floor(countdownSeconds.value / 60);
  const seconds = countdownSeconds.value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

function updateCountdown() {
  if (blockedUntil.value) {
    countdownSeconds.value = Math.max(0, Math.ceil((blockedUntil.value - Date.now()) / 1000));
  }
}

watch(
  blockedUntil,
  (newValue) => {
    // Clear any existing interval first to prevent leaks
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (newValue) {
      updateCountdown();
      countdownInterval = setInterval(updateCountdown, 1000);
    } else {
      countdownSeconds.value = 0;
    }
  },
  { immediate: true },
);

// Subscribe to actor's success event - close modal on success
const subscription = accountActor.on(Emit.ACCOUNT_DELETED, () => {
  resetForm();
  emit('update:visible', false);
});

onScopeDispose(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  subscription.unsubscribe();
});

const passwordSchema = Schema.Struct({
  password: Schema.Union(Schema.String, Schema.Undefined).pipe(
    Schema.filter((value): value is string => typeof value === 'string' && value.length > 0, {
      message: () => 'Password is required.',
    }),
  ),
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
  deleteAccount(values.password);
});

function handleVisibleChange(value: boolean) {
  if (!deletingAccount.value) {
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

.delete-account-modal {
  &__header {
    font-size: 18px;
    font-weight: 700;
    color: $color-error;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__warning {
    margin-top: 1px;
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

  &__rate-limit {
    margin-top: 1px;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
