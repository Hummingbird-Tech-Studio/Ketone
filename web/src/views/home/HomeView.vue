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

    <section ref="purpleSection" class="home__feature home__feature--purple" :style="{ '--progress': purpleProgress }">
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

    <section
      ref="orangeSection"
      class="home__feature home__feature--orange home__feature--reversed"
      :style="{ '--progress': orangeProgress }"
    >
      <div class="home__container home__container--feature">
        <div class="home__feature-content">
          <span class="home__feature-label">Your data. Actually yours.</span>
          <h2 class="home__feature-title">Privacy isn't a feature. It's how we built this.</h2>
          <p class="home__feature-text">
            No AI dissecting your patterns. No business model based on your information. Our code is open source, your
            data is fully portable, and control always stays with you. Export it, delete it, or walk away at any time.
          </p>
        </div>
        <div class="home__feature-image">
          <HomePrivacy />
        </div>
      </div>
    </section>

    <section ref="blueSection" class="home__feature home__feature--blue" :style="{ '--progress': blueProgress }">
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

        <div ref="stepsSection" class="home__steps">
          <div class="home__steps-bar"></div>
          <div class="home__step">
            <div class="home__step-icon">
              <div class="home__step-blur" :class="{ 'home__step-blur--active': stepsVisible }"></div>
              <div class="home__step-blur" :class="{ 'home__step-blur--active': stepsVisible }"></div>
              <AddUserIcon />
            </div>
            <div class="home__step-content">
              <h3 class="home__step-title home__step-title--purple">Create your account</h3>
              <p class="home__step-text">Set up your account in seconds. No long forms, no unnecessary steps.</p>
            </div>
          </div>

          <div class="home__step">
            <div class="home__step-icon">
              <div class="home__step-blur" :class="{ 'home__step-blur--active': stepsVisible }"></div>
              <div class="home__step-blur" :class="{ 'home__step-blur--active': stepsVisible }"></div>
              <StartFastIcon />
            </div>
            <div class="home__step-content">
              <h3 class="home__step-title home__step-title--blue">Start your fast</h3>
              <p class="home__step-text">Choose your fasting window and begin right away, when you’re ready.</p>
            </div>
          </div>

          <div class="home__step">
            <div class="home__step-icon">
              <div class="home__step-blur" :class="{ 'home__step-blur--active': stepsVisible }"></div>
              <div class="home__step-blur" :class="{ 'home__step-blur--active': stepsVisible }"></div>
              <ProgressIcon />
            </div>
            <div class="home__step-content">
              <h3 class="home__step-title home__step-title--orange">Review your progress</h3>
              <p class="home__step-text">See your fasting history and current progress anytime, on any device.</p>
            </div>
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
        <a href="#" class="home__donate-button">Donate 💙</a>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';
import { onMounted, onUnmounted, ref } from 'vue';
import AddUserIcon from './components/AddUserIcon.vue';
import HomeFasting from './components/HomeFasting.vue';
import HomeFreedom from './components/HomeFreedom.vue';
import HomeFreeForEveryone from './components/HomeFreeForEveryone.vue';
import HomePrivacy from './components/HomePrivacy.vue';
import ProgressIcon from './components/ProgressIcon.vue';
import StartFastIcon from './components/StartFastIcon.vue';

const purpleSection = ref<HTMLElement | null>(null);
const orangeSection = ref<HTMLElement | null>(null);
const blueSection = ref<HTMLElement | null>(null);
const stepsSection = ref<HTMLElement | null>(null);

const purpleProgress = ref(0);
const orangeProgress = ref(0);
const blueProgress = ref(0);
const stepsVisible = ref(false);

const { stop: stopStepsObserver } = useIntersectionObserver(
  stepsSection,
  ([entry]) => {
    if (entry?.isIntersecting) {
      stepsVisible.value = true;
      stopStepsObserver();
    }
  },
  { threshold: 0.3 },
);

const calculateProgress = (element: HTMLElement | null): number => {
  if (!element) return 0;

  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight;

  // Start when element enters viewport, complete when fully visible
  const start = windowHeight;
  const end = windowHeight * 0.3;

  if (rect.top >= start) return 0;
  if (rect.top <= end) return 1;

  return (start - rect.top) / (start - end);
};

const updateProgress = () => {
  const newPurple = calculateProgress(purpleSection.value);
  const newOrange = calculateProgress(orangeSection.value);
  const newBlue = calculateProgress(blueSection.value);

  // Only update if new value is higher (keep max progress)
  if (newPurple > purpleProgress.value) purpleProgress.value = newPurple;
  if (newOrange > orangeProgress.value) orangeProgress.value = newOrange;
  if (newBlue > blueProgress.value) blueProgress.value = newBlue;
};

onMounted(() => {
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
});

onUnmounted(() => {
  window.removeEventListener('scroll', updateProgress);
});
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
    font-size: 24px;
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
      max-width: 400px;
    }
  }

  // Benefits Section
  &__benefits {
    background-color: $color-ultra-light-blue;
    text-align: center;
  }

  &__benefits-text {
    max-width: 760px;
    margin: 0 auto;
    font-size: 24px;
    line-height: 1.6;
    color: $color-info;
    font-weight: 700;
  }

  // Color modifiers
  &__feature {
    position: relative;
    width: 100%;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      transform: scaleX(var(--progress, 0));
      transform-origin: left center;
      z-index: 0;
    }

    .home__container {
      position: relative;
      z-index: 1;
    }
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
    font-size: 24px;
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
    font-size: 20px;
    color: $color-primary-button-text;

    strong {
      font-weight: 600;
    }
  }

  // Color modifiers
  &__feature--purple {
    &::before {
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.4) 57.96%, rgba(215, 149, 255, 0.4) 100.02%);
      transform-origin: right center;
    }

    .home__feature-label,
    .home__feature-text strong {
      color: $color-dark-purple;
    }
  }

  &__feature--orange {
    &::before {
      background: linear-gradient(90deg, rgba(247, 137, 96, 0.3) 0%, rgba(255, 255, 255, 0.3) 44.55%);
      transform-origin: left center;
    }

    .home__feature-label,
    .home__feature-text strong {
      color: $color-warn;
    }
  }

  &__feature--blue {
    &::before {
      background: linear-gradient(270deg, rgba(122, 189, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 41.15%);
      transform-origin: right center;
    }

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
    border-radius: 50px;
    margin: 0 auto 12px;
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
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 32px;
    margin-bottom: 48px;
  }

  &__steps-bar {
    display: none;
  }

  &__step {
    background-color: $color-white;
    border-radius: 16px;
    padding: 32px 24px;
    text-align: center;
  }

  &__step-icon {
    position: relative;
    width: 170px;
    height: 170px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 46px;

    :deep(svg) {
      position: relative;
      z-index: 1;
      width: 170px;
      height: 170px;
    }
  }

  @keyframes rotate-glow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  &__step-blur {
    position: absolute;
    width: 150px;
    height: 150px;
    border-radius: 50%;
    filter: blur(25px);
    animation: rotate-glow 15s linear infinite;
    animation-play-state: paused;
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    background: conic-gradient(
      from 90deg at 50% 50%,
      $color-purple 0deg,
      $color-blue 90deg,
      $color-green 180deg,
      $color-orange 270deg,
      $color-purple 360deg
    );

    &--active {
      animation-play-state: running;
      opacity: 1;
    }
  }

  &__step-content {
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    padding: 16px;
  }

  &__step-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 12px;
    color: $color-primary-button-text;
  }

  &__step-text {
    font-size: 16px;
    margin: 0;
    color: $color-primary-button-text;

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
    font-size: 20px;
    margin: 0 auto 24px;
    max-width: 760px;
    color: $color-primary-button-text;
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
        max-width: 400px;
      }
    }

    &__feature-image {
      margin-bottom: 0;
      flex: 0 0 50%;
      display: flex;
      justify-content: center;

      :deep(svg) {
        max-width: 400px;
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

    &__steps-bar {
      display: block;
      position: absolute;
      top: 115px;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      height: 12px;
      background-color: #e5e5e5;
      border-radius: 12px;
      z-index: 0;
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
