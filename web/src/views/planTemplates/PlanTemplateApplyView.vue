<template>
  <div class="plan-template-apply">
    <div v-if="loading || isChecking || savingAsNew" class="plan-template-apply__loading-overlay">
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
      :visible="showUnsavedDialog"
      @update:visible="!$event && sendStartFlow({ type: StartFlowEvent.DISMISS })"
      @update-template="handleUpdateTemplateAndStart"
      @save-as-new="handleSaveAsNewAndStart"
      @start-without-saving="handleStartWithoutSaving"
    />

    <div v-if="hasError" class="plan-template-apply__error">
      <Message severity="error">
        {{ error || 'Something went wrong. Please try again.' }}
      </Message>
      <Button label="Retry" @click="retry" />
    </div>

    <template v-else-if="template">
      <div class="plan-template-apply__header">
        <div class="plan-template-apply__back">
          <Button
            icon="pi pi-chevron-left"
            label="My Templates"
            variant="text"
            severity="secondary"
            @click="goToTemplates"
          />
        </div>
        <h1 class="plan-template-apply__title">Apply Template</h1>
      </div>

      <div class="plan-template-apply__content">
        <div class="plan-template-apply__cards">
          <PlanSettingsCard
            :name="planName"
            :description="planDescription"
            @update:name="planName = $event"
            @update:description="planDescription = $event"
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
            <div class="plan-template-apply__timeline-footer">
              <Button
                label="Reset"
                severity="secondary"
                variant="outlined"
                :disabled="!hasTimelineChanges || updatingTimeline"
                @click="handleReset"
              />
              <Button
                label="Save Timeline"
                :loading="updatingTimeline"
                :disabled="!hasTimelineChanges || updatingTimeline"
                @click="handleSaveTimeline"
              />
            </div>
          </template>
        </Timeline>
      </div>

      <div class="plan-template-apply__footer">
        <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
        <Button
          label="Start Plan"
          outlined
          :loading="creating"
          :disabled="creating || updatingTimeline || savingAsNew"
          @click="handleStartPlan"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { Timeline } from '@/components/Timeline';
import { ProceedTarget } from '@/views/plan/actors/blockingResourcesDialog.actor';
import BlockingResourcesDialog from '@/views/plan/components/BlockingResourcesDialog.vue';
import PlanConfigCard from '@/views/plan/components/PlanConfigCard.vue';
import PlanSettingsCard from '@/views/plan/components/PlanSettingsCard.vue';
import { useBlockingResourcesDialog } from '@/views/plan/composables/useBlockingResourcesDialog';
import { useBlockingResourcesDialogEmissions } from '@/views/plan/composables/useBlockingResourcesDialogEmissions';
import { usePlan } from '@/views/plan/composables/usePlan';
import { usePlanEmissions } from '@/views/plan/composables/usePlanEmissions';
import { useActor, useSelector } from '@xstate/vue';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { setup } from 'xstate';
import UnsavedTimelineChangesDialog from './components/UnsavedTimelineChangesDialog.vue';
import { usePlanTemplateEdit } from './composables/usePlanTemplateEdit';
import { usePlanTemplateEditEmissions } from './composables/usePlanTemplateEditEmissions';
import { useTemplateApplyForm } from './composables/useTemplateApplyForm';
import { makePlanTemplateId } from './domain/plan-template.model';

const route = useRoute();
const router = useRouter();
const toast = useToast();

// Plan template edit actor (for loading template + saving timeline)
const {
  loading,
  updatingTimeline,
  savingAsNew,
  hasError,
  template,
  error,
  loadTemplate,
  submitTimelineUpdate,
  submitSaveAsNew,
  retry,
  actorRef,
} = usePlanTemplateEdit();

// Read override periods from router state (passed from Edit view with unsaved changes)
const overridePeriods = history.state?.periods ?? undefined;

// Form state
const {
  planName,
  planDescription,
  periodConfigs,
  startDate,
  hasTimelineChanges,
  addPeriod,
  removePeriod,
  buildCreatePlanInput,
  buildTimelineUpdateInput,
  reset: handleReset,
  syncTimelineFromServer,
} = useTemplateApplyForm(template, { overridePeriods });

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

// ── Unsaved timeline changes flow ────────────────────────────────────
enum StartFlowState {
  Idle = 'Idle',
  ShowingDialog = 'ShowingDialog',
  WaitingForSave = 'WaitingForSave',
}

enum StartFlowEvent {
  SHOW_DIALOG = 'SHOW_DIALOG',
  UPDATE_AND_START = 'UPDATE_AND_START',
  SAVE_NEW_AND_START = 'SAVE_NEW_AND_START',
  START_WITHOUT_SAVING = 'START_WITHOUT_SAVING',
  DISMISS = 'DISMISS',
  SAVE_SUCCEEDED = 'SAVE_SUCCEEDED',
  SAVE_FAILED = 'SAVE_FAILED',
}

const startFlowMachine = setup({
  types: { events: {} as { type: StartFlowEvent } },
}).createMachine({
  id: 'startFlow',
  initial: StartFlowState.Idle,
  states: {
    [StartFlowState.Idle]: {
      on: { [StartFlowEvent.SHOW_DIALOG]: StartFlowState.ShowingDialog },
    },
    [StartFlowState.ShowingDialog]: {
      on: {
        [StartFlowEvent.UPDATE_AND_START]: StartFlowState.WaitingForSave,
        [StartFlowEvent.SAVE_NEW_AND_START]: StartFlowState.WaitingForSave,
        [StartFlowEvent.START_WITHOUT_SAVING]: StartFlowState.Idle,
        [StartFlowEvent.DISMISS]: StartFlowState.Idle,
      },
    },
    [StartFlowState.WaitingForSave]: {
      on: {
        [StartFlowEvent.SAVE_SUCCEEDED]: StartFlowState.Idle,
        [StartFlowEvent.SAVE_FAILED]: StartFlowState.Idle,
      },
    },
  },
});

const { send: sendStartFlow, actorRef: startFlowRef } = useActor(startFlowMachine);
const showUnsavedDialog = useSelector(startFlowRef, (s) => s.matches(StartFlowState.ShowingDialog));
const waitingForSave = useSelector(startFlowRef, (s) => s.matches(StartFlowState.WaitingForSave));

usePlanTemplateEditEmissions(actorRef, {
  onTimelineUpdated: (t) => {
    syncTimelineFromServer(t);
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Template updated',
      life: 3000,
    });
    if (waitingForSave.value) {
      sendStartFlow({ type: StartFlowEvent.SAVE_SUCCEEDED });
      startPlan();
    }
  },
  onSavedAsNew: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Template saved as new',
      life: 3000,
    });
    if (waitingForSave.value) {
      sendStartFlow({ type: StartFlowEvent.SAVE_SUCCEEDED });
      startPlan();
    }
  },
  onError: (errorMsg) => {
    if (waitingForSave.value) {
      sendStartFlow({ type: StartFlowEvent.SAVE_FAILED });
    }
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: errorMsg,
      life: 5000,
    });
  },
});

useBlockingResourcesDialogEmissions(blockingActorRef, {
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
  const rawId = route.params.id;
  const maybeId = makePlanTemplateId(rawId);

  if (maybeId._tag === 'None') {
    router.push('/my-templates');
    return;
  }

  loadTemplate(maybeId.value);
  loadLastCompletedCycle();
  startCheck(ProceedTarget.Continue());
});

const goToTemplates = () => {
  router.push('/my-templates');
};

const handleCancel = () => {
  router.push('/my-templates');
};

const handleSaveTimeline = () => {
  const input = buildTimelineUpdateInput();
  if (input) submitTimelineUpdate(input);
};

const startPlan = () => {
  const input = buildCreatePlanInput();
  if (input) createPlan(input);
};

const handleStartPlan = () => {
  if (hasTimelineChanges.value) {
    sendStartFlow({ type: StartFlowEvent.SHOW_DIALOG });
    return;
  }
  startPlan();
};

const handleUpdateTemplateAndStart = () => {
  sendStartFlow({ type: StartFlowEvent.UPDATE_AND_START });
  const input = buildTimelineUpdateInput();
  if (input) submitTimelineUpdate(input);
};

const handleSaveAsNewAndStart = () => {
  sendStartFlow({ type: StartFlowEvent.SAVE_NEW_AND_START });
  submitSaveAsNew(
    periodConfigs.value.map((p) => ({
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    })),
  );
};

const handleStartWithoutSaving = () => {
  sendStartFlow({ type: StartFlowEvent.START_WITHOUT_SAVING });
  startPlan();
};

const handleBlockDialogClose = (value: boolean) => {
  if (!value) {
    dismiss();
    router.push('/my-templates');
  }
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-template-apply {
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

  &__timeline-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
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
