<template>
  <div class="time-picker">
    <div class="time-picker__display">
      <button
        class="time-picker__display-item"
        :class="{ 'time-picker__display-item--active': mode === 'hours' }"
        type="button"
        @click="mode = 'hours'"
      >
        {{ formatNumber(selectedTime.hours) }}
      </button>

      <span class="time-picker__separator">:</span>

      <button
        class="time-picker__display-item"
        :class="{ 'time-picker__display-item--active': mode === 'minutes' }"
        type="button"
        @click="mode = 'minutes'"
      >
        {{ formatNumber(selectedTime.minutes) }}
      </button>

      <div class="time-picker__meridian">
        <button
          class="time-picker__meridian-btn time-picker__meridian-btn--top"
          :class="{ 'time-picker__meridian-btn--active': selectedTime.period === 'AM' }"
          type="button"
          @click="handleMeridianToggle('AM')"
        >
          AM
        </button>
        <button
          class="time-picker__meridian-btn time-picker__meridian-btn--bottom"
          :class="{ 'time-picker__meridian-btn--active': selectedTime.period === 'PM' }"
          type="button"
          @click="handleMeridianToggle('PM')"
        >
          PM
        </button>
      </div>
    </div>

    <div
      ref="clockRef"
      class="time-picker__clock"
      :class="{ 'time-picker__clock--dragging': isDragging }"
      @pointerdown="handlePointerDown"
    >
      <div class="time-picker__clock-face">
        <div class="time-picker__clock-hand" :style="{ '--angle': handAngle + 'deg', '--hand-length': handLength }">
          <div
            class="time-picker__clock-hand-dot"
            :class="{ 'time-picker__clock-hand-dot--hidden': isHandDotHidden }"
          />
        </div>
        <div class="time-picker__clock-center" />

        <!-- Hours mode -->
        <template v-if="mode === 'hours'">
          <button
            v-for="(num, idx) in hoursNumbers"
            :key="num"
            type="button"
            class="time-picker__clock-number"
            :class="{ 'time-picker__clock-number--selected': num === selectedTime.hours }"
            :style="numberStyle(idx, 12, 120, 20)"
            @click="handleNumberClick(num)"
          >
            {{ num }}
          </button>
        </template>

        <!-- Minutes mode -->
        <template v-else>
          <button
            v-for="num in minuteLabels"
            :key="'m-label-' + num"
            type="button"
            class="time-picker__clock-number"
            :class="{ 'time-picker__clock-number--selected': num === selectedTime.minutes }"
            :style="minuteNumberStyle(num)"
            @click="handleNumberClick(num)"
          >
            {{ formatNumber(num) }}
          </button>

          <!-- small dots for the rest -->
          <button
            v-for="m in minuteDots"
            :key="'m-dot-' + m"
            type="button"
            class="time-picker__minute-dot"
            :class="{ 'time-picker__minute-dot--selected': m === selectedTime.minutes }"
            :style="minuteDotStyle(m)"
            @click="handleNumberClick(m)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Meridian, TimeValue } from '@/shared/types/time';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

interface Props {
  initialTime?: TimeValue;
}

const props = withDefaults(defineProps<Props>(), {
  initialTime: () => ({ hours: 12, minutes: 0, period: 'AM' as Meridian }),
});

const emit = defineEmits<{
  (e: 'change', time: TimeValue): void;
}>();

const selectedTime = ref<TimeValue>({ ...props.initialTime });
const mode = ref<'hours' | 'minutes'>('hours');
const isDragging = ref(false);
const clockRef = ref<HTMLDivElement | null>(null);

const hoursNumbers = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));
const minuteLabels = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const minuteDots = Array.from({ length: 60 }, (_, i) => i).filter((m) => !minuteLabels.includes(m));

const isHandDotHidden = computed(() => {
  if (mode.value === 'hours') return true;
  return selectedTime.value.minutes % 5 === 0;
});

// Extend hand to reach the selected minute target
const handLength = computed(() => {
  if (mode.value === 'minutes') {
    // Reach label at radius 120 for multiples of 5, otherwise small dot at radius 130
    return (selectedTime.value.minutes % 5 === 0 ? 120 : 130) + 'px';
  }
  // Default for hours
  return '100px';
});

/* utils */
const formatNumber = (num: number) => num.toString().padStart(2, '0');

const getAngleFromPoint = (cx: number, cy: number, px: number, py: number): number => {
  const angle = Math.atan2(py - cy, px - cx);
  let deg = (angle * 180) / Math.PI + 90; // 0° at 12 o'clock
  if (deg < 0) deg += 360;
  return deg;
};

const handleTimeChange = (t: TimeValue) => {
  selectedTime.value = t;
  emit('change', t);
};

/* pointer logic */
const onGlobalMove = (e: PointerEvent) => handlePointerMove(e);
const onGlobalUp = () => (isDragging.value = false);

const handlePointerDown = (e: PointerEvent) => {
  isDragging.value = true;
  handlePointerMove(e);
};

const handlePointerMove = (e: PointerEvent) => {
  const host = clockRef.value;
  if (!host) return;

  const rect = host.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const { clientX, clientY } = e;

  const angle = getAngleFromPoint(centerX, centerY, clientX, clientY);

  if (mode.value === 'hours') {
    const hour = Math.round(angle / 30) % 12;
    const finalHour = hour === 0 ? 12 : hour;
    handleTimeChange({ ...selectedTime.value, hours: finalHour });
  } else {
    const minute = Math.round(angle / 6) % 60;
    handleTimeChange({ ...selectedTime.value, minutes: minute });
  }
};

watch(isDragging, (drag) => {
  if (drag) {
    document.addEventListener('pointermove', onGlobalMove, { passive: true });
    document.addEventListener('pointerup', onGlobalUp, { passive: true });
    document.addEventListener('pointercancel', onGlobalUp, { passive: true });
  } else {
    document.removeEventListener('pointermove', onGlobalMove);
    document.removeEventListener('pointerup', onGlobalUp);
    document.removeEventListener('pointercancel', onGlobalUp);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onGlobalMove);
  document.removeEventListener('pointerup', onGlobalUp);
  document.removeEventListener('pointercancel', onGlobalUp);
});

const handleNumberClick = (value: number) => {
  if (mode.value === 'hours') {
    const hours = value === 0 ? 12 : value;
    handleTimeChange({ ...selectedTime.value, hours });
  } else {
    handleTimeChange({ ...selectedTime.value, minutes: value });
  }
};

const handleMeridianToggle = (meridian: Meridian) => {
  handleTimeChange({ ...selectedTime.value, period: meridian });
};

/* hand angle */
const handAngle = computed(() => {
  if (mode.value === 'hours') {
    // 12 => 0deg, 1 => 30deg, ...
    return selectedTime.value.hours % 12 === 0 ? 0 : selectedTime.value.hours * 30;
  }
  return selectedTime.value.minutes * 6; // 0..354
});

/* positioning helpers */
const polarToXY = (angleDeg: number, radius: number, cx = 150, cy = 150) => {
  const rad = (angleDeg * Math.PI) / 180;
  const x = Math.cos(rad) * radius + cx;
  const y = Math.sin(rad) * radius + cy;
  return { x, y };
};

/** Hours: index 0..11 -> angles (i*30 - 90), radius 120, center 150 */
const numberStyle = (index: number, total: number, radius: number, half: number) => {
  const angle = index * (360 / total) - 90;
  const { x, y } = polarToXY(angle, radius);
  return {
    left: `${x - half}px`,
    top: `${y - half}px`,
  };
};

const minuteNumberStyle = (num: number) => {
  const angle = num * 6 - 90;
  const { x, y } = polarToXY(angle, 120);
  return { left: `${x - 20}px`, top: `${y - 20}px` };
};

const minuteDotStyle = (m: number) => {
  const angle = m * 6 - 90;
  const { x, y } = polarToXY(angle, 130);
  return { left: `${x - 3}px`, top: `${y - 3}px` };
};
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.time-picker {
  // scale the component down and adjust the container
  transform: scale(0.8);
  max-width: 262.4px; // 328px * 0.8
  margin: -30px auto;

  --tp-purple-background: #e8d1fa;
  --tp-fg: #333;
  --tp-fg-muted: #666;
  --tp-bg: #f0f0f0;
  --tp-chip: #e5e5e5;
  --tp-border: #ddd;

  display: flex;
  flex-direction: column;
  align-items: center;

  &__display {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 30px;
  }

  &__display-item {
    background: var(--tp-chip);
    border: none;
    border-radius: 4px;
    padding: 16px 20px;
    font-size: 48px;
    font-weight: 300;
    color: var(--tp-fg);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 80px;
    text-align: center;
    /* use tabular numbers so each digit has the same width */
    font-variant-numeric: tabular-nums;
    font-feature-settings:
      'tnum' 1,
      'lnum' 1;

    &--active {
      background: var(--tp-purple-background);
      color: $color-dark-purple;
    }
  }

  &__separator {
    font-size: 48px;
    font-weight: 300;
    color: var(--tp-fg);
    margin: 0 8px;
  }

  &__meridian {
    display: flex;
    flex-direction: column;
    margin-left: 16px;
  }

  &__meridian-btn {
    background: #f5f5f5;
    border: 1px solid var(--tp-border);
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--tp-fg-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 50px;

    &--top {
      border-radius: 4px 4px 0 0;
    }
    &--bottom {
      border-radius: 0 0 4px 4px;
    }
    &--active {
      background: var(--tp-purple-background);
      color: $color-dark-purple;
      border-color: $color-dark-purple;
    }
  }

  &__clock {
    width: 300px;
    height: 300px;
    position: relative;
    cursor: grab;
    touch-action: none; // allow smooth pointer events on mobile

    &--dragging {
      cursor: grabbing;
    }
  }

  &__clock-face {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--tp-bg);
    position: relative;
    user-select: none;
  }

  &__clock-center {
    width: 12px;
    height: 12px;
    background: $color-dark-purple;
    border-radius: 50%;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 4; // ensure center above labels and hand
  }

  &__clock-hand {
    position: absolute;
    width: 2px;
    height: var(--hand-length, 100px);
    background: $color-dark-purple;
    left: 50%;
    top: 50%;
    transform-origin: 50% 100%;
    transform: translate(-50%, -100%) rotate(var(--angle));
    z-index: 2;
    transition: transform 0.2s ease;

    .time-picker__clock--dragging & {
      transition: none;
    }
  }

  &__clock-hand-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fff;
    border: 2px solid $color-dark-purple;
    border-radius: 50%;
    left: 50%;
    top: -4px;
    transform: translateX(-50%);

    &--hidden {
      display: none;
    }
  }

  &__clock-number {
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 500;
    color: var(--tp-fg);
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 3; // above hand and minute dots

    &--selected {
      background: $color-dark-purple;
      color: #fff;
    }
  }

  &__minute-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background: #ccc;
    border: none;
    padding: 0;
    line-height: 0;
    box-sizing: content-box;
    display: block;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 0; // below 5-minute label circles

    &--selected {
      background: $color-purple;
      transform: scale(1.3);
    }
  }

  /* Apply hover effects only on hover-capable (non-touch) devices */
  @media (hover: hover) and (pointer: fine) {
    &__clock-number {
      &:hover {
        background: #e0e0e0;
      }
      &--selected:hover {
        background: $color-dark-purple;
      }
    }
    &__minute-dot {
      &:hover {
        background: #999;
        transform: scale(1.2);
      }
    }
  }
}
</style>
