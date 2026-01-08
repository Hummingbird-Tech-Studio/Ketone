<template>
  <main class="home">
    <section class="home__hero">
      <div class="home__container home__container--hero">
        <div class="home__hero-content">
          <h1 class="home__title">Your fasting.<br />Your data.<br />Your control.</h1>
          <p class="home__subtitle">
            Fasting made simple. Privacy made real. No ads, no tracking, no AI. Just a clean fasting app. Free forever &
            open source.
          </p>
          <router-link to="/sign-in" class="home__cta">Start your fast now!</router-link>
        </div>
        <div class="home__hero-image">
          <HomeFasting />
        </div>
      </div>
    </section>

    <section class="home__benefits">
      <div class="home__container home__container--benefits">
        <p class="home__benefits-text">
          Studies show that fasting can boost energy levels, support metabolic health, and improve overall well-being.
        </p>
      </div>
    </section>

    <section class="home__feature home__feature--purple">
      <div class="home__container home__container--feature">
        <div class="home__feature-image">
          <HomeFreedom />
        </div>
        <div class="home__feature-content">
          <span class="home__feature-label">Simple by design</span>
          <h2 class="home__feature-title">Complexity breaks habits. Simplicity strengthens them.</h2>
          <p class="home__feature-text">
            Start a fast in seconds. Check your progress. Keep going. No 30-step setup. No clutter, no learning curve,
            just space to focus on your fast.
          </p>
        </div>
      </div>
    </section>

    <section class="home__feature home__feature--orange home__feature--reversed">
      <div class="home__container home__container--feature">
        <div class="home__feature-content">
          <span class="home__feature-label">Your data. Actually yours.</span>
          <h2 class="home__feature-title">Privacy isn't a feature. It's how we built this.</h2>
          <p class="home__feature-text">
            No AI dissecting your patterns. No business model based on your information. Our code is open source, your
            data is fully portable, and control always stays with you. Export it, delete it, or walk away at any time.
          </p>
        </div>
        <div class="home__feature-image home__feature-image--privacy">
          <HomePrivacy />
        </div>
      </div>
    </section>

    <section class="home__feature home__feature--blue">
      <div class="home__container home__container--feature">
        <div class="home__feature-image">
          <HomeFreeForEveryone />
        </div>
        <div class="home__feature-content">
          <span class="home__feature-label">All features. All users. Always free.</span>
          <h2 class="home__feature-title">Every feature available to everyone, everywhere.</h2>
          <p class="home__feature-text">
            Every feature works on every device: web, iOS, Android. No subscriptions. No premium tiers. No features held
            hostage. Supported by voluntary donations from users. Use it free. Support it if it helps you. It works
            either way.
          </p>
        </div>
      </div>
    </section>

    <section class="home__how-it-works">
      <div class="home__container home__container--how-it-works">
        <div class="home__how-it-works-label-container">
          <span class="home__how-it-works-label">How it Works</span>
        </div>
        <h2 class="home__how-it-works-title">Track your fast in 3 simple steps</h2>

        <div class="home__steps">
          <div class="home__step">
            <div class="home__step-icon">
              <AddUserIcon />
            </div>
            <h3 class="home__step-title home__step-title--purple">Create your account</h3>
            <p class="home__step-text">Set up your account in seconds. No long forms, no unnecessary steps.</p>
          </div>

          <div class="home__step">
            <div class="home__step-icon">
              <StartFastIcon />
            </div>
            <h3 class="home__step-title home__step-title--blue">Start your fast</h3>
            <p class="home__step-text">Choose your fasting window and begin right away.</p>
          </div>

          <div class="home__step">
            <div class="home__step-icon">
              <ProgressIcon />
            </div>
            <h3 class="home__step-title home__step-title--orange">Review your progress</h3>
            <p class="home__step-text">See your fasting history and current progress anytime, on any device.</p>
          </div>
        </div>

        <router-link to="/sign-in" class="home__cta">Start your fast now!</router-link>
      </div>
    </section>

    <section class="home__donate">
      <div class="home__container home__container--donate">
        <h2 class="home__donate-title">Software made for people, not for profit</h2>
        <p class="home__donate-text">
          We believe in free, open source software built with care and sustained by trust. Ketone exists to create tools
          that serve and respect the people who use them. The project is supported by voluntary donations, and every
          contribution helps us improve the app and invest in more open tools for everyone. Because quality software
          doesn't have to come with a price tag, it just needs people who believe in it.
        </p>
        <p class="home__donate-highlight">
          Because quality software doesn't have to come with a price tag,<br />
          it just needs people who believe in it.
        </p>
        <a href="#" class="home__donate-button">Donate 💙</a>
      </div>
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

  &__container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 $horizontal-gap;
  }

  &__container--hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 48px;
    padding-bottom: 48px;
  }

  &__container--feature {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 64px;
    padding-bottom: 64px;
  }

  &__container--benefits {
    padding-top: 48px;
    padding-bottom: 48px;
  }

  &__container--how-it-works {
    padding-top: 64px;
    padding-bottom: 64px;
  }

  &__container--donate {
    padding-top: 64px;
    padding-bottom: 64px;
  }

  &__hero {
    width: 100%;
  }

  &__hero-content {
    text-align: center;
    max-width: 400px;
  }

  &__title {
    font-size: 56px;
    font-weight: 700;
    margin: 0 0 16px;
    background: linear-gradient(to bottom right, $color-green 0%, $color-dark-blue 50%, $color-dark-purple 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
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
    text-align: center;
  }

  &__benefits-text {
    max-width: 600px;
    margin: 0 auto;
    font-size: 20px;
    line-height: 1.6;
    color: $color-info;
    font-weight: 700;
  }

  // Color modifiers
  &__feature {
    width: 100%;
  }

  &__feature-image {
    max-width: 100%;
    margin-bottom: 40px;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 400px;
    }

    &--privacy {
      :deep(svg) {
        max-width: 300px;
      }
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
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.4) 57.96%, rgba(215, 149, 255, 0.4) 100.02%);

    .home__feature-label,
    .home__feature-text strong {
      color: $color-dark-purple;
    }
  }

  &__feature--orange {
    background: linear-gradient(90deg, rgba(247, 137, 96, 0.3) 0%, rgba(255, 255, 255, 0.3) 44.55%);

    .home__feature-label,
    .home__feature-text strong {
      color: $color-warn;
    }
  }

  &__feature--blue {
    background: linear-gradient(270deg, rgba(122, 189, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 41.15%);

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
    text-align: center;
  }

  &__how-it-works-label-container {
    display: flex;
    width: 260px;
    height: 60px;
    background: #e2fae5;
    border-radius: 50px;
    margin: 0 auto 48px;
  }

  &__how-it-works-label {
    margin: auto;
    font-weight: 700;
    font-size: 25px;
    color: #2ecd68;
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
    &__container--hero {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      padding-top: 80px;
      padding-bottom: 80px;
    }

    &__container--feature {
      flex-direction: row;
      align-items: center;
      justify-content: center;
      padding-top: 80px;
      padding-bottom: 80px;
      gap: 60px;
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
        max-width: 435px;
      }
    }

    &__feature-image {
      margin-bottom: 0;
      flex: 0 0 50%;
      display: flex;
      justify-content: center;

      :deep(svg) {
        max-width: 500px;
      }

      &--privacy {
        :deep(svg) {
          max-width: 370px;
        }
      }
    }

    &__feature-content {
      flex: 0 0 calc(50% - 60px);
      max-width: 480px;
    }

    &__feature--reversed &__feature-image {
      order: 0;
    }

    &__container--how-it-works {
      padding-top: 80px;
      padding-bottom: 80px;
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

    &__container--donate {
      padding-top: 80px;
      padding-bottom: 80px;
    }

    &__donate-title {
      font-size: 2.25rem;
    }
  }
}
</style>
