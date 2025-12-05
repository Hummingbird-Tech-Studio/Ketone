<template>
  <div class="resetPassword">
    <!-- Success State -->
    <template v-if="passwordReset">
      <div class="resetPassword__title resetPassword__title--success">SUCCESS!</div>
      <div class="resetPassword__message">
        Your password has been updated. You can now sign in to your account.
      </div>
      <RouterLink class="resetPassword__loginButton" to="/sign-in">
        <Button label="Go to Login" severity="help" rounded outlined />
      </RouterLink>
    </template>

    <!-- Token Invalid State -->
    <template v-else-if="tokenInvalid">
      <div class="resetPassword__title">RESET PASSWORD</div>
      <div class="resetPassword__serviceError">Invalid or expired reset link. Please request a new one.</div>
      <RouterLink class="resetPassword__loginButton" to="/forgot-password">
        <Button label="Send Link" severity="help" rounded outlined />
      </RouterLink>
    </template>

    <!-- Reset Password Form -->
    <template v-else>
      <div class="resetPassword__title">RESET PASSWORD</div>

      <div v-if="serviceError" class="resetPassword__serviceError">{{ serviceError }}</div>

      <Field name="password" v-slot="{ field, value, errorMessage, errors }">
        <Password
          :class="['resetPassword__password', { 'resetPassword__password--error': errorMessage }]"
          v-bind="field"
          @keyup.enter="onSubmit"
          :feedback="false"
          inputId="password-input"
          placeholder="New Password"
          aria-label="password-input"
          :pt="{
            pcInputText: {
              root: {
                'aria-controls': null,
                'aria-expanded': null,
                'aria-haspopup': null,
              },
            },
          }"
          type="password"
          :aria-invalid="!!errorMessage"
          toggleMask
          variant="filled"
          fluid
        />

        <template v-if="errors.length > 0 && !requiredError(value)">
          <div class="resetPassword__passwordRequirements">Create a password that contains at least:</div>
          <ul class="resetPassword__passwordRequirements resetPassword__passwordRequirements__list">
            <li
              v-for="requirement in PASSWORD_RULES"
              :key="requirement.message"
              :class="[
                'resetPassword__passwordRequirements__item',
                {
                  'resetPassword__passwordRequirements__item--valid': validatePasswordRule(requirement, value),
                },
              ]"
            >
              <span class="resetPassword__passwordRequirements__icon">
                <i class="pi pi-check" style="font-size: 0.9rem" v-if="validatePasswordRule(requirement, value)"></i>
                <i class="pi pi-times" v-else></i>
              </span>
              <span>{{ requirement.message }}</span>
            </li>
          </ul>
        </template>
      </Field>

      <Field name="confirmPassword" v-slot="{ field, errorMessage }">
        <Password
          :class="['resetPassword__confirmPassword', { 'resetPassword__confirmPassword--error': errorMessage }]"
          v-bind="field"
          @keyup.enter="onSubmit"
          :feedback="false"
          inputId="confirm-password-input"
          placeholder="Confirm New Password"
          aria-label="confirm-password-input"
          :pt="{
            pcInputText: {
              root: {
                'aria-controls': null,
                'aria-expanded': null,
                'aria-haspopup': null,
              },
            },
          }"
          type="password"
          :aria-invalid="!!errorMessage"
          toggleMask
          variant="filled"
          fluid
        />
        <Message
          class="resetPassword__errorMessage"
          v-if="errorMessage"
          severity="error"
          variant="simple"
          size="small"
        >
          {{ errorMessage }}
        </Message>
      </Field>

      <div class="resetPassword__buttons">
        <Button
          label="Reset Password"
          :loading="submitting"
          severity="help"
          rounded
          @click="onSubmit"
          outlined
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Emit, type EmitType } from '@/views/passwordRecovery/actors/resetPassword.actor';
import { useResetPassword } from '@/views/passwordRecovery/composables/useResetPassword';
import { PasswordSchema } from '@ketone/shared';
import { Match, Schema } from 'effect';
import { configure, Field, useForm } from 'vee-validate';
import { onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

type PasswordRule = { type: 'min'; value: number; message: string } | { type: 'regex'; value: RegExp; message: string };

const PASSWORD_RULES: PasswordRule[] = [
  {
    type: 'min',
    value: 8,
    message: '8 characters',
  },
  {
    type: 'regex',
    value: /\d/,
    message: '1 number',
  },
  {
    type: 'regex',
    value: /[~`!@#$%^&*()--+={}[\]|\\:;"'<>,.?/_₹]/,
    message: '1 special character e.g. %, &, $, !, @',
  },
  {
    type: 'regex',
    value: /^\S.*\S$|^\S$/,
    message: 'No leading or trailing whitespace',
  },
];

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const route = useRoute();
const token = (route.query.token as string) || '';

const { submit, submitting, actorRef } = useResetPassword();
const serviceError = ref<string | null>(null);
const passwordReset = ref(false);
const tokenInvalid = ref(false);

const schemaStruct = Schema.Struct({
  password: PasswordSchema,
  confirmPassword: Schema.String.pipe(Schema.minLength(1, { message: () => 'Please confirm your password' })),
}).pipe(
  Schema.filter((data) => {
    if (data.password !== data.confirmPassword) {
      return {
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      };
    }
    return true;
  }),
);

type FormValues = Schema.Schema.Type<typeof schemaStruct>;

const StandardSchemaClass = Schema.standardSchemaV1(schemaStruct);
const schema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit } = useForm<FormValues>({
  validationSchema: schema,
  initialValues: {
    password: '',
    confirmPassword: '',
  },
});

function validatePasswordRule(rule: PasswordRule, password: string | undefined): boolean {
  if (!password) {
    return false;
  }

  switch (rule.type) {
    case 'min':
      return password.length >= rule.value;
    case 'regex':
      return rule.value.test(password);
    default:
      return false;
  }
}

function requiredError(value: string | undefined) {
  return !value || value.trim() === '';
}

const onSubmit = handleSubmit((formValues) => {
  submit(token, formValues.password);
});

function handleResetPasswordEmit(emitType: EmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: Emit.RESET_PASSWORD_SUCCESS }, () => {
      serviceError.value = null;
      passwordReset.value = true;
    }),
    Match.when({ type: Emit.RESET_PASSWORD_ERROR }, (emit) => {
      serviceError.value = emit.error;
    }),
    Match.when({ type: Emit.RESET_PASSWORD_TOKEN_INVALID }, () => {
      serviceError.value = null;
      tokenInvalid.value = true;
    }),
    Match.exhaustive,
  );
}

const resetPasswordSubscription = Object.values(Emit).map((emit) => actorRef.on(emit, handleResetPasswordEmit));

watch(submitting, (isSubmitting) => {
  if (isSubmitting) {
    serviceError.value = null;
  }
});

onUnmounted(() => {
  resetPasswordSubscription.forEach((sub) => sub.unsubscribe());
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.resetPassword {
  display: flex;
  flex-direction: column;
  margin: auto;
  width: 317px;
  min-height: 280px;
  padding: 22px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 16px;

  &__title {
    font-style: normal;
    font-weight: 700;
    font-size: 18px;
    color: $color-primary-button-text;
    margin-bottom: 16px;

    &--success {
      color: $color-dark-purple;
    }
  }

  &__message {
    font-size: 14px;
    color: $color-primary-button-text;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  &__password {
    margin-bottom: 8px;

    &--error {
      margin-bottom: 4px;
    }
  }

  &__confirmPassword {
    margin-bottom: 16px;

    &--error {
      margin-bottom: 4px;
    }
  }

  &__errorMessage {
    font-size: 12px;
    margin-bottom: 12px;
  }

  &__serviceError {
    border: 1px solid $color-error;
    border-radius: 4px;
    padding: 8px;
    font-size: 12px;
    color: $color-error;
    margin-bottom: 16px;
  }

  &__passwordRequirements {
    margin-top: 4px;
    font-size: 12px;
    color: $color-primary-button-text;
    font-weight: 500;

    &__list {
      list-style-type: none;
      padding-left: 0;
      margin-bottom: 16px;
    }

    &__item {
      display: flex;
      margin-bottom: 2px;
      color: $color-error;

      &--valid {
        color: $color-success;
      }
    }

    &__icon {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 24px;
    }
  }

  &__buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: auto;
  }

  &__loginButton {
    align-self: flex-end;
    margin-top: auto;
    text-decoration: none;
  }
}
</style>
