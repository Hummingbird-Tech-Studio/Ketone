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
            :saving-name="savingName"
            :saving-description="savingDescription"
            @update:name="handleUpdateName"
            @update:description="handleUpdateDescription"
          />
          <PlanConfigCard
            :start-date="startDate"
            :saving-start-date="savingStartDate"
            @update:start-date="handleUpdateStartDate"
          />
        </div>

        <div class="plan-edit__save-template">
          <Button
            label="Save as template"
            outlined
            :loading="savingAsTemplate"
            :disabled="savingAsTemplate"
            @click="handleSaveAsTemplate"
          />
        </div>

        <Timeline
          v-model:period-configs="periodConfigs"
          mode="edit"
          :completed-cycle="lastCompletedCycle"
          :min-plan-start-date="minPlanStartDate"
          :is-loading="savingTimeline"
          @period-progress="handlePeriodProgress"
        >
          <template #subtitle>
            <Chip v-if="periodConfigs.length > 0" class="plan-edit__period-chip">
              Period <span class="plan-edit__period-chip--bold">{{ currentPeriodDisplay }}</span> of
              {{ periodConfigs.length }}
            </Chip>
          </template>
          <template #controls>
            <Button
              type="button"
              icon="pi pi-refresh"
              rounded
              variant="outlined"
              severity="secondary"
              aria-label="Reset Timeline"
              :disabled="!hasTimelineChanges || savingTimeline"
              @click="resetTimeline"
            />
          </template>
          <template #footer>
            <PeriodCounter
              :count="periodConfigs.length"
              :disabled="savingTimeline"
              @increment="addPeriod"
              @decrement="removePeriod"
            />
            <div class="plan-edit__save-timeline">
              <Button
                label="Save Timeline"
                outlined
                :loading="savingTimeline"
                :disabled="!hasTimelineChanges || savingTimeline"
                @click="handleSaveTimeline"
              />
            </div>
          </template>
        </Timeline>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { Timeline } from '@/components/Timeline';
import { formatShortDateTime } from '@/utils/formatting/helpers';
import { MAX_PLAN_TEMPLATES } from '@/views/planTemplates/domain';
import { formatLimitReachedMessage } from '@/views/planTemplates/utils/plan-template-formatting';
import { Option } from 'effect';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, toRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanConfigCard from './components/PlanConfigCard.vue';
import PlanSettingsCard from './components/PlanSettingsCard.vue';
import { usePlanEdit } from './composables/usePlanEdit';
import { makePlanId } from './domain';
import { usePlanEditEmissions } from './composables/usePlanEditEmissions';
import { usePlanEditForm } from './composables/usePlanEditForm';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const {
  plan,
  lastCompletedCycle,
  loading,
  hasError,
  error,
  savingName,
  savingDescription,
  savingStartDate,
  savingAsTemplate,
  savingTimeline,
  loadPlan,
  updateName,
  updateDescription,
  updateStartDate,
  saveTimeline,
  saveAsTemplate,
  actorRef,
} = usePlanEdit();

// Form state — managed by composable, synced from actor plan context
const {
  planName,
  planDescription,
  startDate,
  periodConfigs,
  hasTimelineChanges,
  currentPeriodDisplay,
  handlePeriodProgress,
  addPeriod,
  removePeriod,
  resetTimeline,
  buildSaveTimelinePayload,
} = usePlanEditForm({
  plan: toRef(() => plan.value),
  savingTimeline: toRef(() => savingTimeline.value),
});

// Calculate min plan start date (cannot start before last cycle ends)
const minPlanStartDate = computed(() => lastCompletedCycle.value?.endDate ?? null);

// Get planId from route — validated at the raw boundary
const planId = computed(() => Option.getOrNull(makePlanId(route.params.planId)));

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
  onTemplateSaved: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan saved as template',
      life: 3000,
    });
  },
  onTemplateSaveError: (errorMsg) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: errorMsg,
      life: 5000,
    });
  },
  onTemplateLimitReached: () => {
    toast.add({
      severity: 'warn',
      summary: 'Limit Reached',
      detail: formatLimitReachedMessage(MAX_PLAN_TEMPLATES),
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

const handleSaveAsTemplate = () => {
  if (planId.value) {
    saveAsTemplate(planId.value);
  }
};

const handleUpdateName = (name: string) => {
  if (!planId.value) return;
  planName.value = name;
  updateName(planId.value, name);
};

const handleUpdateDescription = (description: string) => {
  if (!planId.value) return;
  planDescription.value = description;
  updateDescription(planId.value, description);
};

const handleUpdateStartDate = (newStartDate: Date) => {
  if (!planId.value) return;
  startDate.value = newStartDate;
  updateStartDate(planId.value, newStartDate);
};

const handleSaveTimeline = () => {
  const payload = buildSaveTimelinePayload();
  if (!payload) return;
  saveTimeline(payload);
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

  &__save-template {
    display: flex;
    justify-content: flex-end;
  }

  &__save-timeline {
    display: flex;
    justify-content: flex-end;
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

  &__period-chip {
    background-color: $color-blue;
    color: $color-white;

    &--bold {
      font-weight: 700;
    }
  }
}
</style>
