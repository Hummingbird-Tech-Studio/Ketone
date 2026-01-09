<template>
  <main class="about">
    <h1 class="about__title">About us</h1>

    <p class="about__text">
      We are a small group of people passionate about building high-quality software that genuinely improves everyday
      life. Our mission is simple: create apps that are free, simple, and accessible to everyone, with no ads, no
      cookies, and no data selling. Ever.
    </p>

    <p class="about__text">
      We believe technology should serve ordinary people, not just big corporations or powerful industries. That's why
      every product we build is designed with transparency, privacy, and user empowerment at its core.
    </p>

    <p class="about__text">
      Our goal is to offer honest, thoughtful software created for the benefit of everyone. To keep our projects alive
      and cover ongoing operating costs, we gladly welcome donations. They allow us to continue improving our tools and,
      just like anyone else, we believe the work we pour into these apps deserves fair support so we can keep doing what
      we love.
    </p>

    <p class="about__text">
      If you find value in what we create, consider supporting us. Every contribution helps us stay independent and
      focused on building technology that truly puts people first.
    </p>

    <div class="about__signature">
      <div class="about__signature-text">
        <p class="about__sincerely">Sincerely,</p>
        <p class="about__team">The Hummingbird Tech Studio Team</p>
      </div>
      <div class="about__signature-image">
        <Hummingbird />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import Hummingbird from './components/Hummingbird.vue';
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.about {
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

  &__signature {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 48px;
  }

  &__signature-text {
    flex: 1;
  }

  &__sincerely {
    font-size: 16px;
    color: $color-primary-button-text;
    margin: 0 0 4px;
  }

  &__team {
    font-size: 16px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__signature-image {
    :deep(svg) {
      width: 150px;
      height: auto;
    }
  }

  @media (min-width: $breakpoint-tablet-min-width) {
    &__signature-image {
      :deep(svg) {
        width: 200px;
      }
    }
  }
}
</style>
