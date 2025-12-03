<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '350px' }"
    :draggable="false"
    :closable="!updatingEmail"
    @update:visible="handleVisibleChange"
  >
    <template #header>
      <span class="confirm-password-modal__header">Confirm Password</span>
    </template>

    <div class="confirm-password-modal__content">
      <Message v-if="isBlocked" severity="warn" class="confirm-password-modal__rate-limit">
        Too many failed attempts. Please try again in {{ countdownText }}.
      </Message>

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
              :disabled="updatingEmail || isBlocked"
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
          <Button
            type="submit"
            label="Continue"
            variant="outlined"
            rounded
            :loading="updatingEmail"
            :disabled="updatingEmail || isBlocked"
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
  newEmail: string;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'success'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Note: useAccountNotifications is called in EmailView.vue to persist subscriptions
const { updateEmail, updatingEmail, blockedUntil, isBlocked } = useAccount();

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
    const remaining = Math.max(0, Math.ceil((blockedUntil.value - Date.now()) / 1000));
    countdownSeconds.value = remaining;
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

onScopeDispose(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});

// Subscribe to actor's success event - only close modal on actual success
const subscription = accountActor.on(Emit.EMAIL_UPDATED, () => {
  resetForm();
  emit('success');
});

onScopeDispose(() => subscription.unsubscribe());

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
  updateEmail(props.newEmail, values.password);
});

function handleVisibleChange(value: boolean) {
  if (!updatingEmail.value) {
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

  &__rate-limit {
    margin-top: 1px;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
