<template>
  <div class="plan-timeline">
    <div class="plan-timeline__header">
      <h3 class="plan-timeline__title">Timeline</h3>
    </div>

    <div class="plan-timeline__chart">
      <div class="plan-timeline__hours">
        <span class="plan-timeline__hour">12AM</span>
        <span class="plan-timeline__hour">6AM</span>
        <span class="plan-timeline__hour">12PM</span>
        <span class="plan-timeline__hour">6PM</span>
      </div>

      <div class="plan-timeline__days">
        <div v-for="day in timelineData" :key="day.date" class="plan-timeline__day">
          <div class="plan-timeline__day-label">
            <span class="plan-timeline__day-name">{{ day.dayName }}</span>
            <span class="plan-timeline__day-number">{{ day.dayNumber }}</span>
          </div>
          <div class="plan-timeline__day-bars">
            <div
              v-for="(bar, index) in day.bars"
              :key="index"
              class="plan-timeline__bar"
              :class="`plan-timeline__bar--${bar.type}`"
              :style="{ left: `${bar.startPercent}%`, width: `${bar.widthPercent}%` }"
            >
              <span v-if="bar.duration" class="plan-timeline__bar-label">{{ bar.duration }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="plan-timeline__legend">
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--fasting"></span>
        <span class="plan-timeline__legend-text">Planned fast</span>
      </div>
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--eating"></span>
        <span class="plan-timeline__legend-text">Eating Window</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type BarType = 'fasting' | 'eating';

type Bar = {
  type: BarType;
  startPercent: number;
  widthPercent: number;
  duration: string;
};

type DayData = {
  date: string;
  dayName: string;
  dayNumber: number;
  bars: Bar[];
};

const props = defineProps<{
  fastingDuration: number;
  eatingWindow: number;
  startDate: Date;
  days: number;
}>();

const timelineData = computed<DayData[]>(() => {
  const result: DayData[] = [];
  const cycleLength = props.fastingDuration + props.eatingWindow;
  const startTime = new Date(props.startDate);

  // Generate data for each day
  for (let i = 0; i < props.days; i++) {
    const currentDate = new Date(startTime);
    currentDate.setDate(startTime.getDate() + i);

    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const bars: Bar[] = [];

    // Calculate all periods that overlap with this day
    let periodStart = new Date(startTime);

    // Find the first period that could overlap with this day
    while (periodStart < dayEnd) {
      const fastingEnd = new Date(periodStart);
      fastingEnd.setHours(fastingEnd.getHours() + props.fastingDuration);

      const eatingEnd = new Date(fastingEnd);
      if (props.eatingWindow > 0) {
        eatingEnd.setHours(eatingEnd.getHours() + props.eatingWindow);
      }

      // Check if fasting period overlaps with this day
      if (periodStart < dayEnd && fastingEnd > dayStart) {
        const barStart = Math.max(periodStart.getTime(), dayStart.getTime());
        const barEnd = Math.min(fastingEnd.getTime(), dayEnd.getTime());

        const startHour = (barStart - dayStart.getTime()) / (1000 * 60 * 60);
        const endHour = (barEnd - dayStart.getTime()) / (1000 * 60 * 60);
        const durationHours = Math.round(endHour - startHour);

        if (durationHours > 0) {
          bars.push({
            type: 'fasting',
            startPercent: (startHour / 24) * 100,
            widthPercent: ((endHour - startHour) / 24) * 100,
            duration: `${durationHours}h`,
          });
        }
      }

      // Check if eating period overlaps with this day
      if (props.eatingWindow > 0 && fastingEnd < dayEnd && eatingEnd > dayStart) {
        const barStart = Math.max(fastingEnd.getTime(), dayStart.getTime());
        const barEnd = Math.min(eatingEnd.getTime(), dayEnd.getTime());

        const startHour = (barStart - dayStart.getTime()) / (1000 * 60 * 60);
        const endHour = (barEnd - dayStart.getTime()) / (1000 * 60 * 60);
        const durationHours = Math.round(endHour - startHour);

        if (durationHours > 0) {
          bars.push({
            type: 'eating',
            startPercent: (startHour / 24) * 100,
            widthPercent: ((endHour - startHour) / 24) * 100,
            duration: `${durationHours}h`,
          });
        }
      }

      // Move to next cycle
      periodStart = new Date(eatingEnd);

      // If eating window is 0, just advance by fasting duration
      if (props.eatingWindow === 0) {
        periodStart = new Date(fastingEnd);
      }

      // Safety check to avoid infinite loop
      if (cycleLength === 0) break;
    }

    result.push({
      date: currentDate.toISOString(),
      dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: currentDate.getDate(),
      bars,
    });
  }

  return result;
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$color-fasting: #5b9bd5;
$color-eating: #f4b183;

.plan-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: $color-white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__hours {
    display: flex;
    padding-left: 50px;
    margin-bottom: 4px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      padding-left: 60px;
    }
  }

  &__hour {
    flex: 1;
    font-size: 11px;
    color: $color-primary-light-text;
    text-align: left;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      font-size: 12px;
    }
  }

  &__days {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__day {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      height: 36px;
    }
  }

  &__day-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 42px;
    flex-shrink: 0;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      width: 52px;
    }
  }

  &__day-name {
    font-size: 11px;
    font-weight: 500;
    color: $color-primary-light-text;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      font-size: 12px;
    }
  }

  &__day-number {
    font-size: 13px;
    font-weight: 600;
    color: $color-primary-button-text;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      font-size: 14px;
    }
  }

  &__day-bars {
    position: relative;
    flex: 1;
    height: 100%;
    background: rgba($color-primary-button-outline, 0.3);
    border-radius: 6px;
    overflow: hidden;
  }

  &__bar {
    position: absolute;
    top: 2px;
    bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    min-width: 20px;

    &--fasting {
      background: $color-fasting;
    }

    &--eating {
      background: $color-eating;
    }
  }

  &__bar-label {
    font-size: 10px;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      font-size: 11px;
    }
  }

  &__legend {
    display: flex;
    gap: 24px;
    padding-top: 8px;
  }

  &__legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__legend-color {
    width: 12px;
    height: 12px;
    border-radius: 3px;

    &--fasting {
      background: $color-fasting;
    }

    &--eating {
      background: $color-eating;
    }
  }

  &__legend-text {
    font-size: 12px;
    color: $color-primary-light-text;
  }
}
</style>
