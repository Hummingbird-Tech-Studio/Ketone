<template>
  <div class="signUp">
    <div class="signUp___title">SIGN UP</div>
    <div v-if="serviceError" class="signUp__serviceError">{{ serviceError }}</div>
    <Field name="email" v-slot="{ field, errorMessage }">
      <InputText
        :class="['signUp__email', { 'signUp__email--error': errorMessage }]"
        v-bind="field"
        @keyup.enter="onSubmit"
        type="text"
        placeholder="Email"
        variant="filled"
      />

      <Message class="signUp__email__errorMessage" v-if="errorMessage" severity="error" variant="simple" size="small">
        {{ errorMessage }}
      </Message>
    </Field>

    <Field name="password" v-slot="{ field, value, errorMessage, errors }">
      <Password
        :class="['signUp__password', { 'signUp__password--error': errorMessage }]"
        v-bind="field"
        @keyup.enter="onSubmit"
        :feedback="false"
        inputId="password-input"
        placeholder="Password"
        aria-label="password-input"
        :pt="{
          pcInputText: {
            // This targets the child <InputText> component
            // which renders the actual <input> element.
            // This is needed for accessibility and might break the password meter.
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
        class="signUp__password__errorMessage"
        v-if="requiredError(errors[0])"
        severity="error"
        variant="simple"
        size="small"
      >
        {{ errorMessage }}
      </Message>

      <template v-if="errors.length > 0 && !requiredError(errors[0])">
        <div class="signUp__passwordRequirements">Create a password that contains at least:</div>
        <ul class="signUp__passwordRequirements signUp__passwordRequirements__list">
          <li
            v-for="requirement in PASSWORD_RULES"
            :key="requirement.message"
            :class="[
              'signUp__passwordRequirements__item',
              {
                'signUp__passwordRequirements__item--valid': validatePasswordRule(requirement, value),
              },
            ]"
          >
            <span class="signUp__passwordRequirements__icon">
              <i class="pi pi-check" style="font-size: 0.9rem" v-if="validatePasswordRule(requirement, value)"></i>
              <i class="pi pi-exclamation-circle" v-else></i>
            </span>
            <span>{{ requirement.message }}</span>
          </li>
        </ul>
      </template>
    </Field>

    <label class="signUp__privacyPolicy" for="privacyPolicy">
      By clicking Sign Up, I agree to Fasting Tracker's
      <RouterLink class="signUp__privacyPolicy__link" to="/sign-in">terms of service</RouterLink> and
      <RouterLink class="signUp__privacyPolicy__link" to="/sign-in">privacy policy</RouterLink>.
    </label>

    <Button
      class="signUp__button"
      label="Sign Up"
      :loading="submitting"
      severity="help"
      rounded
      @click="onSubmit"
      outlined
      fluid
    />
    <div class="signUp__account">
      Already have an account? &nbsp;
      <RouterLink class="signUp__link" to="/sign-in">Log in</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue';
import { useSelector } from '@xstate/vue';
import { configure, useForm, Field } from 'vee-validate';
import { z, object, string } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { Event, signUpActor, SignUpState } from '@/views/signUp/actors/signUpActor';

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const serviceError = useSelector(signUpActor, (state) => state.context.serviceError);
const submitting = useSelector(signUpActor, (state) => state.matches(SignUpState.Submitting));

type PasswordRule = { type: 'min'; value: number; message: string } | { type: 'regex'; value: RegExp; message: string };
const PASSWORD_RULES: PasswordRule[] = [
  {
    type: 'min',
    value: 8,
    message: '8 characters',
  },
  {
    type: 'regex',
    value: /[a-z]/,
    message: '1 lowercase letter',
  },
  {
    type: 'regex',
    value: /\d/,
    message: '1 number',
  },
  {
    type: 'regex',
    value: /[~`!@#$%^&*()--+={}[\]|\\:;"'<>,.?/_₹]/,
    message: '1 special character (e.g., %, &, $, !, @)',
  },
  {
    type: 'regex',
    value: /^\S*$/,
    message: 'No leading or trailing whitespace',
  },
];
const passwordSchema = buildPasswordSchema(PASSWORD_RULES);

const schema = toTypedSchema(
  object({
    email: string({
      required_error: 'Please enter your email address',
    }).email({ message: 'Please enter a valid email address' }),
    password: passwordSchema,
  }),
);

function buildPasswordSchema(rules: PasswordRule[]) {
  const baseSchema = z.string({
    required_error: 'Please enter your password',
  });

  return rules.reduce((schema, rule) => {
    switch (rule.type) {
      case 'min':
        return schema.min(rule.value, rule.message);
      case 'regex':
        return schema.regex(rule.value, rule.message);
      default:
        return schema;
    }
  }, baseSchema);
}

function validatePasswordRule(rule: PasswordRule, password: string): boolean {
  switch (rule.type) {
    case 'min':
      return password.length >= rule.value;
    case 'regex':
      return rule.value.test(password);
    default:
      return false;
  }
}

const { handleSubmit } = useForm({
  validationSchema: schema,
});

const onSubmit = handleSubmit((values) => {
  signUpActor.send({ type: Event.SUBMIT, values });
});

function requiredError(field: string | undefined) {
  return field === 'Please enter your password';
}

onUnmounted(() => {
  signUpActor.send({ type: Event.RESET_CONTEXT });
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.signUp {
  display: flex;
  flex-direction: column;
  margin: auto;
  width: 317px;
  min-height: 340px;
  padding: 22px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 16px;

  &___title {
    font-style: normal;
    font-weight: 700;
    font-size: 18px;
    color: $color-primary-button-text;
    margin-bottom: 16px;
  }

  &__email {
    margin-bottom: 16px;

    &--error {
      margin-bottom: 4px;
    }

    &__errorMessage {
      font-size: 12px;
      margin-bottom: 12px;
    }
  }

  &__password {
    margin-bottom: 8px;

    &--error {
      margin-bottom: 4px;
    }

    &__errorMessage {
      font-size: 12px;
    }
  }

  &__privacyPolicy {
    font-size: 10px;
    color: $color-primary-button-text;
    margin-top: 16px;
    margin-bottom: 24px;

    &__link {
      color: $color-dark-purple;
    }
  }

  &__account {
    display: flex;
    justify-content: center;
    align-items: center;
    color: $color-primary-button-text;
    font-size: 12px;
  }

  &__link {
    font-size: 12px;
    color: $color-dark-purple;
    text-decoration: none;

    &--password {
      margin-top: 8px;
    }
  }

  &__passwordRequirements {
    margin-top: 12px;
    font-size: 12px;
    color: $color-primary-button-text;
    font-weight: 500;

    &__list {
      list-style-type: none;
      padding-left: 0;
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

  &__button {
    width: 130px;
    align-self: center;
    margin-bottom: 24px;
  }

  &__serviceError {
    border: 1px solid $color-error;
    border-radius: 4px;
    padding: 8px;
    font-size: 12px;
    color: $color-error;
    margin-bottom: 16px;
  }
}
</style>
