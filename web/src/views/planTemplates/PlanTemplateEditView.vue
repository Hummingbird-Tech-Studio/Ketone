<template>
  <div class="plan-template-edit">
    <div v-if="loading || savingAsNew || isChecking" class="plan-template-edit__loading-overlay">
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
            label="My Templates"
            variant="text"
            severity="secondary"
            @click="goToTemplates"
          />
        </div>
        <h1 class="plan-template-edit__title">Edit Template</h1>
      </div>

      <div class="plan-template-edit__content">
        <PlanSettingsCard
          :name="nameInput"
          :description="descriptionInput"
          :saving-name="updatingName"
          :saving-description="updatingDescription"
          @update:name="handleUpdateName"
          @update:description="handleUpdateDescription"
        />

        <PeriodCounter
          :count="periods.length"
          :disabled="updatingTimeline || savingAsNew"
          @increment="addPeriod"
          @decrement="removePeriod"
        />

        <TemplatePeriodEditor
          :periods="periods"
          :disabled="updatingTimeline || savingAsNew"
          @update:periods="periods = $event"
        />

        <div class="plan-template-edit__periods-footer">
          <Button
            label="Reset"
            severity="secondary"
            variant="outlined"
            :disabled="!hasTimelineChanges || updatingTimeline"
            @click="handleReset"
          />
          <Button
            label="Save Periods"
            :loading="updatingTimeline"
            :disabled="!hasTimelineChanges || updatingTimeline"
            @click="handleSaveTimeline"
          />
        </div>
      </div>

      <div class="plan-template-edit__footer">
        <Button label="Cancel" severity="secondary" variant="outlined" @click="handleCancel" />
        <Button label="Apply" outlined @click="handleApply" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { ProceedTarget } from '@/views/plan/actors/blockingResourcesDialog.actor';
import BlockingResourcesDialog from '@/views/plan/components/BlockingResourcesDialog.vue';
import PlanSettingsCard from '@/views/plan/components/PlanSettingsCard.vue';
import { useBlockingResourcesDialog } from '@/views/plan/composables/useBlockingResourcesDialog';
import { useBlockingResourcesDialogEmissions } from '@/views/plan/composables/useBlockingResourcesDialogEmissions';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TemplatePeriodEditor from './components/TemplatePeriodEditor.vue';
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
  retry,
  actorRef,
} = usePlanTemplateEdit();

// Form state
const {
  nameInput,
  descriptionInput,
  periods,
  validatedInput,
  hasTimelineChanges,
  addPeriod,
  removePeriod,
  syncNameFromServer,
  syncDescriptionFromServer,
  syncAllFromServer,
  buildNameUpdateInput,
  buildDescriptionUpdateInput,
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

useBlockingResourcesDialogEmissions(blockingActorRef, {
  onProceed: () => {
    const rawId = route.params.id;
    const plainPeriods = periods.value.map((p) => ({
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    }));
    router.push({ path: `/my-templates/${rawId}/apply`, state: { periods: plainPeriods } });
  },
  onNavigateToCycle: () => {
    router.push('/cycle');
  },
  onNavigateToPlan: () => {
    router.push('/cycle');
  },
});

const handleBlockDialogClose = (value: boolean) => {
  if (!value) dismiss();
};

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
  },
  onSavedAsNew: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Saved as new template',
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
});

onMounted(() => {
  const rawId = route.params.id as string;
  const maybeId = makePlanTemplateId(rawId);

  if (maybeId._tag === 'None') {
    router.push('/my-templates');
    return;
  }

  loadTemplate(maybeId.value);
});

const goToTemplates = () => {
  router.push('/my-templates');
};

const handleUpdateName = (name: string) => {
  const input = buildNameUpdateInput(name);
  if (input) submitNameUpdate(input);
};

const handleUpdateDescription = (description: string) => {
  const input = buildDescriptionUpdateInput(description);
  if (input) submitDescriptionUpdate(input);
};

const handleCancel = () => {
  router.push('/my-templates');
};

const handleSaveTimeline = () => {
  if (validatedInput.value) submitTimelineUpdate(validatedInput.value);
};

const handleApply = () => {
  startCheck(ProceedTarget.Continue());
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

  &__periods-footer {
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
