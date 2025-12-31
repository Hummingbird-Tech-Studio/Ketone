<template>
  <main class="contact">
    <h1 class="contact__title">Contact</h1>

    <p class="contact__text">
      We'd love to hear from you! If you'd like to share feedback, suggest new ideas, report an issue, or simply say
      hello, please reach out to us.
    </p>

    <p class="contact__text">
      Feel free to contact us at any time at
      <a href="mailto:contact@ketone.dev" class="contact__email">contact@ketone.dev</a>, and we will respond as soon as
      possible. Your feedback helps us grow and build better tools for everyone.
    </p>
  </main>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.contact {
  max-width: 800px;
  margin: 0 auto;
  padding: 48px $horizontal-gap;

  &__title {
    font-size: 32px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 24px;
  }

  &__text {
    font-size: 1rem;
    line-height: 1.7;
    color: $color-primary-button-text;
    margin: 0 0 24px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__email {
    font-weight: 600;
    color: $color-primary-button-text;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
