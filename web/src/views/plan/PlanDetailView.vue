<template>
  <div class="plan-detail">
    <div v-if="isChecking" class="plan-detail__loading-overlay">
      <ProgressSpinner :style="{ width: '40px', height: '40px' }" />
    </div>

    <CycleInProgressDialog
      :visible="showCycleBlockDialog"
      @update:visible="handleCycleBlockDialogClose"
      @go-to-cycle="goToCycle"
    />

    <div class="plan-detail__header">
      <div class="plan-detail__back">
        <Button icon="pi pi-chevron-left" label="Plans" variant="text" severity="secondary" @click="handleBack" />
      </div>
      <h1 class="plan-detail__title">Settings</h1>
    </div>

    <div class="plan-detail__content">
      <div class="plan-detail__cards">
        <PlanSettingsCard v-model:name="planName" v-model:description="planDescription" />
        <PlanConfigCard v-model:start-date="startDate" />
      </div>

      <PlanTimeline :period-configs="periodConfigs" @update:period-configs="handlePeriodConfigsUpdate" />
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
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CycleInProgressDialog from './components/CycleInProgressDialog.vue';
import PlanConfigCard from './components/PlanConfigCard.vue';
import PlanSettingsCard from './components/PlanSettingsCard.vue';
import PlanTimeline from './components/PlanTimeline/PlanTimeline.vue';
import type { PeriodConfig } from './components/PlanTimeline/types';
import { useCycleBlockDialog } from './composables/useCycleBlockDialog';
import { useCycleBlockDialogEmissions } from './composables/useCycleBlockDialogEmissions';
import { DEFAULT_PERIODS_TO_SHOW, MAX_PERIODS, MIN_PERIODS } from './constants';
import { findPresetById } from './presets';

const route = useRoute();
const router = useRouter();
const {
  showDialog: showCycleBlockDialog,
  isChecking,
  startCheck,
  dismiss,
  goToCycle,
  actorRef,
} = useCycleBlockDialog();

// Handle emissions - no onProceed needed, page just renders normally
useCycleBlockDialogEmissions(actorRef, {
  onNavigateToCycle: () => {
    router.push('/cycle');
  },
});

const handleCycleBlockDialogClose = (value: boolean) => {
  if (!value) {
    dismiss();
    router.push('/plans');
  }
};

onMounted(() => {
  if (!currentPreset.value) {
    router.push('/plans');
    return;
  }
  startCheck();
});

const presetId = computed(() => route.params.presetId as string);
const currentPreset = computed(() => findPresetById(presetId.value));

const getDefaultStartDate = () => {
  const date = new Date();
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

  return currentPreset.value?.fastingDuration ?? 16;
});

const initialEatingWindow = computed(() => {
  const param = route.query.eatingWindow;
  if (param && !Array.isArray(param)) {
    const parsed = parseInt(param, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return currentPreset.value?.eatingWindow ?? 8;
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
const planName = ref(currentPreset.value?.ratio ?? '');
const planDescription = ref('');
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

// When start date changes, shift all periods by the same delta
// This preserves gaps between periods
watch(startDate, (newStartDate, oldStartDate) => {
  if (!oldStartDate) return;

  const deltaMs = newStartDate.getTime() - oldStartDate.getTime();
  if (deltaMs === 0) return;

  periodConfigs.value = periodConfigs.value.map((config) => ({
    ...config,
    startTime: new Date(config.startTime.getTime() + deltaMs),
  }));
});

const handlePeriodConfigsUpdate = (newConfigs: PeriodConfig[]) => {
  periodConfigs.value = newConfigs;
};

const handleReset = () => {
  planName.value = currentPreset.value?.ratio ?? '';
  planDescription.value = '';
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

  &__loading-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.7);
    z-index: 1000;
  }
}
</style>
