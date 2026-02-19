<template>
  <div class="template-period-editor">
    <div v-for="(period, index) in periods" :key="index" class="template-period-editor__card">
      <div class="template-period-editor__card-header">
        <span class="template-period-editor__period-label">Period {{ index + 1 }}</span>
        <span class="template-period-editor__total-label">{{
          formatDuration(period.fastingDuration + period.eatingWindow)
        }}</span>
      </div>

      <div
        ref="barRefs"
        class="template-period-editor__bar"
        :class="{ 'template-period-editor__bar--dragging': drag !== null && drag.periodIndex === index }"
        @pointerdown.prevent="onBarPointerDown($event, index)"
      >
        <div
          class="template-period-editor__segment template-period-editor__segment--fasting"
          :style="{ width: fastingPercent(period) + '%' }"
        >
          <div
            class="template-period-editor__handle template-period-editor__handle--boundary"
            :class="{ 'template-period-editor__handle--active': isDraggingHandle(index, 'boundary') }"
          />
        </div>
        <div
          class="template-period-editor__segment template-period-editor__segment--eating"
          :style="{ width: eatingPercent(period) + '%' }"
        >
          <div
            class="template-period-editor__handle template-period-editor__handle--edge"
            :class="{ 'template-period-editor__handle--active': isDraggingHandle(index, 'edge') }"
          />
        </div>
      </div>

      <div class="template-period-editor__controls">
        <DurationControl
          label="Fasting"
          :value="period.fastingDuration"
          :min="MIN_FASTING_DURATION_HOURS"
          :max="MAX_FASTING_DURATION_HOURS"
          :disabled="disabled"
          @update:value="updateFasting(index, $event)"
        />
        <DurationControl
          label="Eating"
          :value="period.eatingWindow"
          :min="MIN_EATING_WINDOW_HOURS"
          :max="MAX_EATING_WINDOW_HOURS"
          :disabled="disabled"
          @update:value="updateEating(index, $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDuration } from '@/components/Timeline';
import {
  DURATION_STEP_HOURS,
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
} from '@/views/plan/domain';
import { onUnmounted, ref } from 'vue';
import type { PeriodDuration } from '../composables/useTemplateApplyForm';
import DurationControl from './DurationControl.vue';

const props = withDefaults(
  defineProps<{
    periods: PeriodDuration[];
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: 'update:periods', value: PeriodDuration[]): void;
}>();

// Bar percentages
const fastingPercent = (p: PeriodDuration) => (p.fastingDuration / (p.fastingDuration + p.eatingWindow)) * 100;
const eatingPercent = (p: PeriodDuration) => (p.eatingWindow / (p.fastingDuration + p.eatingWindow)) * 100;

// Duration control updates (button +/-)
const emitUpdate = (index: number, fasting: number, eating: number) => {
  const updated = props.periods.map((p, i) =>
    i === index ? { fastingDuration: fasting, eatingWindow: eating } : { ...p },
  );
  emit('update:periods', updated);
};

const updateFasting = (index: number, value: number) => {
  const period = props.periods[index];
  if (!period) return;
  emitUpdate(index, value, period.eatingWindow);
};

const updateEating = (index: number, value: number) => {
  const period = props.periods[index];
  if (!period) return;
  emitUpdate(index, period.fastingDuration, value);
};

// Drag state
const barRefs = ref<HTMLElement[]>([]);

interface DragInfo {
  periodIndex: number;
  handleType: 'boundary' | 'edge';
  startX: number;
  originalFasting: number;
  originalEating: number;
  barWidth: number;
}

const drag = ref<DragInfo | null>(null);

const isDraggingHandle = (index: number, type: 'boundary' | 'edge') =>
  drag.value !== null && drag.value.periodIndex === index && drag.value.handleType === type;

// Drag: pointer event handlers
const snapFactor = 1 / DURATION_STEP_HOURS;
const snap = (v: number) => Math.round(v * snapFactor) / snapFactor;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const onBarPointerDown = (event: PointerEvent, periodIndex: number) => {
  if (props.disabled) return;

  const target = event.target as HTMLElement;
  const handle = target.closest('.template-period-editor__handle') as HTMLElement | null;
  if (!handle) return;

  const handleType = handle.classList.contains('template-period-editor__handle--boundary') ? 'boundary' : 'edge';

  const barEl = barRefs.value[periodIndex];
  if (!barEl) return;

  const period = props.periods[periodIndex];
  if (!period) return;

  drag.value = {
    periodIndex,
    handleType,
    startX: event.clientX,
    originalFasting: period.fastingDuration,
    originalEating: period.eatingWindow,
    barWidth: barEl.clientWidth,
  };

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
};

const onPointerMove = (event: PointerEvent) => {
  const d = drag.value;
  if (!d) return;

  const totalHours = d.originalFasting + d.originalEating;
  const hoursPerPixel = totalHours / d.barWidth;
  const rawDelta = (event.clientX - d.startX) * hoursPerPixel;
  const delta = snap(rawDelta);

  if (d.handleType === 'boundary') {
    // Boundary drag: move boundary between fasting and eating.
    // Primarily trades fasting <-> eating (total stays constant),
    // but when one side hits its limit the other keeps moving (total changes).
    const newFasting = clamp(snap(d.originalFasting + delta), MIN_FASTING_DURATION_HOURS, MAX_FASTING_DURATION_HOURS);
    const newEating = clamp(snap(d.originalEating - delta), MIN_EATING_WINDOW_HOURS, MAX_EATING_WINDOW_HOURS);
    emitUpdate(d.periodIndex, newFasting, newEating);
  } else {
    // Right-edge drag: adjust eating only (total changes)
    const newEating = clamp(snap(d.originalEating + delta), MIN_EATING_WINDOW_HOURS, MAX_EATING_WINDOW_HOURS);
    emitUpdate(d.periodIndex, d.originalFasting, newEating);
  }
};

const onPointerUp = () => {
  drag.value = null;
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

onUnmounted(() => {
  // Cleanup in case component unmounts during drag
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.template-period-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    background: $color-white;
  }

  &__card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__period-label {
    font-size: 14px;
    font-weight: 600;
    color: $color-primary-button-text;
  }

  &__total-label {
    font-size: 13px;
    font-weight: 500;
    color: $color-primary-light-text;
  }

  &__bar {
    display: flex;
    height: 32px;
    border-radius: 8px;
    overflow: hidden;
    touch-action: none;
  }

  &__segment {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    transition: width 0.15s ease;

    .template-period-editor__bar--dragging & {
      transition: none;
    }

    &--fasting {
      background: $color-fasting-planned;
    }

    &--eating {
      background: $color-eating;
    }
  }

  &__handle {
    position: absolute;
    top: 0;
    width: 12px;
    height: 100%;
    cursor: col-resize;
    z-index: 1;

    &--boundary {
      right: -6px;
    }

    &--edge {
      right: 0;
    }

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 4px;
      height: 16px;
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.15);
      transition: background 0.15s ease;
    }

    &:hover::after,
    &--active::after {
      background: rgba(0, 0, 0, 0.35);
    }
  }

  &__controls {
    display: flex;
    justify-content: space-around;
    gap: 16px;
  }
}
</style>
