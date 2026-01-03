<template>
  <div ref="containerRef" class="pull-to-refresh">
    <div class="pull-to-refresh__puller-container" :style="positionCSS">
      <div
        class="pull-to-refresh__puller"
        :class="{ 'pull-to-refresh__puller--animating': animating }"
        :style="pullerStyle"
      >
        <ProgressSpinner
          v-if="state === 'refreshing'"
          class="pull-to-refresh__spinner"
          strokeWidth="4"
          style="width: 24px; height: 24px"
        />
        <i v-else class="pi pi-refresh pull-to-refresh__icon" />
      </div>
    </div>
    <div class="pull-to-refresh__content" :class="{ 'pull-to-refresh__content--no-pointer': pulling }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { isNativePlatform } from '@/utils/platform';
import ProgressSpinner from 'primevue/progressspinner';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type PullState = 'pull' | 'pulled' | 'refreshing';

const PULLER_HEIGHT = 40;
const OFFSET_TOP = 20;
const MAX_PULL_DISTANCE = 130;

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  refresh: [done: () => void];
}>();

const containerRef = ref<HTMLElement | null>(null);
const state = ref<PullState>('pull');
const pullRatio = ref(0);
const pulling = ref(false);
const pullPosition = ref(-PULLER_HEIGHT);
const animating = ref(false);
const positionCSS = ref<Record<string, string>>({});
const startY = ref(0);

let animationTimer: ReturnType<typeof setTimeout> | null = null;

const isEnabled = computed(() => !props.disabled && isNativePlatform());

const pullerStyle = computed(() => ({
  opacity: pullRatio.value,
  transform: `translateY(${pullPosition.value}px) rotate(${pullRatio.value * 360}deg)`,
}));

function getScrollPosition(): number {
  return window.scrollY;
}

function animateTo({ pos, ratio }: { pos: number; ratio?: number }, done?: () => void) {
  animating.value = true;
  pullPosition.value = pos;

  if (ratio !== undefined) {
    pullRatio.value = ratio;
  }

  if (animationTimer !== null) {
    clearTimeout(animationTimer);
  }

  animationTimer = setTimeout(() => {
    animationTimer = null;
    animating.value = false;
    done?.();
  }, 300);
}

function trigger() {
  emit('refresh', () => {
    animateTo({ pos: -PULLER_HEIGHT, ratio: 0 }, () => {
      state.value = 'pull';
    });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function onTouchStart(event: TouchEvent) {
  if (!isEnabled.value) return;

  const touch = event.touches[0];
  if (!touch) return;

  // Don't start new pull if currently refreshing or animating
  if (animating.value || state.value === 'refreshing') {
    return;
  }

  // Only start if scrolled to top and pulling down
  if (getScrollPosition() !== 0) {
    return;
  }

  pulling.value = true;
  startY.value = touch.clientY;

  // Capture position for fixed puller
  const el = containerRef.value;
  if (el) {
    const { top, left } = el.getBoundingClientRect();
    positionCSS.value = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${el.offsetWidth}px`,
    };
  }
}

function onTouchMove(event: TouchEvent) {
  if (!isEnabled.value) return;

  if (animating.value || state.value === 'refreshing') {
    return;
  }

  const touch = event.touches[0];
  if (!touch) return;

  // If not pulling yet, check if we should start
  if (!pulling.value) {
    if (getScrollPosition() !== 0) {
      return;
    }

    pulling.value = true;
    startY.value = touch.clientY;

    const el = containerRef.value;
    if (el) {
      const { top, left } = el.getBoundingClientRect();
      positionCSS.value = {
        top: `${top}px`,
        left: `${left}px`,
        width: `${el.offsetWidth}px`,
      };
    }
  }

  const currentY = touch.clientY;
  const diff = currentY - startY.value;

  // Only process downward pulls when at top
  if (diff <= 0 || getScrollPosition() !== 0) {
    if (pulling.value) {
      pulling.value = false;
      state.value = 'pull';
      animateTo({ pos: -PULLER_HEIGHT, ratio: 0 });
    }
    return;
  }

  event.preventDefault();

  const distance = clamp(diff, 0, MAX_PULL_DISTANCE);
  pullPosition.value = distance - PULLER_HEIGHT;
  pullRatio.value = clamp(distance / (OFFSET_TOP + PULLER_HEIGHT), 0, 1);

  const newState: PullState = pullPosition.value > OFFSET_TOP ? 'pulled' : 'pull';
  if (state.value !== newState) {
    state.value = newState;
  }
}

function onTouchEnd() {
  if (!isEnabled.value) return;

  if (pulling.value) {
    pulling.value = false;

    if (state.value === 'pulled') {
      state.value = 'refreshing';
      animateTo({ pos: OFFSET_TOP });
      trigger();
    } else if (state.value === 'pull') {
      animateTo({ pos: -PULLER_HEIGHT, ratio: 0 });
    }
  }
}

// Expose trigger and a way to manually update scroll target if needed
defineExpose({
  trigger,
});

onMounted(() => {
  if (!isEnabled.value) return;

  const el = containerRef.value;
  if (!el) return;

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
});

onBeforeUnmount(() => {
  if (animationTimer !== null) {
    clearTimeout(animationTimer);
  }

  const el = containerRef.value;
  if (!el) return;

  el.removeEventListener('touchstart', onTouchStart);
  el.removeEventListener('touchmove', onTouchMove);
  el.removeEventListener('touchend', onTouchEnd);
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.pull-to-refresh {
  position: relative;

  &__puller-container {
    position: fixed;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1000;
  }

  &__puller {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    color: var(--p-primary-color);
    background: var(--p-surface-0);
    box-shadow: 0 0 4px 0 rgba(0, 0, 0, 0.3);

    &--animating {
      transition:
        transform 0.3s,
        opacity 0.3s;
    }
  }

  &__icon {
    font-size: 20px;
  }

  &__spinner {
    width: 24px;
    height: 24px;

    :deep(.p-progressspinner-circle) {
      stroke: $color-dark-purple !important;
      animation: p-progressspinner-dash 1.5s ease-in-out infinite !important;
    }
  }

  &__content {
    &--no-pointer {
      pointer-events: none;
    }
  }
}
</style>
