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
        <div class="plan-template-edit__card">
          <div class="plan-template-edit__field">
            <label for="template-name" class="plan-template-edit__label">Name</label>
            <InputText
              id="template-name"
              v-model="nameInput"
              :invalid="!!validationErrors['name']"
              @input="clearValidationErrors"
            />
            <small v-if="validationErrors['name']" class="plan-template-edit__field-error">
              {{ validationErrors['name'][0] }}
            </small>
          </div>

          <div class="plan-template-edit__field">
            <div class="plan-template-edit__label-row">
              <label for="template-description" class="plan-template-edit__label">Description</label>
              <span
                class="plan-template-edit__char-count"
                :class="{ 'plan-template-edit__char-count--warning': descriptionRemainingChars < 50 }"
              >
                {{ descriptionRemainingChars }}
              </span>
            </div>
            <Textarea
              id="template-description"
              v-model="descriptionInput"
              rows="3"
              auto-resize
              :invalid="!!validationErrors['description']"
              @input="clearValidationErrors"
            />
            <small v-if="validationErrors['description']" class="plan-template-edit__field-error">
              {{ validationErrors['description'][0] }}
            </small>
          </div>

          <div class="plan-template-edit__field">
            <label class="plan-template-edit__label">Periods</label>
            <div class="plan-template-edit__periods">
              <div
                v-for="(period, index) in periodInputs"
                :key="index"
                class="plan-template-edit__period"
              >
                <span class="plan-template-edit__period-label">Period {{ index + 1 }}</span>
                <div class="plan-template-edit__period-fields">
                  <div class="plan-template-edit__period-field">
                    <label :for="`fasting-${index}`" class="plan-template-edit__period-field-label">Fasting (h)</label>
                    <InputNumber
                      :id="`fasting-${index}`"
                      v-model="period.fastingDuration"
                      :min="1"
                      :max="168"
                      :step="0.25"
                      @input="clearValidationErrors"
                    />
                  </div>
                  <div class="plan-template-edit__period-field">
                    <label :for="`eating-${index}`" class="plan-template-edit__period-field-label">Eating (h)</label>
                    <InputNumber
                      :id="`eating-${index}`"
                      v-model="period.eatingWindow"
                      :min="1"
                      :max="24"
                      :step="0.25"
                      @input="clearValidationErrors"
                    />
                  </div>
                </div>
              </div>
            </div>
            <small v-if="validationErrors['periods']" class="plan-template-edit__field-error">
              {{ validationErrors['periods'][0] }}
            </small>
          </div>
        </div>
      </div>

      <div class="plan-template-edit__footer">
        <Button
          label="Save"
          outlined
          :loading="updating"
          :disabled="updating"
          @click="handleSave"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { makePlanTemplateId, MAX_PLAN_DESCRIPTION_LENGTH } from './domain/plan-template.model';
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
  validationErrors,
  clearValidationErrors,
  loadTemplate,
  updateTemplate,
  retry,
  actorRef,
} = usePlanTemplateEdit();

// Local form state
const nameInput = ref('');
const descriptionInput = ref('');
const periodInputs = reactive<Array<{ fastingDuration: number; eatingWindow: number }>>([]);

const descriptionRemainingChars = computed(() =>
  MAX_PLAN_DESCRIPTION_LENGTH - (descriptionInput.value?.length ?? 0),
);

// Sync local state from actor when template loads or updates
watch(
  [template, updating],
  ([newTemplate, isSaving]) => {
    if (newTemplate && !isSaving) {
      nameInput.value = newTemplate.name;
      descriptionInput.value = newTemplate.description ?? '';
      periodInputs.length = 0;
      for (const p of newTemplate.periods) {
        periodInputs.push({
          fastingDuration: p.fastingDuration,
          eatingWindow: p.eatingWindow,
        });
      }
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
  router.push('/plan-templates');
};

const handleSave = () => {
  updateTemplate({
    name: nameInput.value,
    description: descriptionInput.value,
    periods: periodInputs.map((p) => ({
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

  &__card {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    background: $color-white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__label {
    font-size: 13px;
    font-weight: 600;
    color: $color-primary-button-text;
  }

  &__char-count {
    font-size: 12px;
    color: $color-primary-light-text;

    &--warning {
      color: $color-warning;
    }
  }

  &__field-error {
    color: $color-error;
    font-size: 12px;
  }

  &__periods {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__period {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: rgba($color-primary-button-outline, 0.3);
    border-radius: 8px;
  }

  &__period-label {
    font-size: 13px;
    font-weight: 500;
    color: $color-primary-button-text;
  }

  &__period-fields {
    display: flex;
    gap: 12px;
  }

  &__period-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__period-field-label {
    font-size: 12px;
    color: $color-primary-light-text;
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
