<template>
  <div class="plan-template-edit">
    <div v-if="loading || isChecking || savingAsNew" class="plan-template-edit__loading-overlay">
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

    <UnsavedTimelineChangesDialog
      :visible="showUnsavedChangesDialog"
      @update:visible="showUnsavedChangesDialog = $event"
      @update-template="handleUpdateTemplate"
      @save-as-new="handleSaveAsNew"
      @start-without-saving="handleStartWithoutSaving"
    />

    <div v-if="hasError" class="plan-template-edit__error">
      <Message severity="error">
        {{ error || 'Something went wrong. Please try again.' }}
      </Message>
      <Button label="Retry" @click="retry" />
    </div>

    <template v-else-if="template">
      <div class="plan-template-edit__header">
        <div class="plan-template-edit__back">
          <Button
            icon="pi pi-chevron-left"
            label="Saved Plans"
            variant="text"
            severity="secondary"
            @click="goToTemplates"
          />
        </div>
        <h1 class="plan-template-edit__title">Edit Plan</h1>
      </div>

      <div class="plan-template-edit__content">
        <div class="plan-template-edit__cards">
          <PlanSettingsCard
            :name="nameInput"
            :description="descriptionInput"
            :saving-name="updatingName"
            :saving-description="updatingDescription"
            @update:name="handleUpdateName"
            @update:description="handleUpdateDescription"
          />
          <PlanConfigCard v-model:start-date="startDate" />
        </div>

        <Timeline
          v-model:period-configs="periodConfigs"
          mode="edit"
          :is-loading="updatingTimeline"
          :completed-cycle="lastCompletedCycle"
          :min-plan-start-date="minPlanStartDate"
        >
          <template #controls>
            <PeriodCounter
              :count="periodConfigs.length"
              :disabled="updatingTimeline || savingAsNew"
              @increment="addPeriod"
              @decrement="removePeriod"
            />
          </template>
          <template #footer>
            <Button
              label="Reset"
              severity="secondary"
              variant="outlined"
              style="align-self: flex-end"
              :disabled="!hasChanges || updatingTimeline"
              @click="handleReset"
            />
          </template>
        </Timeline>
      </div>

      <div class="plan-template-edit__footer">
        <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
        <Button
          label="Start Plan"
          outlined
          :loading="creating"
          :disabled="creating || isChecking || updatingTimeline || savingAsNew"
          @click="handleStartPlan"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { Timeline } from '@/components/Timeline';
import BlockingResourcesDialog from '@/views/plan/components/BlockingResourcesDialog.vue';
import PlanConfigCard from '@/views/plan/components/PlanConfigCard.vue';
import PlanSettingsCard from '@/views/plan/components/PlanSettingsCard.vue';
import { useBlockingResourcesDialog } from '@/views/plan/composables/useBlockingResourcesDialog';
import { useBlockingResourcesDialogEmissions } from '@/views/plan/composables/useBlockingResourcesDialogEmissions';
import { usePlan } from '@/views/plan/composables/usePlan';
import { usePlanEmissions } from '@/views/plan/composables/usePlanEmissions';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UnsavedTimelineChangesDialog from './components/UnsavedTimelineChangesDialog.vue';
import { usePlanTemplateEdit } from './composables/usePlanTemplateEdit';
import { usePlanTemplateEditEmissions } from './composables/usePlanTemplateEditEmissions';
import { useTemplateEditForm } from './composables/useTemplateEditForm';
import { makePlanTemplateId } from './domain/plan-template.model';

const route = useRoute();
const router = useRouter();
const toast = useToast();

// Plan template edit actor
const {
  loading,
  updatingName,
  updatingDescription,
  updatingTimeline,
  savingAsNew,
  hasError,
  template,
  error,
  loadTemplate,
  submitNameUpdate,
  submitDescriptionUpdate,
  submitTimelineUpdate,
  submitSaveAsNew,
  retry,
  actorRef,
} = usePlanTemplateEdit();

// Form state
const {
  nameInput,
  descriptionInput,
  periodConfigs,
  startDate,
  validatedInput,
  hasChanges,
  hasTimelineChanges,
  addPeriod,
  removePeriod,
  syncNameFromServer,
  syncDescriptionFromServer,
  syncAllFromServer,
  buildNameUpdateInput,
  buildDescriptionUpdateInput,
  buildCreatePlanInput,
  reset: handleReset,
} = useTemplateEditForm(template);

// Blocking resources dialog
const {
  showDialog: showBlockDialog,
  isChecking,
  hasCycle,
  hasPlan,
  startCheck,
  dismiss,
  goToCycle,
  goToPlan,
  actorRef: blockingActorRef,
} = useBlockingResourcesDialog();

// Plan actor (for creating plans)
const { createPlan, creating, lastCompletedCycle, loadLastCompletedCycle, actorRef: planActorRef } = usePlan();

const minPlanStartDate = computed(() => lastCompletedCycle.value?.endDate ?? null);

usePlanTemplateEditEmissions(actorRef, {
  onNameUpdated: (t) => {
    syncNameFromServer(t.name);
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Name updated',
      life: 3000,
    });
  },
  onDescriptionUpdated: (t) => {
    syncDescriptionFromServer(t.description);
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Description updated',
      life: 3000,
    });
  },
  onTimelineUpdated: (t) => {
    syncAllFromServer(t);
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Template updated',
      life: 3000,
    });
    startCheck();
  },
  onSavedAsNew: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Saved as new template',
      life: 3000,
    });
    startCheck();
  },
  onError: (errorMsg) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: errorMsg,
      life: 5000,
    });
  },
});

useBlockingResourcesDialogEmissions(blockingActorRef, {
  onProceed: () => {
    handleCreatePlan();
  },
  onNavigateToCycle: () => {
    router.push('/cycle');
  },
  onNavigateToPlan: () => {
    router.push('/cycle');
  },
});

usePlanEmissions(planActorRef, {
  onPlanCreated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan started',
      life: 3000,
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
  onPlanError: (error) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
      life: 5000,
    });
  },
});

onMounted(() => {
  const rawId = route.params.id as string;
  const maybeId = makePlanTemplateId(rawId);

  if (maybeId._tag === 'None') {
    router.push('/plan-templates');
    return;
  }

  loadTemplate(maybeId.value);
  loadLastCompletedCycle();
});

const goToTemplates = () => {
  router.push('/my-plans');
};

const handleUpdateName = (name: string) => {
  const input = buildNameUpdateInput(name);
  if (input) submitNameUpdate(input);
};

const handleUpdateDescription = (description: string) => {
  const input = buildDescriptionUpdateInput(description);
  if (input) submitDescriptionUpdate(input);
};

const showUnsavedChangesDialog = ref(false);

const handleCancel = () => {
  router.push('/my-plans');
};

const handleStartPlan = () => {
  if (hasTimelineChanges.value && validatedInput.value) {
    showUnsavedChangesDialog.value = true;
  } else {
    startCheck();
  }
};

const handleUpdateTemplate = () => {
  showUnsavedChangesDialog.value = false;
  if (validatedInput.value) submitTimelineUpdate(validatedInput.value);
};

const handleSaveAsNew = () => {
  showUnsavedChangesDialog.value = false;
  if (validatedInput.value) {
    submitSaveAsNew(
      validatedInput.value.periods.map((p) => ({
        fastingDuration: p.fastingDuration,
        eatingWindow: p.eatingWindow,
      })),
    );
  }
};

const handleStartWithoutSaving = () => {
  showUnsavedChangesDialog.value = false;
  startCheck();
};

const handleCreatePlan = () => {
  const input = buildCreatePlanInput();
  if (input) createPlan(input);
};

const handleBlockDialogClose = (value: boolean) => {
  if (!value) {
    dismiss();
  }
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-template-edit {
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

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 32px;
  }
}
</style>
