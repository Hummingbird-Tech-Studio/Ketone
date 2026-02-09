<template>
  <div class="plan-templates">
    <div v-if="loading" class="plan-templates__loading-overlay">
      <ProgressSpinner :style="{ width: '40px', height: '40px' }" />
    </div>

    <div v-if="hasError" class="plan-templates__error">
      <Message severity="error">
        {{ error || 'Something went wrong. Please try again.' }}
      </Message>
      <Button label="Retry" @click="retry" />
    </div>

    <template v-else-if="ready || duplicating || deleting">
      <div class="plan-templates__header">
        <div class="plan-templates__back">
          <Button
            icon="pi pi-chevron-left"
            label="Plans"
            variant="text"
            severity="secondary"
            @click="goToPlans"
          />
        </div>
        <h1 class="plan-templates__title">Saved Plans</h1>
      </div>

      <div v-if="emptyStateVisible" class="plan-templates__empty">
        <i class="pi pi-bookmark plan-templates__empty-icon"></i>
        <p class="plan-templates__empty-text">
          No saved plans yet. Save a plan from the edit screen to reuse it later.
        </p>
      </div>

      <div v-else class="plan-templates__list">
        <PlanTemplateCard
          v-for="tmpl in sortedTemplates"
          :key="tmpl.id"
          :name="tmpl.name"
          :description="tmpl.description"
          :period-count="tmpl.periodCount"
          :is-busy="duplicating || deleting"
          :is-limit-reached="isLimitReached"
          @edit="handleEdit(tmpl.id)"
          @duplicate="handleDuplicate(tmpl.id)"
          @delete="handleDelete(tmpl.id, tmpl.name)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { PlanTemplateId } from './domain/plan-template.model';
import { usePlanTemplates } from './composables/usePlanTemplates';
import { usePlanTemplatesEmissions } from './composables/usePlanTemplatesEmissions';
import PlanTemplateCard from './components/PlanTemplateCard.vue';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const {
  loading,
  ready,
  duplicating,
  deleting,
  hasError,
  error,
  sortedTemplates,
  isLimitReached,
  emptyStateVisible,
  limitReachedMessage,
  buildDeleteConfirmationMessage,
  duplicateTemplate,
  deleteTemplate,
  loadTemplates,
  retry,
  actorRef,
} = usePlanTemplates();

usePlanTemplatesEmissions(actorRef, {
  onTemplateDuplicated: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan duplicated',
      life: 3000,
    });
  },
  onTemplateDeleted: () => {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Plan deleted',
      life: 3000,
    });
  },
  onLimitReached: () => {
    toast.add({
      severity: 'warn',
      summary: 'Limit Reached',
      detail: limitReachedMessage.value,
      life: 5000,
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
  loadTemplates();
});

const goToPlans = () => {
  router.push('/plans');
};

const handleEdit = (id: PlanTemplateId) => {
  router.push(`/plan-templates/${id}/edit`);
};

const handleDuplicate = (id: PlanTemplateId) => {
  duplicateTemplate(id);
};

const handleDelete = (id: PlanTemplateId, name: string) => {
  confirm.require({
    message: buildDeleteConfirmationMessage(name),
    header: 'Delete Plan',
    icon: 'pi pi-trash',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteTemplate(id);
    },
  });
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-templates {
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

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
  }

  &__empty-icon {
    font-size: 40px;
    color: $color-primary-light-text;
    opacity: 0.5;
  }

  &__empty-text {
    font-size: 14px;
    color: $color-primary-light-text;
    margin: 0;
    max-width: 280px;
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
