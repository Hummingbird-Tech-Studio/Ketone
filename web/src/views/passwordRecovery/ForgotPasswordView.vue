<template>
  <div class="forgotPassword">
    <!-- Email Sent Confirmation -->
    <template v-if="emailSent">
      <div class="forgotPassword__title">EMAIL SENT</div>
      <div class="forgotPassword__message">
        We sent an email to <span class="forgotPassword__email">{{ sentToEmail }}</span
        >. Check your inbox and follow the link to reset your password. If you don't see it, check your spam folder.
      </div>
      <RouterLink class="forgotPassword__loginButton" to="/sign-in">
        <Button label="Go to Login" severity="help" rounded outlined />
      </RouterLink>
    </template>

    <!-- Forgot Password Form -->
    <template v-else>
      <div class="forgotPassword__title">FORGOT PASSWORD?</div>
      <div class="forgotPassword__description">
        Enter your email address below and we'll send you a link to reset it.
      </div>

      <div v-if="serviceError" class="forgotPassword__serviceError">{{ serviceError }}</div>

      <Field name="email" v-slot="{ field, errorMessage }">
        <InputText
          :class="['forgotPassword__input', { 'forgotPassword__input--error': errorMessage }]"
          v-bind="field"
          @keyup.enter="onSubmit"
          type="text"
          placeholder="Email"
          variant="filled"
        />

        <Message
          class="forgotPassword__errorMessage"
          v-if="errorMessage"
          severity="error"
          variant="simple"
          size="small"
        >
          {{ errorMessage }}
        </Message>
      </Field>

      <div class="forgotPassword__buttons">
        <RouterLink to="/sign-in">
          <Button label="Cancel" severity="help" rounded outlined />
        </RouterLink>
        <Button label="Send Link" :loading="submitting" severity="help" rounded @click="onSubmit" outlined />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Emit, type EmitType } from '@/views/passwordRecovery/actors/forgotPassword.actor';
import { useForgotPassword } from '@/views/passwordRecovery/composables/useForgotPassword';
import { EmailSchema } from '@ketone/shared';
import { Match, Schema } from 'effect';
import { configure, Field, useForm } from 'vee-validate';
import { onUnmounted, ref, watch } from 'vue';

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const { submit, submitting, actorRef } = useForgotPassword();
const serviceError = ref<string | null>(null);
const emailSent = ref(false);
const sentToEmail = ref('');

const schemaStruct = Schema.Struct({
  email: EmailSchema,
});

type FormValues = Schema.Schema.Type<typeof schemaStruct>;

const StandardSchemaClass = Schema.standardSchemaV1(schemaStruct);
const schema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit, values } = useForm<FormValues>({
  validationSchema: schema,
  initialValues: {
    email: '',
  },
});

const onSubmit = handleSubmit((formValues) => {
  submit(formValues.email);
});

function handleForgotPasswordEmit(emitType: EmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: Emit.FORGOT_PASSWORD_SUCCESS }, () => {
      serviceError.value = null;
      sentToEmail.value = values.email;
      emailSent.value = true;
    }),
    Match.when({ type: Emit.FORGOT_PASSWORD_ERROR }, (emit) => {
      serviceError.value = emit.error;
    }),
    Match.exhaustive,
  );
}

const forgotPasswordSubscription = Object.values(Emit).map((emit) => actorRef.on(emit, handleForgotPasswordEmit));

watch(submitting, (isSubmitting) => {
  if (isSubmitting) {
    serviceError.value = null;
  }
});

onUnmounted(() => {
  forgotPasswordSubscription.forEach((sub) => sub.unsubscribe());
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.forgotPassword {
  display: flex;
  flex-direction: column;
  margin: auto;
  width: 317px;
  min-height: 240px;
  padding: 22px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 16px;

  &__title {
    font-style: normal;
    font-weight: 700;
    font-size: 18px;
    color: $color-primary-button-text;
    margin-bottom: 16px;
  }

  &__description {
    font-size: 14px;
    color: $color-primary-button-text;
    margin-bottom: 24px;
  }

  &__message {
    font-size: 14px;
    color: $color-primary-button-text;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  &__email {
    color: $color-dark-purple;
  }

  &__input {
    width: 100%;
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

  &__buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
  }

  &__loginButton {
    align-self: flex-end;
    margin-top: auto;
    text-decoration: none;
  }
}
</style>
