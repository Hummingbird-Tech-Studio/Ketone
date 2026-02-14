<template>
  <div class="plans">
    <div v-if="isChecking || (activeTab === 'my-plans' && templatesLoading)" class="plans__loading-overlay">
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

    <PresetConfigDialog
      v-if="selectedPreset"
      :visible="showConfigDialog"
      :preset="selectedPreset"
      :theme="selectedTheme"
      @update:visible="handleDialogClose"
      @confirm="handleConfirm"
    />

    <Dialog
      :visible="!!pendingDelete"
      modal
      :style="{ width: '350px' }"
      :draggable="false"
      :closable="!templatesDeleting"
      @update:visible="!$event && cancelDelete()"
    >
      <template #header>
        <div class="plans__confirm-header">
          <i class="pi pi-exclamation-circle plans__confirm-header-icon"></i>
          <span class="plans__confirm-header-title">Delete Plan</span>
        </div>
      </template>
      <p class="plans__confirm-message">
        Are you sure you want to delete <strong>{{ pendingDelete?.name }}</strong>? This can't be undone.
      </p>
      <template #footer>
        <div class="plans__confirm-footer">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="templatesDeleting"
            @click="cancelDelete()"
          />
          <Button
            label="Delete"
            severity="danger"
            outlined
            :loading="templatesDeleting"
            @click="confirmDelete()"
          />
        </div>
      </template>
    </Dialog>

    <!-- Tab navigation -->
    <SelectButton
      :model-value="activeTab"
      :options="tabOptions"
      :allow-empty="false"
      option-label="label"
      option-value="value"
      class="plans__tabs"
      @update:model-value="handleTabChange"
    />

    <!-- Plans tab content -->
    <template v-if="activeTab === 'plans'">
      <section v-for="section in sections" :key="section.id" class="plans__section">
        <div class="plans__section-header" :class="`plans__section-header--${section.theme}`">
          <div class="plans__section-icon">
            <i :class="section.icon"></i>
          </div>
          <div class="plans__section-info">
            <h2 class="plans__section-title">{{ section.title }}</h2>
            <p class="plans__section-description">{{ section.description }}</p>
          </div>
        </div>

        <div v-if="section.presets" class="plans__grid">
          <button
            v-for="preset in section.presets"
            :key="preset.id"
            type="button"
            class="plans__card"
            :aria-label="`${preset.ratio} fasting plan - ${preset.tagline}`"
            @click="selectPreset(preset, section.theme)"
          >
            <div class="plans__card-ratio">{{ preset.ratio }}</div>
            <div class="plans__card-duration">{{ preset.duration }}</div>
            <div class="plans__card-tagline" :class="`plans__card-tagline--${section.theme}`">
              {{ preset.tagline }}
            </div>
          </button>
        </div>
      </section>
    </template>

    <!-- My Plans tab content -->
    <template v-if="activeTab === 'my-plans'">
      <div v-if="templatesHasError" class="plans__error">
        <Message severity="error">
          {{ templatesError || 'Something went wrong. Please try again.' }}
        </Message>
        <Button label="Retry" @click="templatesRetry" />
      </div>

      <div v-else-if="templatesEmptyStateVisible" class="plans__empty">
        <div class="plans__empty-icon-wrapper">
          <i class="pi pi-calendar-plus plans__empty-icon"></i>
        </div>
        <p class="plans__empty-title">You don't have any saved plans yet.</p>
        <p class="plans__empty-subtitle">
          Customize any plan and tap 'Save as Template' to create your first saved plan.
        </p>
      </div>

      <template v-else-if="templatesReady || templatesDuplicating || templatesDeleting">
        <div class="plans__grid">
          <PlanTemplateCard
            v-for="card in cards"
            :key="card.id"
            :name="card.name"
            :description="card.description"
            :period-count-label="card.periodCountLabel"
            :is-loading="templatesDuplicating || templatesDeleting"
            :is-limit-reached="isLimitReached"
            @edit="handleTemplateEdit(card.id)"
            @duplicate="handleTemplateDuplicate(card.id)"
            @delete="handleTemplateDelete(card.id, card.name)"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PlanTemplateId } from '@/views/planTemplates/domain';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanTemplateCard from '../planTemplates/components/PlanTemplateCard.vue';
import { usePlanTemplates } from '../planTemplates/composables/usePlanTemplates';
import { usePlanTemplatesEmissions } from '../planTemplates/composables/usePlanTemplatesEmissions';
import BlockingResourcesDialog from './components/BlockingResourcesDialog.vue';
import PresetConfigDialog, { type PresetInitialConfig } from './components/PresetConfigDialog.vue';
import { useBlockingResourcesDialog } from './composables/useBlockingResourcesDialog';
import { useBlockingResourcesDialogEmissions } from './composables/useBlockingResourcesDialogEmissions';
import { sections, type Preset, type Theme } from './presets';

const route = useRoute();
const router = useRouter();
const toast = useToast();

// ── Tab state (derived from route)
const activeTab = computed<'plans' | 'my-plans'>(() => (route.name === 'my-plans' ? 'my-plans' : 'plans'));
const tabOptions = [
  { label: 'Plans', value: 'plans' as const },
  { label: 'My Plans', value: 'my-plans' as const },
];

// ── Plans tab (preset selection)
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

const showConfigDialog = ref(false);
const selectedPreset = ref<Preset | null>(null);
const selectedTheme = ref<Theme>('green');

useBlockingResourcesDialogEmissions(actorRef, {
  onProceed: () => {
    if (selectedPreset.value) {
      showConfigDialog.value = true;
    }
  },
  onNavigateToCycle: () => {
    router.push('/cycle');
  },
  onNavigateToPlan: () => {
    router.push('/cycle');
  },
});

const handleBlockDialogClose = (value: boolean) => {
  if (!value) {
    selectedPreset.value = null;
    dismiss();
  }
};

const selectPreset = (preset: Preset, theme: Theme) => {
  selectedPreset.value = preset;
  selectedTheme.value = theme;
  startCheck();
};

const handleDialogClose = (value: boolean) => {
  showConfigDialog.value = value;
  if (!value) {
    selectedPreset.value = null;
  }
};

const handleConfirm = (config: PresetInitialConfig) => {
  showConfigDialog.value = false;
  router.push({
    path: `/plans/${selectedPreset.value!.id}`,
    query: {
      fastingDuration: config.fastingDuration.toString(),
      eatingWindow: config.eatingWindow.toString(),
      periods: config.periods.toString(),
    },
  });
};

// ── My Plans tab (plan templates) ──────────────────────────────────────────
const {
  loading: templatesLoading,
  ready: templatesReady,
  duplicating: templatesDuplicating,
  deleting: templatesDeleting,
  hasError: templatesHasError,
  error: templatesError,
  cards,
  isLimitReached,
  emptyStateVisible: templatesEmptyStateVisible,
  limitReachedMessage,
  pendingDelete,
  duplicateTemplate,
  requestDelete,
  confirmDelete,
  cancelDelete,
  loadTemplates,
  retry: templatesRetry,
  actorRef: templatesActorRef,
} = usePlanTemplates();

let templatesLoadedOnce = false;

// Load templates on mount if navigated directly to /my-plans
onMounted(() => {
  if (activeTab.value === 'my-plans' && !templatesLoadedOnce) {
    templatesLoadedOnce = true;
    loadTemplates();
  }
});

const handleTabChange = (value: 'plans' | 'my-plans') => {
  router.push(value === 'my-plans' ? '/my-plans' : '/plans');
  if (value === 'my-plans' && !templatesLoadedOnce) {
    templatesLoadedOnce = true;
    loadTemplates();
  }
};

usePlanTemplatesEmissions(templatesActorRef, {
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

const handleTemplateEdit = (id: PlanTemplateId) => {
  router.push(`/plan-templates/${id}/edit`);
};

const handleTemplateDuplicate = (id: PlanTemplateId) => {
  duplicateTemplate(id);
};

const handleTemplateDelete = (id: PlanTemplateId, name: string) => {
  requestDelete(id, name);
};

</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plans {
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

  &__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    background: $color-white;

    &--green {
      background: linear-gradient(135deg, rgba($color-theme-green, 0.1) 0%, rgba($color-theme-green, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-green, 0.15);
        color: $color-theme-green;
      }
    }

    &--teal {
      background: linear-gradient(135deg, rgba($color-theme-teal, 0.1) 0%, rgba($color-theme-teal, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-teal, 0.15);
        color: $color-theme-teal;
      }
    }

    &--purple {
      background: linear-gradient(135deg, rgba($color-theme-purple, 0.1) 0%, rgba($color-theme-purple, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-purple, 0.15);
        color: $color-theme-purple;
      }
    }

    &--pink {
      background: linear-gradient(135deg, rgba($color-theme-pink, 0.1) 0%, rgba($color-theme-pink, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-pink, 0.15);
        color: $color-theme-pink;
      }
    }

    &--blue {
      background: linear-gradient(135deg, rgba($color-theme-blue, 0.1) 0%, rgba($color-theme-blue, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-blue, 0.15);
        color: $color-theme-blue;
      }
    }
  }

  &__section-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    font-size: 18px;
  }

  &__section-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__section-title {
    font-size: 16px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__section-description {
    font-size: 13px;
    color: $color-primary-light-text;
    margin: 0;
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;

    @media (min-width: $breakpoint-tablet-min-width) {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    background: $color-white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    width: 100%;

    &:hover {
      border-color: $color-primary-light-text;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    &:focus-visible {
      outline: 2px solid $color-primary;
      outline-offset: 2px;
    }
  }

  &__card-ratio {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    line-height: 1.2;
  }

  &__card-duration {
    font-size: 12px;
    color: $color-primary-light-text;
  }

  &__card-tagline {
    font-size: 13px;
    font-weight: 500;
    margin-top: 8px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;

    &--green {
      color: $color-theme-green;
    }

    &--teal {
      color: $color-theme-teal;
    }

    &--purple {
      color: $color-theme-purple;
    }

    &--pink {
      color: $color-theme-pink;
    }

    &--blue {
      color: $color-theme-blue;
    }
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
  }

  &__empty-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 16px;
    background: rgba($color-theme-purple, 0.1);
    margin-bottom: 8px;
  }

  &__empty-icon {
    font-size: 32px;
    color: $color-theme-purple;
  }

  &__empty-title {
    font-size: 15px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__empty-subtitle {
    font-size: 13px;
    color: $color-primary-light-text;
    margin: 0;
    max-width: 280px;
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 32px;
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

  &__confirm-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__confirm-header-icon {
    font-size: 20px;
    color: $color-error;
  }

  &__confirm-header-title {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
  }

  &__confirm-message {
    margin: 0;
    color: $color-primary-button-text;

    strong {
      font-weight: 700;
    }
  }

  &__confirm-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
