<template>
  <div class="plan-detail">
    <div class="plan-detail__header">
      <div class="plan-detail__back">
        <Button
          icon="pi pi-chevron-left"
          label="Plans"
          variant="text"
          severity="secondary"
          @click="handleBack"
        />
      </div>
      <h1 class="plan-detail__title">Settings</h1>
    </div>

    <div class="plan-detail__content">
      <div class="plan-detail__cards">
        <PlanSettingsCard v-model:name="planName" v-model:description="planDescription" />
        <PlanConfigCard
          :ratio="currentPreset.ratio"
          v-model:fasting-duration="fastingDuration"
          v-model:eating-window="eatingWindow"
          v-model:start-date="startDate"
        />
      </div>

      <PlanTimeline
        :fasting-duration="fastingDuration"
        :eating-window="eatingWindow"
        :start-date="startDate"
        :days="7"
      />
    </div>

    <div class="plan-detail__footer">
      <Button label="Reset" severity="secondary" variant="outlined" @click="handleReset" />
      <div class="plan-detail__footer-right">
        <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
        <Button label="Start Plan" severity="success" @click="handleStartPlan" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanConfigCard from './components/PlanConfigCard.vue';
import PlanSettingsCard from './components/PlanSettingsCard.vue';
import PlanTimeline from './components/PlanTimeline/PlanTimeline.vue';
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

// Editable state
const planName = ref(currentPreset.value.ratio);
const planDescription = ref('');
const fastingDuration = ref(currentPreset.value.fastingDuration);
const eatingWindow = ref(currentPreset.value.eatingWindow);

// Default start: 10 minutes from now
const getDefaultStartDate = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 10);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
};

const startDate = ref(getDefaultStartDate());

const handleReset = () => {
  planName.value = currentPreset.value.ratio;
  planDescription.value = '';
  fastingDuration.value = currentPreset.value.fastingDuration;
  eatingWindow.value = currentPreset.value.eatingWindow;
  startDate.value = getDefaultStartDate();
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
    fastingDuration: fastingDuration.value,
    eatingWindow: eatingWindow.value,
    startDate: startDate.value,
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
}
</style>
