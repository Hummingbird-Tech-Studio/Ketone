<template>
  <main class="home">
    <section class="home__hero">
      <div class="home__hero-content">
        <h1 class="home__title">A simple and free fasting tracker</h1>
        <p class="home__subtitle">
          No subscriptions, no cluttered, no intrusive; no cookies, no long questionnaires… Oh! and no AI.
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

    <section class="home__feature home__feature--purple">
      <div class="home__feature-image">
        <HomeFreedom />
      </div>
      <div class="home__feature-content">
        <span class="home__feature-label">Freedom Over Routine</span>
        <h2 class="home__feature-title">Fasting should fit your life, not the other way around.</h2>
        <p class="home__feature-text">
          Most fasting apps are cluttered and intrusive, locking you into inflexible plans that don't adapt to everyone.
          <strong>Ketone</strong> adjusts to your schedule, habits, and rhythm, letting you stay consistent with your
          fast.
        </p>
      </div>
    </section>

    <section class="home__feature home__feature--orange home__feature--reversed">
      <div class="home__feature-content">
        <span class="home__feature-label">Privacy by Design</span>
        <h2 class="home__feature-title">Keep your data completely under your control.</h2>
        <p class="home__feature-text">
          <strong>Ketone</strong> uses zero cookies, zero tracking, zero AI, and never sell your data. We won't ask for
          any unnecessary personal details, just full transparency and complete ownership of your information and
          confidence in your fasting journey.
        </p>
      </div>
      <div class="home__feature-image">
        <HomePrivacy />
      </div>
    </section>

    <section class="home__feature home__feature--blue">
      <div class="home__feature-image">
        <HomeFreeForEveryone />
      </div>
      <div class="home__feature-content">
        <span class="home__feature-label">Open, Simple, and Accessible</span>
        <h2 class="home__feature-title">Free and built for everyone.</h2>
        <p class="home__feature-text">
          <strong>Ketone</strong> is simple and completely free with no subscriptions, no hidden costs or premium plans.
          Powered by donations, every improvement is dedicated to making your experience better.
        </p>
      </div>
    </section>

    <section class="home__how-it-works">
      <span class="home__how-it-works-label">How it Works</span>
      <h2 class="home__how-it-works-title">Start fasting in seconds, no friction, no noise</h2>

      <div class="home__steps">
        <div class="home__step">
          <div class="home__step-icon home__step-icon--purple">
            <AddUserIcon />
          </div>
          <h3 class="home__step-title home__step-title--purple">Create your account</h3>
          <p class="home__step-text">
            No long questionnaires, no unnecessary details. Just sign up and start tracking your fast.
          </p>
        </div>

        <div class="home__step">
          <div class="home__step-icon home__step-icon--blue">
            <StartFastIcon />
          </div>
          <h3 class="home__step-title home__step-title--blue">Start your first fast</h3>
          <p class="home__step-text">
            Hit <strong>start fast</strong> to begin. Stop anytime, or select from simple presets that fit your day.
          </p>
        </div>

        <div class="home__step">
          <div class="home__step-icon home__step-icon--orange">
            <ProgressIcon />
          </div>
          <h3 class="home__step-title home__step-title--orange">Review your progress</h3>
          <p class="home__step-text">
            See your fasting history in one place. Your stats update automatically, helping you track your consistency
            over time.
          </p>
        </div>
      </div>

      <router-link to="/sign-in" class="home__cta">Start your fast now!</router-link>
    </section>

    <section class="home__donate">
      <h2 class="home__donate-title">
        Built on Transparency<br />
        Powered by Community
      </h2>
      <p class="home__donate-text">
        We believe in free, open, and transparent software, built with care and driven by trust. Our mission is to
        deliver tools that truly serve people, not ads. Every donation, no matter how small, helps us keep improving and
        creating more open tools for everyone.
      </p>
      <p class="home__donate-highlight">
        Because quality software doesn't have to come with a price tag,<br />
        it just needs people who believe in it.
      </p>
      <a href="#" class="home__donate-button">Donate 💙</a>
    </section>
  </main>
</template>

<script setup lang="ts">
import AddUserIcon from './components/AddUserIcon.vue';
import HomeFasting from './components/HomeFasting.vue';
import HomeFreedom from './components/HomeFreedom.vue';
import HomeFreeForEveryone from './components/HomeFreeForEveryone.vue';
import HomePrivacy from './components/HomePrivacy.vue';
import ProgressIcon from './components/ProgressIcon.vue';
import StartFastIcon from './components/StartFastIcon.vue';
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.home {
  min-height: 100vh;

  // Hero Section
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
    border: 1px solid $color-primary;
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

  // Benefits Section
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

  // Feature Sections (reusable)
  &__feature {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64px $horizontal-gap;
    max-width: 1200px;
    margin: 0 auto;
  }

  &__feature-image {
    max-width: 100%;
    margin-bottom: 40px;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 400px;
    }
  }

  &__feature-content {
    text-align: left;
    max-width: 500px;
  }

  &__feature-label {
    display: block;
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  &__feature-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 16px;
  }

  &__feature-text {
    font-size: 1rem;
    line-height: 1.6;
    color: $color-primary-button-text;

    strong {
      font-weight: 600;
    }
  }

  // Color modifiers
  &__feature--purple {
    .home__feature-label,
    .home__feature-text strong {
      color: $color-dark-purple;
    }
  }

  &__feature--orange {
    .home__feature-label,
    .home__feature-text strong {
      color: $color-warn;
    }
  }

  &__feature--blue {
    .home__feature-label,
    .home__feature-text strong {
      color: $color-info;
    }
  }

  // Reversed layout (image after content in mobile)
  &__feature--reversed &__feature-image {
    order: -1;
  }

  // How it Works Section
  &__how-it-works {
    padding: 64px $horizontal-gap;
    text-align: center;
    background-color: $color-light-grey;
  }

  &__how-it-works-label {
    display: block;
    font-size: 24px;
    font-weight: 600;
    color: $color-primary;
    margin-bottom: 12px;
  }

  &__how-it-works-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 48px;
  }

  &__steps {
    display: flex;
    flex-direction: column;
    gap: 32px;
    margin-bottom: 48px;
  }

  &__step {
    background-color: $color-white;
    border-radius: 16px;
    padding: 32px 24px;
    text-align: center;
  }

  &__step-icon {
    width: 110px;
    height: 110px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;

    :deep(svg) {
      width: 80px;
      height: 80px;
    }

    &--purple {
      background-color: $color-light-purple;
    }

    &--blue {
      background-color: $color-light-blue;
    }

    &--orange {
      background-color: #ffeee6;
    }
  }

  &__step-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 12px;

    &--purple {
      color: $color-dark-purple;
    }

    &--blue {
      color: $color-info;
    }

    &--orange {
      color: $color-warn;
    }
  }

  &__step-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: $color-primary-button-text;
    margin: 0;

    strong {
      font-weight: 600;
    }
  }

  // Donate Section
  &__donate {
    padding: 64px $horizontal-gap;
    text-align: center;
    background-color: $color-ultra-light-blue;
  }

  &__donate-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 24px;
    line-height: 1.3;
  }

  &__donate-text {
    font-size: 1rem;
    line-height: 1.6;
    color: $color-primary-button-text;
    margin: 0 auto 24px;
    max-width: 700px;
  }

  &__donate-highlight {
    font-size: 1rem;
    line-height: 1.6;
    color: $color-info;
    font-weight: 500;
    margin: 0 0 32px;
  }

  &__donate-button {
    display: inline-block;
    padding: 14px 32px;
    background-color: #a3d1ff;
    color: #1382ee;
    font-weight: 600;
    font-size: 1rem;
    border-radius: 50px;
    border: 1px solid #1382ee;
    text-decoration: none;
    transition:
      background-color 0.2s,
      transform 0.2s;

    &:hover {
      background-color: #abd2fa;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  // Desktop styles
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

    &__feature {
      flex-direction: row;
      align-items: center;
      justify-content: center;
      padding: 80px $horizontal-gap;
      gap: 60px;
    }

    &__feature-image {
      margin-bottom: 0;
      flex: 0 0 50%;
      display: flex;
      justify-content: center;

      :deep(svg) {
        max-width: 500px;
      }
    }

    &__feature-content {
      flex: 0 0 calc(50% - 60px);
      max-width: 480px;
    }

    &__feature--reversed &__feature-image {
      order: 0;
    }

    &__how-it-works {
      padding: 80px $horizontal-gap;
    }

    &__how-it-works-title {
      font-size: 2.25rem;
    }

    &__steps {
      flex-direction: row;
      justify-content: center;
      max-width: 1000px;
      margin: 0 auto 48px;
    }

    &__step {
      flex: 1;
      max-width: 320px;
    }

    &__donate {
      padding: 80px $horizontal-gap;
    }

    &__donate-title {
      font-size: 2.25rem;
    }
  }
}
</style>
