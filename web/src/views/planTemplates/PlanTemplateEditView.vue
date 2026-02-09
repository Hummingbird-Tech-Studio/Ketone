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

        <Timeline
          v-model:period-configs="periodConfigs"
          mode="edit"
          :is-loading="updating"
        >
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
              @increment="handleAddPeriod"
              @decrement="handleRemovePeriod"
            />
          </template>
        </Timeline>
      </div>

      <div class="plan-template-edit__footer">
        <Button
          label="Save"
          outlined
          :loading="updating"
          :disabled="!hasChanges || updating"
          @click="handleSave"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import PeriodCounter from '@/components/PeriodCounter/PeriodCounter.vue';
import { Timeline, type PeriodConfig } from '@/components/Timeline';
import { MAX_PERIODS, MIN_PERIODS } from '@/views/plan/constants';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanSettingsCard from '@/views/plan/components/PlanSettingsCard.vue';
import { makePlanTemplateId } from './domain/plan-template.model';
import type { TemplatePeriodConfig } from './domain/plan-template.model';
import { usePlanTemplateEdit } from './composables/usePlanTemplateEdit';
import { usePlanTemplateEditEmissions } from './composables/usePlanTemplateEditEmissions';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const {
  loading,
  ready,
  updating,
  hasError,
  template,
  error,
  loadTemplate,
  updateTemplate,
  retry,
  actorRef,
} = usePlanTemplateEdit();

// Local form state
const nameInput = ref('');
const descriptionInput = ref('');
const periodConfigs = ref<PeriodConfig[]>([]);
const originalPeriodConfigs = ref<PeriodConfig[]>([]);
const originalName = ref('');
const originalDescription = ref('');

/**
 * Convert template periods (order + durations) to PeriodConfig[]
 * with synthetic start times for the Timeline component.
 */
function templatePeriodsToPeriodConfigs(
  periods: readonly TemplatePeriodConfig[],
  baseDate = new Date(),
): PeriodConfig[] {
  const configs: PeriodConfig[] = [];
  let currentStart = new Date(baseDate);

  for (const p of periods) {
    configs.push({
      id: crypto.randomUUID(),
      startTime: new Date(currentStart),
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    });
    currentStart = new Date(
      currentStart.getTime() + (p.fastingDuration + p.eatingWindow) * 3600000,
    );
  }

  return configs;
}

/** Deep clone PeriodConfig array preserving Date objects */
function clonePeriodConfigs(configs: PeriodConfig[]): PeriodConfig[] {
  return configs.map((config) => ({
    ...config,
    startTime: new Date(config.startTime),
  }));
}

/** Check if any changes were made (name, description, or periods) */
const hasChanges = computed(() => {
  if (nameInput.value !== originalName.value) return true;
  if (descriptionInput.value !== originalDescription.value) return true;
  if (periodConfigs.value.length !== originalPeriodConfigs.value.length) return true;

  return periodConfigs.value.some((config, index) => {
    const original = originalPeriodConfigs.value[index];
    if (!original) return true;
    return (
      config.fastingDuration !== original.fastingDuration ||
      config.eatingWindow !== original.eatingWindow
    );
  });
});

// Sync local state from actor when template loads or updates
watch(
  [template, updating],
  ([newTemplate, isSaving]) => {
    if (newTemplate && !isSaving) {
      nameInput.value = newTemplate.name;
      descriptionInput.value = newTemplate.description ?? '';
      originalName.value = newTemplate.name;
      originalDescription.value = newTemplate.description ?? '';

      const configs = templatePeriodsToPeriodConfigs(newTemplate.periods);
      periodConfigs.value = configs;
      originalPeriodConfigs.value = clonePeriodConfigs(configs);
    }
  },
  { immediate: true },
);

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

const handleAddPeriod = () => {
  if (periodConfigs.value.length >= MAX_PERIODS) return;
  const lastPeriod = periodConfigs.value[periodConfigs.value.length - 1];
  if (!lastPeriod) return;

  const periodDuration = lastPeriod.fastingDuration + lastPeriod.eatingWindow;
  const newStartTime = new Date(
    lastPeriod.startTime.getTime() + periodDuration * 60 * 60 * 1000,
  );

  periodConfigs.value = [
    ...periodConfigs.value,
    {
      id: crypto.randomUUID(),
      startTime: newStartTime,
      fastingDuration: lastPeriod.fastingDuration,
      eatingWindow: lastPeriod.eatingWindow,
    },
  ];
};

const handleRemovePeriod = () => {
  if (periodConfigs.value.length <= MIN_PERIODS) return;
  periodConfigs.value = periodConfigs.value.slice(0, -1);
};

const handleReset = () => {
  nameInput.value = originalName.value;
  descriptionInput.value = originalDescription.value;
  periodConfigs.value = clonePeriodConfigs(originalPeriodConfigs.value);
};

const handleSave = () => {
  updateTemplate({
    name: nameInput.value,
    description: descriptionInput.value,
    periods: periodConfigs.value.map((p) => ({
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    })),
  });
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
