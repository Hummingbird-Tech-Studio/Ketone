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

    <div class="contact__image">
      <Contact />
    </div>
  </main>
</template>

<script setup lang="ts">
import Contact from './components/Contact.vue';
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.contact {
  max-width: 800px;
  margin: 0 auto;
  padding: 48px $horizontal-gap;

  &__title {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 24px;
    background: linear-gradient(90.44deg, #b5ffbd 0.17%, #7abdff 9.79%, #cf81ff 19.98%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  &__text {
    font-size: 16px;
    color: $color-primary-button-text;
    margin: 0 0 24px;
  }

  &__image {
    display: flex;
    justify-content: center;
    margin-top: 24px;

    :deep(svg) {
      width: 150px;
      height: auto;
    }
  }

  @media (min-width: $breakpoint-tablet-min-width) {
    &__image {
      :deep(svg) {
        width: 200px;
      }
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
