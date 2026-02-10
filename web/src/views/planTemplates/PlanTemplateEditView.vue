<template>
  <div class="plan-template-edit">
    <div v-if="loading" class="plan-template-edit__loading-overlay">
      <ProgressSpinner :style="{ width: '40px', height: '40px' }" />
    </div>

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
            :saving-name="updating"
            :saving-description="updating"
            @update:name="handleUpdateName"
            @update:description="handleUpdateDescription"
          />
        </div>

        <Timeline v-model:period-configs="periodConfigs" mode="edit" :is-loading="updating">
          <template #controls>
            <Button
              type="button"
              icon="pi pi-refresh"
              rounded
              variant="outlined"
              severity="secondary"
              aria-label="Reset Timeline"
              :disabled="!hasChanges || updating"
              @click="handleReset"
            />
          </template>
          <template #footer>
            <PeriodCounter
              :count="periodConfigs.length"
              :disabled="updating"
              @increment="addPeriod"
              @decrement="removePeriod"
            />
          </template>
        </Timeline>
      </div>

      <div class="plan-template-edit__footer">
        <Button
          label="Save"
          outlined
          :loading="updating"
          :disabled="!hasChanges || !isValid || updating"
          @click="handleSave"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { Timeline } from '@/components/Timeline';
import PlanSettingsCard from '@/views/plan/components/PlanSettingsCard.vue';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlanTemplateEdit } from './composables/usePlanTemplateEdit';
import { usePlanTemplateEditEmissions } from './composables/usePlanTemplateEditEmissions';
import { useTemplateEditForm } from './composables/useTemplateEditForm';
import { makePlanTemplateId } from './domain/plan-template.model';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const { loading, updating, hasError, template, error, loadTemplate, submitUpdate, retry, actorRef } =
  usePlanTemplateEdit();

const {
  nameInput,
  descriptionInput,
  periodConfigs,
  validatedInput,
  isValid,
  hasChanges,
  addPeriod,
  removePeriod,
  reset: handleReset,
} = useTemplateEditForm(template);

usePlanTemplateEditEmissions(actorRef, {
  onTemplateUpdated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan updated',
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
    router.push('/plan-templates');
    return;
  }

  loadTemplate(maybeId.value);
});

const goToTemplates = () => {
  router.push('/my-plans');
};

const handleUpdateName = (name: string) => {
  nameInput.value = name;
};

const handleUpdateDescription = (description: string) => {
  descriptionInput.value = description;
};

const handleSave = () => {
  if (!validatedInput.value) return;
  submitUpdate(validatedInput.value);
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
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
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
