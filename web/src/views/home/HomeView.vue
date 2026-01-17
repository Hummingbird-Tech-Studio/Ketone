<template>
  <main class="home">
    <section class="home__hero">
      <div class="home__container home__container--hero">
        <div class="home__hero-content">
          <h1 class="home__title">Your fasting.<br />Your data.<br />Your control.</h1>
          <p class="home__subtitle">
            Fasting made simple. Privacy made real. No ads, no tracking, no AI. Just a clean fasting app. Free forever &
            <a href="https://github.com/Hummingbird-Tech-Studio/Ketone" target="_blank" rel="noopener noreferrer"
              >open source</a
            >.
          </p>
          <router-link to="/sign-in" class="home__btn home__btn--green">Start your fast now!</router-link>
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
            No AI dissecting your patterns. No business model based on your information. Our code is
            <a href="https://github.com/Hummingbird-Tech-Studio/Ketone" target="_blank" rel="noopener noreferrer"
              >open source</a
            >, your data is fully portable, and control always stays with you. Export it, delete it, or walk away at any
            time.
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

    <section class="home__features-carousel">
      <Divider class="home__features-carousel-divider" />
      <div class="home__container home__container--features-carousel">
        <div class="home__section-badge home__section-badge--purple">
          <span class="home__section-badge-text">Features</span>
        </div>
        <h2 class="home__section-title">Everything you need to track your fast</h2>
        <Carousel
          :value="features"
          :num-visible="1"
          :num-scroll="1"
          :circular="true"
          :responsive-options="carouselResponsiveOptions"
          class="home__carousel"
        >
          <template #item="{ data }">
            <div class="home__carousel-card" :class="`home__carousel-card--${data.color}`">
              <BgDesign :color="data.svgColor" class="home__carousel-card-bg" />
              <div class="home__carousel-card-content">
                <div class="home__carousel-card-text">
                  <h3 class="home__carousel-card-title">{{ data.title }}</h3>
                  <p class="home__carousel-card-description">{{ data.description }}</p>
                </div>
                <div class="home__carousel-card-image">
                  <img :src="data.image" :alt="data.alt" />
                </div>
              </div>
            </div>
          </template>
        </Carousel>
      </div>
      <Divider class="home__features-carousel-divider" />
    </section>

    <section class="home__how-it-works">
      <div class="home__container home__container--how-it-works">
        <div class="home__section-badge home__section-badge--blue">
          <span class="home__section-badge-text">How it Works</span>
        </div>
        <h2 class="home__section-title">Track your fast in 3 simple steps</h2>

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

        <router-link to="/sign-in" class="home__btn home__btn--green">Start your fast now!</router-link>
      </div>
    </section>

    <section class="home__donate">
      <div class="home__container home__container--donate">
        <h2 class="home__section-title home__section-title--tight">Software made for people, not for profit</h2>
        <p class="home__donate-text">
          We believe in free, open source software built with care and sustained by trust. Ketone exists to create tools
          that serve and respect the people who use them. The project is supported by voluntary donations, and every
          contribution helps us improve the app and invest in more open tools for everyone. Because quality software
          doesn't have to come with a price tag, it just needs people who believe in it.
        </p>
        <a href="#" class="home__btn home__btn--blue">Donate 💙</a>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import devicesImg from '@/assets/images/devices.png';
import macbookImg from '@/assets/images/macbook.png';
import mobileImg from '@/assets/images/mobile.png';
import { useIntersectionObserver } from '@vueuse/core';
import { onMounted, onUnmounted, ref } from 'vue';
import AddUserIcon from './components/AddUserIcon.vue';
import BgDesign from './components/BgDesign.vue';
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

const features = [
  {
    id: 1,
    color: 'green',
    svgColor: '#10b981',
    image: devicesImg,
    title: 'Track your fasting, simply and clearly',
    description:
      'Ketone lets you track your fasting sessions with precision and zero distractions. Just a clean view of your fasting habits, available on web, mobile, and tablet.',
    alt: 'Ketone app displayed on tablet, phone, and web browser',
  },
  {
    id: 2,
    color: 'blue',
    svgColor: '#7abdff',
    image: macbookImg,
    title: 'Understand your progress with real statistics',
    description:
      'Visualize your fasting history through meaningful statistics that help you see patterns, consistency, and progress over time.',
    alt: 'MacBook showing Ketone statistics dashboard with fasting charts',
  },
  {
    id: 3,
    color: 'purple',
    svgColor: '#d795ff',
    image: mobileImg,
    title: 'Log how you feel, not just the numbers',
    description:
      'Register your mood and add personal notes to each fast, helping you connect physical results with how you feel mentally and emotionally.',
    alt: 'Mobile phone displaying Ketone mood and notes interface',
  },
];

const carouselResponsiveOptions = [{ breakpoint: '1024px', numVisible: 1, numScroll: 1 }];

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

  &__btn {
    display: inline-block;
    padding: 14px 24px;
    border-radius: 50px;
    font-weight: 600;
    font-size: 16px;
    text-decoration: none;
    border: 1px solid;
    transition:
      background-color 0.2s,
      transform 0.2s;

    &:hover {
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }

    &--green {
      background: $color-home-cta-green-bg;
      color: $color-primary;
      border-color: $color-primary;

      &:hover {
        background-color: $color-home-cta-green-bg-hover;
      }
    }

    &--blue {
      padding: 14px 32px;
      background-color: $color-home-donate-blue-bg;
      color: $color-home-donate-blue-accent;
      border-color: $color-home-donate-blue-accent;

      &:hover {
        background-color: $color-home-donate-blue-bg-hover;
      }
    }
  }

  &__hero-image {
    margin-top: 40px;
    max-width: 100%;

    :deep(svg) {
      width: 100%;
      height: auto;
      max-width: 250px;
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
      max-width: 250px;
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

  // Features Carousel Section
  &__features-carousel {
    text-align: center;
  }

  &__container--features-carousel {
    padding-top: 64px;
    padding-bottom: 64px;
  }

  &__features-carousel-divider {
    margin: 0;
  }

  // Unified section badge
  &__section-badge {
    display: inline-flex;
    padding: 12px 40px;
    border-radius: 50px;
    margin-bottom: 16px;

    &--purple {
      background-color: $color-home-badge-purple-bg;
    }

    &--blue {
      background-color: $color-ultra-light-blue;
    }
  }

  &__section-badge-text {
    font-weight: 600;
    font-size: 20px;
  }

  &__section-badge--purple &__section-badge-text {
    color: $color-home-badge-purple-text;
  }

  &__section-badge--blue &__section-badge-text {
    color: $color-dark-blue;
  }

  &__section-title {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 48px;

    &--tight {
      margin-bottom: 24px;
    }
  }

  &__carousel {
    :deep(.p-carousel-content) {
      overflow: hidden;
    }

    :deep(.p-carousel-items-container) {
      overflow: hidden;
    }

    :deep(.p-carousel-item) {
      padding: 0 8px;
      box-sizing: border-box;
      flex-shrink: 0;
      width: 100%;
    }

    :deep(.p-carousel-prev),
    :deep(.p-carousel-next) {
      display: none;
    }

    :deep(.p-carousel-indicator-list) {
      margin-top: 24px;
      gap: 8px;
    }

    :deep(.p-carousel-indicator button) {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: $color-home-indicator-inactive;
      border: none;
    }

    :deep(.p-carousel-indicator.p-carousel-indicator-active button) {
      background-color: $color-primary;
    }
  }

  &__carousel-card {
    position: relative;
    width: 100%;
    max-width: 366px;
    min-height: 550px;
    height: auto;
    margin: 0 auto;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 20px;
      opacity: 0.5;
      z-index: 0;
    }

    &--purple::before {
      background: radial-gradient(50% 68.18% at 50% 50%, #f4e2ff 24.52%, #cf81ff 100%);
    }

    &--green::before {
      background: radial-gradient(50% 68.18% at 50% 50%, #c9ffce 27.88%, #2ecd68 100%);
    }

    &--blue::before {
      background: radial-gradient(50% 50% at 50% 50%, #d5eaff 18.75%, #7abdff 100%);
    }

    &--blue {
      border: 1px solid $color-primary-button-outline;
    }
  }

  &__carousel-card-bg {
    position: absolute;
    z-index: 1;
    width: 100%;
    height: auto;
    left: 0;
    right: 0;
    mix-blend-mode: soft-light;
    opacity: 0.4;
  }

  &__carousel-card-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    padding: 24px;
    gap: 16px;
  }

  &__carousel-card-text {
    text-align: center;
    max-width: 280px;
    order: 2;
  }

  &__carousel-card-image {
    order: 1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    overflow: hidden;
    min-height: 0;

    img {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 300px;
      object-fit: contain;
    }
  }

  // Green card (devices) mobile styles
  &__carousel-card--green &__carousel-card-content {
    justify-content: center;
    gap: 24px;
  }

  &__carousel-card--green &__carousel-card-image {
    flex: 0 0 auto;
    width: 100%;
    padding: 0 16px;

    img {
      width: 100%;
      max-width: 200px;
    }
  }

  // Blue card (macbook) mobile styles
  &__carousel-card--blue &__carousel-card-content {
    justify-content: center;
    gap: 24px;
  }

  &__carousel-card--blue &__carousel-card-image {
    flex: 0 0 auto;
    width: 100%;

    img {
      width: 100%;
      max-width: 280px;
    }
  }

  // Purple card (mobile) mobile styles
  &__carousel-card--purple &__carousel-card-content {
    justify-content: center;
    gap: 24px;
  }

  &__carousel-card--purple &__carousel-card-image {
    flex: 0 0 auto;
    width: 100%;
    padding: 0 16px;

    img {
      width: 100%;
      max-width: 140px;
    }
  }

  &__carousel-card-title {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0 0 12px;
  }

  &__carousel-card-description {
    font-size: 16px;
    color: $color-primary-button-text;
    margin: 0;
    line-height: 1.5;
  }

  // How it Works Section
  &__how-it-works {
    text-align: center;
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

  &__subtitle a,
  &__feature-text a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: rgba(0, 0, 0, 0.3);
    text-underline-offset: 2px;
    transition:
      color 0.2s,
      text-decoration-color 0.2s;

    &:hover {
      color: $color-primary;
      text-decoration-color: $color-primary;
    }
  }

  // Donate Section
  &__donate {
    text-align: center;
    background-color: $color-ultra-light-blue;
  }

  &__donate-text {
    font-size: 20px;
    margin: 0 auto 24px;
    max-width: 760px;
    color: $color-primary-button-text;
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
        max-width: 350px;
      }
    }

    &__feature-image {
      margin-bottom: 0;
      flex: 0 0 50%;
      display: flex;
      justify-content: center;

      :deep(svg) {
        max-width: 300px;
      }
    }

    &__feature-content {
      flex: 0 0 calc(50% - 60px);
      max-width: 480px;
    }

    &__feature--reversed &__feature-image {
      order: 0;
    }

    &__container--features-carousel {
      padding-top: 80px;
      padding-bottom: 80px;
    }

    &__section-title {
      font-size: 2.25rem;
    }

    &__carousel-card {
      max-width: 710px;
      min-height: 500px;
      height: auto;
    }

    &__carousel-card-content {
      flex-direction: row;
      align-items: center;
      justify-content: space-around;
      padding: 40px;
      gap: 24px;
    }

    &__carousel-card-text {
      flex: 0 0 40%;
      max-width: none;
      text-align: left;
      order: 1;
    }

    &__carousel-card-title {
      font-size: 24px;
      margin-bottom: 16px;
    }

    &__carousel-card-description {
      font-size: 16px;
    }

    &__carousel-card-image {
      flex: 0 0 60%;
      align-self: center;
      order: 2;

      img {
        max-width: 100%;
        max-height: 400px;
        object-fit: contain;
      }
    }

    // Green card desktop styles - reset mobile overrides
    &__carousel-card--green &__carousel-card-content {
      justify-content: space-around;
      gap: 24px;
    }

    &__carousel-card--green &__carousel-card-image {
      flex: 0 0 60%;

      img {
        max-width: 100%;
      }
    }

    // Blue card keeps column layout on desktop
    &__carousel-card--blue &__carousel-card-content {
      flex-direction: column;
      justify-content: center;
      gap: 24px;
    }

    &__carousel-card--blue &__carousel-card-text {
      text-align: center;
      order: 2;
      flex: 0 0 auto;
    }

    &__carousel-card--blue &__carousel-card-image {
      order: 1;
      flex: 0 0 auto;
      align-self: center;

      img {
        max-width: 100%;
      }
    }

    // Purple card desktop styles - reset mobile overrides
    &__carousel-card--purple &__carousel-card-content {
      justify-content: space-around;
      gap: 24px;
    }

    &__carousel-card--purple &__carousel-card-image {
      flex: 0 0 60%;

      img {
        max-width: 100%;
      }
    }

    &__container--how-it-works {
      padding-top: 80px;
      padding-bottom: 80px;
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
      background-color: $color-home-bar-grey;
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
  }
}
</style>
