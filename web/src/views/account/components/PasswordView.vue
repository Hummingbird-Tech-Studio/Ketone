<template>
  <div class="password-view">
    <div class="password-view__card">
      <h2 class="password-view__title">Change Password</h2>
      <Message severity="info" icon="pi pi-info-circle" class="password-view__info">
        Changing your password will sign you out from all devices.
      </Message>
      <Message v-if="isBlocked" severity="warn" class="password-view__rate-limit">
        Too many failed attempts. Please try again in {{ countdownText }}.
      </Message>

      <form class="password-view__form" @submit.prevent="onSubmit">
        <Field name="currentPassword" v-slot="{ field, errorMessage }">
          <div class="password-view__field">
            <Password
              v-bind="field"
              :class="['password-view__input', { 'password-view__input--error': errorMessage }]"
              placeholder="Current Password"
              :feedback="false"
              toggle-mask
              :disabled="updatingPassword || isBlocked"
              fluid
            />
            <Message v-if="errorMessage" class="password-view__error" severity="error" variant="simple" size="small">
              {{ errorMessage }}
            </Message>
          </div>
        </Field>

        <Field name="newPassword" v-slot="{ field, errorMessage }">
          <div class="password-view__field">
            <Password
              v-bind="field"
              :class="['password-view__input', { 'password-view__input--error': errorMessage }]"
              placeholder="Enter New Password"
              :feedback="false"
              toggle-mask
              :disabled="updatingPassword || isBlocked"
              fluid
            />
            <Message v-if="errorMessage" class="password-view__error" severity="error" variant="simple" size="small">
              {{ errorMessage }}
            </Message>
          </div>
        </Field>

        <Field name="confirmPassword" v-slot="{ field, errorMessage }">
          <div class="password-view__field">
            <Password
              v-bind="field"
              :class="['password-view__input', { 'password-view__input--error': errorMessage || !passwordsMatch }]"
              placeholder="Confirm New Password"
              :feedback="false"
              toggle-mask
              :disabled="updatingPassword || isBlocked"
              fluid
            />
            <Message
              v-if="errorMessage || !passwordsMatch"
              class="password-view__error"
              severity="error"
              variant="simple"
              size="small"
            >
              {{ errorMessage || 'Passwords do not match' }}
            </Message>
          </div>
        </Field>

        <div class="password-view__footer">
          <Button
            type="submit"
            label="Change Password"
            variant="outlined"
            rounded
            :loading="updatingPassword"
            :disabled="updatingPassword || isBlocked"
          />
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '@/composables/useAuth';
import { PasswordSchema } from '@ketone/shared';
import { Schema } from 'effect';
import { Field, useForm } from 'vee-validate';
import { computed, onUnmounted, ref, watch } from 'vue';
import { accountActor, Emit } from '../actors/account.actor';
import { useAccount } from '../composables/useAccount';
import { useAccountNotifications } from '../composables/useAccountNotifications';

const { logout } = useAuth();

const { updatePassword, updatingPassword, blockedUntil, isBlocked, actorRef } = useAccount();

useAccountNotifications(actorRef);

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

// Form validation schema - uses PasswordSchema from shared for newPassword validation
const passwordFormSchema = Schema.Struct({
  currentPassword: Schema.Union(Schema.String, Schema.Undefined).pipe(
    Schema.filter((value): value is string => typeof value === 'string' && value.length > 0, {
      message: () => 'Current password is required.',
    }),
  ),
  newPassword: PasswordSchema,
  confirmPassword: Schema.Union(Schema.String, Schema.Undefined).pipe(
    Schema.filter((value): value is string => typeof value === 'string' && value.length > 0, {
      message: () => 'Please confirm your new password.',
    }),
  ),
});

type FormValues = Schema.Schema.Type<typeof passwordFormSchema>;

const StandardSchemaClass = Schema.standardSchemaV1(passwordFormSchema);
const validationSchema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit, values } = useForm<FormValues>({
  validationSchema,
  initialValues: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  },
});

const passwordsMatch = computed(() => {
  return !values.confirmPassword || values.newPassword === values.confirmPassword;
});

const onSubmit = handleSubmit((formValues) => {
  if (formValues.newPassword !== formValues.confirmPassword) {
    return;
  }
  updatePassword(formValues.currentPassword, formValues.newPassword);
});

const subscription = accountActor.on(Emit.PASSWORD_UPDATED, () => {
  logout();
});

onUnmounted(() => {
  subscription.unsubscribe();
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.password-view {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    padding: 20px;
  }

  &__rate-limit {
    margin-bottom: 8px;
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
    justify-content: center;
    margin-top: 8px;
  }
}
</style>
