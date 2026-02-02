<template>
  <div class="plan-config-card">
    <div class="plan-config-card__start">
      <div class="plan-config-card__start-icon">
        <StartTimeIcon />
      </div>
      <div class="plan-config-card__start-info">
        <div class="plan-config-card__start-label">Start:</div>
        <div class="plan-config-card__start-value">{{ formattedStartDate }}</div>
      </div>
      <Button
        type="button"
        icon="pi pi-pencil"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Edit Start Date"
        @click="showDatePicker = true"
      />
    </div>

    <DateTimePickerDialog
      v-if="showDatePicker"
      :visible="showDatePicker"
      title="Start Date"
      :dateTime="startDate"
      :loading="savingStartDate"
      @update:visible="handleDialogVisibilityChange"
      @update:dateTime="handleDateUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  startDate: Date;
  savingStartDate?: boolean;
}>();

const emit = defineEmits<{
  'update:startDate': [value: Date];
}>();

const showDatePicker = ref(false);

const formattedStartDate = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(props.startDate);
});

const handleDialogVisibilityChange = (value: boolean) => {
  if (!value && props.savingStartDate) return;
  showDatePicker.value = value;
};

const handleDateUpdate = (newDate: Date) => {
  emit('update:startDate', newDate);
};

watch(
  () => props.savingStartDate,
  (saving, wasSaving) => {
    if (!saving && wasSaving) {
      showDatePicker.value = false;
    }
  },
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan-config-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background: $color-white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;

  &__start {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    background: rgba($color-primary-button-outline, 0.3);
    border-radius: 8px;
  }

  &__start-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba($color-theme-green, 0.1);
    border-radius: 8px;
    flex-shrink: 0;
  }

  &__start-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__start-label {
    font-weight: 600;
    font-size: 16px;
    color: $color-primary-button-text;
  }

  &__start-value {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
}
</style>
