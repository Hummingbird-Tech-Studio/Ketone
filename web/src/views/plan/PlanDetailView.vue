<template>
  <div class="plan-detail">
    <div class="plan-detail__header">
      <div class="plan-detail__back">
        <Button icon="pi pi-chevron-left" label="Plans" variant="text" severity="secondary" @click="handleBack" />
      </div>
      <h1 class="plan-detail__title">Settings</h1>
    </div>

    <div class="plan-detail__content">
      <div class="plan-detail__cards">
        <PlanSettingsCard v-model:name="planName" v-model:description="planDescription" />
        <PlanConfigCard
          :ratio="currentPreset.ratio"
          v-model:fasting-duration="baseFastingDuration"
          v-model:eating-window="baseEatingWindow"
          v-model:start-date="startDate"
        />
      </div>

      <PlanTimeline
        :period-configs="periodConfigs"
        @update:period-configs="handlePeriodConfigsUpdate"
        @delete-period="handleDeletePeriod"
      />
    </div>

    <div class="plan-detail__footer">
      <Button label="Reset" severity="secondary" variant="outlined" @click="handleReset" />
      <div class="plan-detail__footer-right">
        <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
        <Button label="Start Plan" @click="handleStartPlan" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanConfigCard from './components/PlanConfigCard.vue';
import PlanSettingsCard from './components/PlanSettingsCard.vue';
import PlanTimeline from './components/PlanTimeline/PlanTimeline.vue';
import type { PeriodConfig } from './components/PlanTimeline/types';
import { DEFAULT_PERIODS_TO_SHOW, DEFAULT_START_OFFSET_MINUTES, MAX_PERIODS, MIN_PERIODS } from './constants';
import { findPresetById, getDefaultCustomPreset } from './presets';

const route = useRoute();
const router = useRouter();

const presetId = computed(() => route.params.presetId as string);
const currentPreset = computed(() => {
  if (presetId.value === 'custom') {
    return getDefaultCustomPreset();
  }
  return findPresetById(presetId.value) ?? getDefaultCustomPreset();
});

const getDefaultStartDate = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + DEFAULT_START_OFFSET_MINUTES);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
};

// Read initial values from query params (with fallback to preset defaults)
const initialFastingDuration = computed(() => {
  const param = route.query.fastingDuration;
  if (param && !Array.isArray(param)) {
    const parsed = parseInt(param, 10);
    if (!isNaN(parsed)) return parsed;
  }

  return currentPreset.value.fastingDuration;
});

const initialEatingWindow = computed(() => {
  const param = route.query.eatingWindow;
  if (param && !Array.isArray(param)) {
    const parsed = parseInt(param, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return currentPreset.value.eatingWindow;
});

const initialPeriods = computed(() => {
  const param = route.query.periods;
  if (param && !Array.isArray(param)) {
    const parsed = parseInt(param, 10);
    if (!isNaN(parsed) && parsed >= MIN_PERIODS && parsed <= MAX_PERIODS) return parsed;
  }
  return DEFAULT_PERIODS_TO_SHOW;
});

const initialStartDate = computed(() => {
  const param = route.query.startDate;
  if (param && !Array.isArray(param)) {
    const parsed = new Date(param);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return getDefaultStartDate();
});

// Base settings for new periods (from PlanConfigCard)
const planName = ref(currentPreset.value.ratio);
const planDescription = ref('');
const baseFastingDuration = ref(initialFastingDuration.value);
const baseEatingWindow = ref(initialEatingWindow.value);

const startDate = ref(initialStartDate.value);

// Initialize period configs with fixed start times
const createInitialPeriodConfigs = (
  numPeriods: number,
  firstStartTime: Date,
  fastingDuration: number,
  eatingWindow: number,
): PeriodConfig[] => {
  const configs: PeriodConfig[] = [];
  let currentStartTime = new Date(firstStartTime);

  for (let i = 0; i < numPeriods; i++) {
    configs.push({
      startTime: new Date(currentStartTime),
      fastingDuration,
      eatingWindow,
      deleted: false,
    });

    // Calculate next period's start time (end of current period)
    const periodDuration = fastingDuration + eatingWindow;
    currentStartTime = new Date(currentStartTime.getTime() + periodDuration * 60 * 60 * 1000);
  }

  return configs;
};

const periodConfigs = ref<PeriodConfig[]>(
  createInitialPeriodConfigs(
    initialPeriods.value,
    startDate.value,
    initialFastingDuration.value,
    initialEatingWindow.value,
  ),
);

// When start date changes, reinitialize all periods with new start times
// This keeps the same durations but shifts all periods
watch(startDate, (newStartDate) => {
  const configs: PeriodConfig[] = [];
  let currentStartTime = new Date(newStartDate);

  for (const config of periodConfigs.value) {
    configs.push({
      ...config,
      startTime: new Date(currentStartTime),
    });

    // Calculate next period's start time based on current config's duration
    const periodDuration = config.fastingDuration + config.eatingWindow;
    currentStartTime = new Date(currentStartTime.getTime() + periodDuration * 60 * 60 * 1000);
  }

  periodConfigs.value = configs;
});

// When base settings change from PlanConfigCard, only apply to periods that haven't been edited
// For simplicity, we'll skip this behavior - periods are now independent once created
// The PlanConfigCard only affects newly created periods or reset

const handlePeriodConfigsUpdate = (newConfigs: PeriodConfig[]) => {
  periodConfigs.value = newConfigs;
};

const handleReset = () => {
  planName.value = currentPreset.value.ratio;
  planDescription.value = '';
  baseFastingDuration.value = initialFastingDuration.value;
  baseEatingWindow.value = initialEatingWindow.value;
  startDate.value = initialStartDate.value;
  periodConfigs.value = createInitialPeriodConfigs(
    initialPeriods.value,
    initialStartDate.value,
    initialFastingDuration.value,
    initialEatingWindow.value,
  );
};

const handleBack = () => {
  router.push('/plans');
};

const handleCancel = () => {
  router.push('/plans');
};

const handleStartPlan = () => {
  // TODO: Create plan via API
  console.log('Start plan:', {
    name: planName.value,
    description: planDescription.value,
    periodConfigs: periodConfigs.value,
  });
};

const handleDeletePeriod = (periodIndex: number) => {
  console.log('Delete period:', periodIndex);
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-detail {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 312px;
  margin: auto;
  gap: 24px;
  padding-bottom: 24px;

  @media only screen and (min-width: $breakpoint-tablet-min-width) {
    max-width: 680px;
  }

  &__header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__back {
    margin-left: -12px;
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  &__cards {
    display: flex;
    flex-direction: column;
    gap: 16px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      flex-direction: row;

      > * {
        flex: 1;
      }
    }
  }

  &__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 16px;
    border-top: 1px solid $color-primary-button-outline;
  }

  &__footer-right {
    display: flex;
    gap: 12px;
  }
}
</style>
