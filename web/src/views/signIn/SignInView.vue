<template>
  <div class="signIn">
    <div class="signIn__title">LOG IN</div>
    <div v-if="serviceError" class="signIn__serviceError">{{ serviceError }}</div>
    <Field name="email" v-slot="{ field, errorMessage }">
      <InputText
        :class="['signIn__email', { 'signIn__email--error': errorMessage }]"
        v-bind="field"
        @keyup.enter="onSubmit"
        type="text"
        placeholder="Email"
        variant="filled"
      />

      <Message class="signIn__email__errorMessage" v-if="errorMessage" severity="error" variant="simple" size="small">
        {{ errorMessage }}
      </Message>
    </Field>

    <Field name="password" v-slot="{ field, errorMessage }">
      <Password
        :class="['signIn__password', { 'signIn__password--error': errorMessage }]"
        v-bind="field"
        @keyup.enter="onSubmit"
        :feedback="false"
        inputId="password-input"
        placeholder="Password"
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
      <Message
        class="signIn__password__errorMessage"
        v-if="errorMessage"
        severity="error"
        variant="simple"
        size="small"
      >
        {{ errorMessage }}
      </Message>
    </Field>

    <div class="signIn__forgotPassword">
      <RouterLink class="signIn__link signIn__link--password" to="/forgot-password"> Forgot Password? </RouterLink>
    </div>

    <Button
      class="signIn__button"
      label="Log in"
      :loading="submitting"
      severity="help"
      rounded
      @click="onSubmit"
      outlined
      fluid
    />

    <div class="signIn__noAccount">
      Don't have an account? &nbsp;
      <RouterLink class="signIn__link" to="/sign-up">Sign up</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { authenticationActor, Event as AuthEvent } from '@/actors/authenticationActor';
import { Emit, type EmitType } from '@/views/signIn/actors/signIn.actor';
import { useSignIn } from '@/views/signIn/composables/useSignIn';
import { EmailSchema } from '@ketone/shared';
import { Match, Schema } from 'effect';
import { configure, Field, useForm } from 'vee-validate';
import { onUnmounted, ref, watch } from 'vue';

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const { submit, submitting, actorRef } = useSignIn();
const serviceError = ref<string | null>(null);

// Sign-in only validates required fields, no password complexity hints for security
const schemaStruct = Schema.Struct({
  email: EmailSchema,
  password: Schema.String.pipe(Schema.minLength(1, { message: () => 'Please enter your password' })),
});

type FormValues = Schema.Schema.Type<typeof schemaStruct>;

const StandardSchemaClass = Schema.standardSchemaV1(schemaStruct);
const schema = {
  ...StandardSchemaClass,
  '~standard': StandardSchemaClass['~standard' as keyof typeof StandardSchemaClass],
};

const { handleSubmit } = useForm<FormValues>({
  validationSchema: schema,
  initialValues: {
    email: '',
    password: '',
  },
});

const onSubmit = handleSubmit((values) => {
  submit(values);
});

function handleSignInEmit(emitType: EmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: Emit.SIGN_IN_SUCCESS }, (emit) => {
      serviceError.value = null;

      authenticationActor.send({
        type: AuthEvent.AUTHENTICATE,
        token: emit.result.token,
        user: emit.result.user,
      });
    }),
    Match.when({ type: Emit.SIGN_IN_ERROR }, (emit) => {
      serviceError.value = emit.error;
    }),
    Match.exhaustive,
  );
}

const signInSubscription = Object.values(Emit).map((emit) => actorRef.on(emit, handleSignInEmit));

watch(submitting, (isSubmitting) => {
  if (isSubmitting) {
    serviceError.value = null;
  }
});

onUnmounted(() => {
  signInSubscription.forEach((sub) => sub.unsubscribe());
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.signIn {
  display: flex;
  flex-direction: column;
  margin: auto;
  width: 317px;
  min-height: 396px;
  padding: 22px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 16px;

  &__title {
    font-style: normal;
    font-weight: 700;
    font-size: 18px;
    color: $color-primary-button-text;
    margin-bottom: 24px;
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
      margin-bottom: 4px;
    }
  }

  &__forgotPassword {
    display: flex;
    margin-bottom: 16px;
    justify-content: flex-end;
  }

  &__button {
    width: 130px;
    align-self: center;
    margin-bottom: 16px;
  }

  &__OAuth {
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
    align-items: center;
    color: $color-primary-button-text;
    font-size: 12px;
    margin-bottom: 16px;

    &__icon {
      width: 32px;
      height: 32px;
    }
  }

  &__noAccount {
    margin-top: auto;
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
