<template>
  <div ref="containerRef" class="pull-to-refresh">
    <div
      class="pull-to-refresh__indicator"
      :class="{ 'pull-to-refresh__indicator--visible': pullDistance > 0 || isRefreshing }"
      :style="{ transform: `translateY(${indicatorOffset}px)` }"
    >
      <ProgressSpinner
        v-if="isRefreshing"
        class="pull-to-refresh__spinner"
        strokeWidth="4"
        style="width: 24px; height: 24px"
      />
      <i
        v-else-if="pullDistance > 0"
        class="pi pi-arrow-down pull-to-refresh__icon"
        :style="{ transform: `rotate(${iconRotation}deg)` }"
      />
    </div>
    <div class="pull-to-refresh__content" :style="{ transform: `translateY(${contentOffset}px)` }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { isNativePlatform } from '@/utils/platform';
import ProgressSpinner from 'primevue/progressspinner';
import { computed, onMounted, onUnmounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    threshold?: number;
    maxPull?: number;
    disabled?: boolean;
  }>(),
  {
    threshold: 80,
    maxPull: 120,
    disabled: false,
  },
);

const emit = defineEmits<{
  refresh: [];
}>();

defineExpose({
  stopRefreshing: () => {
    isRefreshing.value = false;
    pullDistance.value = 0;
  },
});

const containerRef = ref<HTMLElement | null>(null);
const pullDistance = ref(0);
const isRefreshing = ref(false);
const startY = ref(0);
const isPulling = ref(false);

const isEnabled = computed(() => !props.disabled && isNativePlatform());

const indicatorOffset = computed(() => {
  const offset = Math.min(pullDistance.value, props.maxPull) - 40;
  return Math.max(offset, -40);
});

const contentOffset = computed(() => {
  return Math.min(pullDistance.value * 0.5, props.maxPull * 0.5);
});

const iconRotation = computed(() => {
  const progress = Math.min(pullDistance.value / props.threshold, 1);
  return progress * 180;
});

function isScrolledToTop(): boolean {
  return window.scrollY <= 0;
}

function onTouchStart(event: TouchEvent) {
  if (!isEnabled.value || isRefreshing.value) return;

  if (isScrolledToTop()) {
    const touch = event.touches[0];
    if (touch) {
      startY.value = touch.clientY;
      isPulling.value = true;
    }
  }
}

function onTouchMove(event: TouchEvent) {
  if (!isEnabled.value || isRefreshing.value || !isPulling.value) return;

  const touch = event.touches[0];
  if (!touch) return;

  const currentY = touch.clientY;
  const diff = currentY - startY.value;

  if (diff > 0 && isScrolledToTop()) {
    event.preventDefault();
    pullDistance.value = Math.min(diff * 0.5, props.maxPull);
  } else {
    pullDistance.value = 0;
  }
}

function onTouchEnd() {
  if (!isEnabled.value || !isPulling.value) return;

  isPulling.value = false;

  if (pullDistance.value >= props.threshold && !isRefreshing.value) {
    isRefreshing.value = true;
    pullDistance.value = props.threshold * 0.6;
    emit('refresh');
    // Parent will call stopRefreshing() when loading completes
  } else {
    pullDistance.value = 0;
  }
}

onMounted(() => {
  if (!isEnabled.value) return;

  const el = containerRef.value;
  if (!el) return;

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
});

onUnmounted(() => {
  const el = containerRef.value;
  if (!el) return;

  el.removeEventListener('touchstart', onTouchStart);
  el.removeEventListener('touchmove', onTouchMove);
  el.removeEventListener('touchend', onTouchEnd);
});
</script>

<style scoped lang="scss">
.pull-to-refresh {
  position: relative;
  overflow: visible;

  &__indicator {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%) translateY(-40px);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 10;

    &--visible {
      opacity: 1;
    }
  }

  &__icon {
    font-size: 20px;
    color: var(--p-primary-color);
    transition: transform 0.1s ease;
  }

  &__spinner {
    color: var(--p-primary-color);
  }

  &__content {
    transition: transform 0.2s ease;
  }
}
</style>
