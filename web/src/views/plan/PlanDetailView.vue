<template>
  <div class="plan-detail">
    <div v-if="isChecking" class="plan-detail__loading-overlay">
      <ProgressSpinner :style="{ width: '40px', height: '40px' }" />
    </div>

    <BlockingResourcesDialog
      :visible="showBlockDialog"
      :has-cycle="hasCycle"
      :has-plan="hasPlan"
      @update:visible="handleBlockDialogClose"
      @go-to-cycle="goToCycle"
      @go-to-plan="goToPlan"
    />

    <PlanCreatedDialog
      :visible="showPlanCreatedDialog"
      :saving-template="savingAsTemplate"
      @update:visible="handlePlanCreatedDialogClose"
      @save-as-template="handleSaveAsTemplate"
      @go-to-plan="handleGoToPlan"
    />

    <div class="plan-detail__header">
      <div class="plan-detail__back">
        <Button icon="pi pi-chevron-left" label="Plans" variant="text" severity="secondary" @click="handleBack" />
      </div>
      <h1 class="plan-detail__title">Settings</h1>
    </div>

    <div class="plan-detail__content">
      <div class="plan-detail__cards">
        <PlanSettingsCard v-model:name="planName" v-model:description="planDescription" confirm-label="Ok" />
        <PlanConfigCard v-model:start-date="startDate" />
      </div>

      <Timeline
        v-model:period-configs="periodConfigs"
        mode="edit"
        :completed-cycle="lastCompletedCycle"
        :min-plan-start-date="minPlanStartDate"
      >
        <template #controls>
          <PeriodCounter :count="periodConfigs.length" @increment="addPeriod" @decrement="removePeriod" />
        </template>
        <template #footer>
          <Button
            label="Reset"
            severity="secondary"
            variant="outlined"
            style="align-self: flex-end"
            @click="reset"
          />
        </template>
      </Timeline>
    </div>

    <div class="plan-detail__footer">
      <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
      <Button
        label="Start Plan"
        :loading="creating"
        :disabled="creating || isChecking"
        outlined
        @click="handleStartPlan"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { Timeline } from '@/components/Timeline';
import { formatShortDateTime } from '@/utils/formatting/helpers';
import { MAX_PLAN_TEMPLATES } from '@/views/planTemplates/domain';
import { formatLimitReachedMessage } from '@/views/planTemplates/utils/plan-template-formatting';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BlockingResourcesDialog from './components/BlockingResourcesDialog.vue';
import PlanConfigCard from './components/PlanConfigCard.vue';
import PlanCreatedDialog from './components/PlanCreatedDialog.vue';
import PlanSettingsCard from './components/PlanSettingsCard.vue';
import { useBlockingResourcesDialog } from './composables/useBlockingResourcesDialog';
import { useBlockingResourcesDialogEmissions } from './composables/useBlockingResourcesDialogEmissions';
import { usePlan } from './composables/usePlan';
import { usePlanDetail } from './composables/usePlanDetail';
import { usePlanEmissions } from './composables/usePlanEmissions';
import { DEFAULT_PERIODS_TO_SHOW } from './constants';
import { MAX_PERIODS, MIN_PERIODS } from './domain';
import { findPresetById } from './presets';

const route = useRoute();
const router = useRouter();
const {
  showDialog: showBlockDialog,
  isChecking,
  hasCycle,
  hasPlan,
  startCheck,
  dismiss,
  goToCycle,
  goToPlan,
  actorRef,
} = useBlockingResourcesDialog();

const {
  createPlan,
  creating,
  activePlan,
  savingAsTemplate,
  saveAsTemplate,
  lastCompletedCycle,
  loadLastCompletedCycle,
  actorRef: planActorRef,
} = usePlan();
const toast = useToast();

const showPlanCreatedDialog = ref(false);

// Read preset from route
const presetId = computed(() => route.params.presetId as string);
const currentPreset = computed(() => findPresetById(presetId.value));

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

// Plan creation form state — managed by composable
const { planName, planDescription, startDate, periodConfigs, addPeriod, removePeriod, reset, buildCreatePlanPayload } =
  usePlanDetail({
    presetRatio: currentPreset.value?.ratio ?? '',
    initialFastingDuration: initialFastingDuration.value,
    initialEatingWindow: initialEatingWindow.value,
    initialPeriods: initialPeriods.value,
  });

// Calculate min plan start date (cannot start before last cycle ends)
const minPlanStartDate = computed(() => lastCompletedCycle.value?.endDate ?? null);

// Handle emissions
useBlockingResourcesDialogEmissions(actorRef, {
  onNavigateToCycle: () => {
    router.push('/cycle');
  },
  onNavigateToPlan: () => {
    router.push('/cycle');
  },
});

usePlanEmissions(planActorRef, {
  onPlanCreated: () => {
    showPlanCreatedDialog.value = true;
  },
  onTemplateSaved: () => {
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Plan saved as template',
      life: 3000,
    });
    router.push('/cycle');
  },
  onTemplateSaveError: (error) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
      life: 5000,
    });
    router.push('/cycle');
  },
  onTemplateLimitReached: () => {
    toast.add({
      severity: 'warn',
      summary: 'Limit Reached',
      detail: formatLimitReachedMessage(MAX_PLAN_TEMPLATES),
      life: 5000,
    });
    router.push('/cycle');
  },
  onAlreadyActiveError: (message) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 5000,
    });
  },
  onActiveCycleExistsError: () => {
    router.push('/cycle');
  },
  onInvalidPeriodCountError: (message) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 5000,
    });
  },
  onPeriodOverlapError: (message) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: formatErrorMessageDates(message),
      life: 5000,
    });
  },
  onPlanError: (error) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
      life: 5000,
    });
  },
});

const handleBlockDialogClose = (value: boolean) => {
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
  loadLastCompletedCycle();
});

const handleBack = () => {
  router.push('/plans');
};

const handleCancel = () => {
  router.push('/plans');
};

const handleSaveAsTemplate = () => {
  if (activePlan.value) {
    saveAsTemplate(activePlan.value.id);
  }
};

const handleGoToPlan = () => {
  router.push('/cycle');
};

const handlePlanCreatedDialogClose = (value: boolean) => {
  if (!value) {
    router.push('/cycle');
  }
};

const formatErrorMessageDates = (message: string): string => {
  const isoDateRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
  return message.replace(isoDateRegex, (isoDate) => {
    const date = new Date(isoDate);
    return formatShortDateTime(date);
  });
};

const handleStartPlan = () => {
  const payload = buildCreatePlanPayload();
  if (!payload) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'At least one period is required',
      life: 5000,
    });
    return;
  }
  createPlan(payload);
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
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid $color-primary-button-outline;
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
