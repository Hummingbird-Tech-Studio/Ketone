<template>
  <div class="plan-edit">
    <div v-if="loading" class="plan-edit__loading-overlay">
      <ProgressSpinner :style="{ width: '40px', height: '40px' }" />
    </div>

    <div v-if="hasError" class="plan-edit__error">
      <Message severity="error">
        {{ error || 'Failed to load plan. The plan may have been deleted or is no longer active.' }}
      </Message>
      <Button label="Go to Active Plan" @click="goToCycle" />
    </div>

    <template v-else-if="plan">
      <div class="plan-edit__header">
        <div class="plan-edit__back">
          <Button
            icon="pi pi-chevron-left"
            label="Active Plan"
            variant="text"
            severity="secondary"
            @click="goToCycle"
          />
        </div>
        <h1 class="plan-edit__title">Edit Plan</h1>
      </div>

      <div class="plan-edit__content">
        <div class="plan-edit__cards">
          <PlanSettingsCard
            :name="planName"
            :description="planDescription"
            @update:name="handleUpdateName"
            @update:description="handleUpdateDescription"
          />
          <PlanConfigCard :start-date="startDate" @update:start-date="handleUpdateStartDate" />
        </div>

        <PlanTimeline
          :period-configs="periodConfigs"
          :last-completed-cycle="lastCompletedCycle"
          :loading="savingTimeline"
          @update:period-configs="handlePeriodConfigsUpdate"
        />
      </div>

      <div class="plan-edit__footer">
        <div class="plan-edit__footer-right">
          <Button
            label="Reset Timeline"
            severity="secondary"
            variant="outlined"
            :disabled="!hasTimelineChanges || savingTimeline"
            @click="handleResetTimeline"
          />
          <Button
            label="Save Timeline"
            :loading="savingTimeline"
            :disabled="!hasTimelineChanges || savingTimeline"
            @click="handleSaveTimeline"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatShortDateTime } from '@/utils/formatting/helpers';
import type { PeriodResponse } from '@ketone/shared';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanConfigCard from './components/PlanConfigCard.vue';
import PlanSettingsCard from './components/PlanSettingsCard.vue';
import PlanTimeline from './components/PlanTimeline/PlanTimeline.vue';
import type { PeriodConfig } from './components/PlanTimeline/types';
import { usePlanEdit } from './composables/usePlanEdit';
import { usePlanEditEmissions } from './composables/usePlanEditEmissions';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const {
  plan,
  lastCompletedCycle,
  loading,
  hasError,
  error,
  savingTimeline,
  loadPlan,
  updateName,
  updateDescription,
  updateStartDate,
  saveTimeline,
  actorRef,
} = usePlanEdit();

// Local state for editing
const planName = ref('');
const planDescription = ref('');
const startDate = ref(new Date());
const periodConfigs = ref<PeriodConfig[]>([]);
const originalPeriodConfigs = ref<PeriodConfig[]>([]);

// Get planId from route
const planId = computed(() => route.params.planId as string);

// Convert API PeriodResponse[] to PeriodConfig[]
function convertPeriodsToPeriodConfigs(periods: readonly PeriodResponse[]): PeriodConfig[] {
  return periods.map((period) => ({
    startTime: new Date(period.startDate),
    fastingDuration: period.fastingDuration,
    eatingWindow: period.eatingWindow,
    deleted: false,
  }));
}

// Deep clone PeriodConfig array preserving Date objects
function clonePeriodConfigs(configs: PeriodConfig[]): PeriodConfig[] {
  return configs.map((config) => ({
    ...config,
    startTime: new Date(config.startTime),
  }));
}

// Check if first period's start time changed (this affects plan's startDate)
const hasStartTimeChange = computed(() => {
  const firstPeriod = periodConfigs.value.find((p) => !p.deleted);
  const originalFirstPeriod = originalPeriodConfigs.value.find((p) => !p.deleted);
  if (!firstPeriod || !originalFirstPeriod) return false;
  return firstPeriod.startTime.getTime() !== new Date(originalFirstPeriod.startTime).getTime();
});

// Check if period durations changed
const hasDurationChanges = computed(() => {
  if (periodConfigs.value.length !== originalPeriodConfigs.value.length) return true;

  return periodConfigs.value.some((config, index) => {
    const original = originalPeriodConfigs.value[index];
    if (!original) return true;
    return (
      config.fastingDuration !== original.fastingDuration ||
      config.eatingWindow !== original.eatingWindow ||
      config.deleted !== original.deleted
    );
  });
});

// Check if timeline has any changes (start time or durations)
const hasTimelineChanges = computed(() => hasStartTimeChange.value || hasDurationChanges.value);

// Update local state when plan is loaded or after saving completes
// Skip updates while saving to prevent chart re-renders behind the loading overlay
watch(
  [plan, savingTimeline],
  ([newPlan, saving]) => {
    if (newPlan && !saving) {
      planName.value = newPlan.name;
      planDescription.value = newPlan.description ?? '';
      startDate.value = new Date(newPlan.startDate);
      const configs = convertPeriodsToPeriodConfigs(newPlan.periods);
      periodConfigs.value = configs;
      originalPeriodConfigs.value = clonePeriodConfigs(configs);
    }
  },
  { immediate: true },
);

// Handle emissions for toast notifications
usePlanEditEmissions(actorRef, {
  onNameUpdated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan name updated',
      life: 3000,
    });
  },
  onDescriptionUpdated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan description updated',
      life: 3000,
    });
  },
  onStartDateUpdated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Start date updated. Period times have been recalculated.',
      life: 3000,
    });
  },
  onPeriodsUpdated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Timeline saved',
      life: 3000,
    });
  },
  onTimelineSaved: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Timeline saved',
      life: 3000,
    });
  },
  onError: (errorMsg) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: errorMsg,
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
  onPlanInvalidStateError: (message) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 5000,
    });
  },
});

const formatErrorMessageDates = (message: string): string => {
  const isoDateRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
  return message.replace(isoDateRegex, (isoDate) => {
    const date = new Date(isoDate);
    return formatShortDateTime(date);
  });
};

onMounted(() => {
  if (planId.value) {
    loadPlan(planId.value);
  } else {
    router.push('/cycle');
  }
});

const goToCycle = () => {
  router.push('/cycle');
};

const handleUpdateName = (name: string) => {
  planName.value = name;
  updateName(planId.value, name);
};

const handleUpdateDescription = (description: string) => {
  planDescription.value = description;
  updateDescription(planId.value, description);
};

const handleUpdateStartDate = (newStartDate: Date) => {
  startDate.value = newStartDate;
  updateStartDate(planId.value, newStartDate);
};

const handlePeriodConfigsUpdate = (newConfigs: PeriodConfig[]) => {
  periodConfigs.value = newConfigs;
};

const handleResetTimeline = () => {
  periodConfigs.value = clonePeriodConfigs(originalPeriodConfigs.value);
};

const handleSaveTimeline = () => {
  if (!plan.value) return;

  const firstPeriod = periodConfigs.value.find((p) => !p.deleted);
  if (!firstPeriod) return;

  // Build periods payload if durations changed
  const activePeriods = periodConfigs.value.filter((p) => !p.deleted);
  const periods = hasDurationChanges.value
    ? activePeriods.map((config, index) => ({
        id: plan.value!.periods[index]!.id,
        fastingDuration: config.fastingDuration,
        eatingWindow: config.eatingWindow,
      }))
    : undefined;

  // Build startDate if changed
  const newStartDate = hasStartTimeChange.value ? firstPeriod.startTime : undefined;

  // Single call - actor handles sequencing internally
  saveTimeline(planId.value, newStartDate, periods);
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-edit {
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

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 32px;
  }
}
</style>
