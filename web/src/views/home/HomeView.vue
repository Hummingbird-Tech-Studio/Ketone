<template>
  <main class="home">
    <section class="home__hero">
      <div class="home__hero-content">
        <h1 class="home__title">A simple and free fasting tracker</h1>
        <p class="home__subtitle">
          Not subscriptions, not cluttered, not intrusive; no cookies, no long questionnaires… Oh! and no AI.
        </p>
        <router-link to="/sign-in" class="home__cta">Start your fast now!</router-link>
      </div>
      <div class="home__hero-image">
        <HomeFasting />
      </div>
    </section>

    <section class="home__benefits">
      <p class="home__benefits-text">
        Studies show that <strong>fasting</strong> can boost energy levels, support metabolic health, and improve
        overall well-being.
      </p>
    </section>

    <section class="home__freedom">
      <div class="home__freedom-image">
        <HomeFreedom />
      </div>
      <div class="home__freedom-content">
        <span class="home__freedom-label">Freedom Over Routine</span>
        <h2 class="home__freedom-title">Fasting should fit your life, not the other way around.</h2>
        <p class="home__freedom-text">
          Most fasting apps are cluttered and intrusive, locking you into inflexible plans that don't adapt to everyone.
          <strong>Ketone</strong> adjusts to your schedule, habits, and rhythm, letting you stay consistent with your
          fast.
        </p>
      </div>
    </section>

    <section class="home__privacy">
      <div class="home__privacy-content">
        <span class="home__privacy-label">Privacy by Design</span>
        <h2 class="home__privacy-title">Keep your data completely under your control.</h2>
        <p class="home__privacy-text">
          <strong>Ketone</strong> use zero cookies, zero tracking, zero AI, and never sell your data. We won't ask for
          any unnecessary personal details, just full transparency and complete ownership of your information and
          confidence in your fasting journey.
        </p>
      </div>
      <div class="home__privacy-image">
        <HomePrivacy />
      </div>
    </section>

    <section class="home__open">
      <div class="home__open-image">
        <HomeFreeForEveryone />
      </div>
      <div class="home__open-content">
        <span class="home__open-label">Open, Simple, and Accessible</span>
        <h2 class="home__open-title">Free and built for everyone.</h2>
        <p class="home__open-text">
          <strong>Ketone</strong> is simple and completely free with no subscriptions, no hidden costs or premium plans.
          Powered by donations, every improvement is dedicated to making your experience better.
        </p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import HomeFasting from './components/HomeFasting.vue';
import HomeFreedom from './components/HomeFreedom.vue';
import HomeFreeForEveryone from './components/HomeFreeForEveryone.vue';
import HomePrivacy from './components/HomePrivacy.vue';
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.home {
  min-height: 100vh;
  background-color: $color-light-grey;

  &__hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px $horizontal-gap;
    max-width: 1200px;
    margin: 0 auto;
  }

  &__hero-content {
    text-align: center;
    max-width: 400px;
  }

  &__title {
    font-size: 56px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 16px;
  }

  &__subtitle {
    font-size: 1rem;
    line-height: 1.5;
    color: $color-primary-button-text;
    margin: 0 0 32px;
  }

  &__cta {
    display: inline-block;
    padding: 14px 24px;
    background: #e2fae5;
    border-radius: 50px;
    color: $color-primary;
    font-weight: 600;
    font-size: 16px;
    border: 2px solid $color-primary;
    text-decoration: none;
    transition:
      background-color 0.2s,
      transform 0.2s;

    &:hover {
      background-color: #d4f4e8;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &__hero-image {
    margin-top: 40px;
    max-width: 100%;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 500px;
    }
  }

  &__benefits {
    background-color: $color-ultra-light-blue;
    padding: 48px $horizontal-gap;
    text-align: center;
  }

  &__benefits-text {
    max-width: 600px;
    margin: 0 auto;
    font-size: 1rem;
    line-height: 1.6;
    color: $color-info;

    strong {
      font-weight: 700;
    }
  }

  &__freedom {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64px $horizontal-gap;
    max-width: 1200px;
    margin: 0 auto;
  }

  &__freedom-image {
    max-width: 100%;
    margin-bottom: 40px;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 400px;
    }
  }

  &__freedom-content {
    text-align: center;
    max-width: 500px;
  }

  &__freedom-label {
    display: block;
    font-size: 18px;
    font-weight: 600;
    color: $color-dark-purple;
    margin-bottom: 12px;
  }

  &__freedom-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 16px;
  }

  &__freedom-text {
    font-size: 1rem;
    line-height: 1.6;
    color: $color-primary-button-text;

    strong {
      color: $color-dark-purple;
      font-weight: 600;
    }
  }

  &__privacy {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64px $horizontal-gap;
    max-width: 1200px;
    margin: 0 auto;
  }

  &__privacy-image {
    max-width: 100%;
    order: -1;
    margin-bottom: 40px;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 400px;
    }
  }

  &__privacy-content {
    text-align: center;
    max-width: 500px;
  }

  &__privacy-label {
    display: block;
    font-size: 18px;
    font-weight: 600;
    color: $color-warn;
    margin-bottom: 12px;
  }

  &__privacy-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 16px;
  }

  &__privacy-text {
    font-size: 1rem;
    line-height: 1.6;
    color: $color-primary-button-text;

    strong {
      color: $color-warn;
      font-weight: 600;
    }
  }

  &__open {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64px $horizontal-gap;
    max-width: 1200px;
    margin: 0 auto;
  }

  &__open-image {
    max-width: 100%;
    margin-bottom: 40px;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 400px;
    }
  }

  &__open-content {
    text-align: center;
    max-width: 500px;
  }

  &__open-label {
    display: block;
    font-size: 18px;
    font-weight: 600;
    color: $color-info;
    margin-bottom: 12px;
  }

  &__open-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 16px;
  }

  &__open-text {
    font-size: 1rem;
    line-height: 1.6;
    color: $color-primary-button-text;

    strong {
      color: $color-info;
      font-weight: 600;
    }
  }

  @media (min-width: $breakpoint-desktop-min-width) {
    &__hero {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      padding: 80px $horizontal-gap;
      min-height: 80vh;
    }

    &__hero-content {
      text-align: left;
      max-width: 420px;
      flex-shrink: 0;
    }

    &__hero-image {
      margin-top: 0;
      margin-left: 60px;
      flex: 1;
      display: flex;
      justify-content: center;

      :deep(svg) {
        max-width: 600px;
      }
    }

    &__freedom {
      flex-direction: row;
      padding: 80px $horizontal-gap;
      gap: 60px;
    }

    &__freedom-image {
      margin-bottom: 0;
      flex: 1;

      :deep(svg) {
        max-width: 500px;
      }
    }

    &__freedom-content {
      text-align: left;
      max-width: 480px;
      flex-shrink: 0;
    }

    &__privacy {
      flex-direction: row;
      padding: 80px $horizontal-gap;
      gap: 60px;
    }

    &__privacy-image {
      order: 0;
      margin-bottom: 0;
      flex: 1;

      :deep(svg) {
        max-width: 500px;
      }
    }

    &__privacy-content {
      text-align: left;
      max-width: 480px;
      flex-shrink: 0;
    }

    &__open {
      flex-direction: row;
      padding: 80px $horizontal-gap;
      gap: 60px;
    }

    &__open-image {
      margin-bottom: 0;
      flex: 1;

      :deep(svg) {
        max-width: 500px;
      }
    }

    &__open-content {
      text-align: left;
      max-width: 480px;
      flex-shrink: 0;
    }
  }
}
</style>
