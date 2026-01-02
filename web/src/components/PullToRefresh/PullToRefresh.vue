<template>
  <div ref="containerRef" class="pull-to-refresh">
    <div class="pull-to-refresh__puller-container" :style="positionCSS">
      <div
        class="pull-to-refresh__puller"
        :class="{ 'pull-to-refresh__puller--animating': isAnimating }"
        :style="pullerStyle"
      >
        <ProgressSpinner
          v-if="showSpinner"
          class="pull-to-refresh__spinner"
          strokeWidth="4"
          style="width: 24px; height: 24px"
        />
        <i v-else class="pi pi-refresh pull-to-refresh__icon" />
      </div>
    </div>
    <div class="pull-to-refresh__content" :class="{ 'pull-to-refresh__content--no-pointer': isTracking }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { isNativePlatform } from '@/utils/platform';
import { useActorRef, useSelector } from '@xstate/vue';
import ProgressSpinner from 'primevue/progressspinner';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Emit, Event, pullToRefreshMachine, State } from './actors/pullToRefresh.actor';

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
const isEnabled = computed(() => !props.disabled && isNativePlatform());

const actorRef = useActorRef(pullToRefreshMachine);

// Selectors
const showSpinner = useSelector(actorRef, (s) => s.context.showSpinner);
const isAnimating = useSelector(actorRef, (s) => s.matches(State.AnimatingBack));
const isTracking = useSelector(actorRef, (s) => s.matches(State.Tracking));
const pullPosition = useSelector(actorRef, (s) => s.context.pullPosition);
const pullRatio = useSelector(actorRef, (s) => s.context.pullRatio);
const positionCSS = useSelector(actorRef, (s) => s.context.positionCSS);

const pullerStyle = computed(() => ({
  opacity: pullRatio.value,
  transform: `translateY(${pullPosition.value}px) rotate(${pullRatio.value * 360}deg)`,
}));

// Listen for REFRESH emit from the machine
actorRef.on(Emit.REFRESH, () => {
  emit('refresh', () => {
    actorRef.send({ type: Event.REFRESH_DONE });
  });
});

function onTouchStart(event: TouchEvent) {
  if (!isEnabled.value) return;

  const touch = event.touches[0];
  if (!touch) return;

  const el = containerRef.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();

  actorRef.send({
    type: Event.TOUCH_START,
    clientY: touch.clientY,
    containerRect: {
      top: rect.top,
      left: rect.left,
      width: el.offsetWidth,
    },
  });
}

function onTouchMove(event: TouchEvent) {
  if (!isEnabled.value) return;

  const touch = event.touches[0];
  if (!touch) return;

  // Prevent default scrolling when tracking
  if (isTracking.value) {
    event.preventDefault();
  }

  actorRef.send({
    type: Event.TOUCH_MOVE,
    clientY: touch.clientY,
  });
}

function onTouchEnd() {
  if (!isEnabled.value) return;

  actorRef.send({ type: Event.TOUCH_END });
}

// Expose trigger for external use
function trigger() {
  emit('refresh', () => {
    actorRef.send({ type: Event.REFRESH_DONE });
  });
}

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
  }

  &__content {
    &--no-pointer {
      pointer-events: none;
    }
  }
}
</style>
