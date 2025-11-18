<template>
  <div class="scheduler">
    <template v-if="loading">
      <div class="scheduler__header">
        <Skeleton width="70px" height="14px" border-radius="4px" />
        <Skeleton width="40px" height="40px" border-radius="50%" />
      </div>
      <div class="scheduler__hour">
        <Skeleton width="100px" height="20px" border-radius="4px" />
      </div>
      <div class="scheduler__date">
        <Skeleton width="120px" height="14px" border-radius="4px" />
      </div>
    </template>

    <template v-else>
      <div class="scheduler__header">
        <div class="scheduler__title" data-test-name="Cycle.Scheduler.title">
          {{ view.name }}
        </div>
        <Button
          type="button"
          icon="pi pi-calendar"
          rounded
          variant="outlined"
          severity="secondary"
          aria-label="End Date"
          :disabled="disabled"
          @click="handleClick"
        />
        <DateTimePickerDialog
          :visible="visible"
          :title="view.name"
          :dateTime="date"
          :loading="updating"
          @update:visible="handleDialogVisibilityChange"
          @update:dateTime="handleDateUpdate"
        />
      </div>

      <div class="scheduler__hour" data-test-name="Cycle.Scheduler.hour">
        {{ formatHour(date) }}
      </div>

      <div class="scheduler__date" data-test-name="Cycle.Scheduler.date">
        {{ formatDate(date) }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { formatDate, formatHour } from '@/utils';
import type { SchedulerView } from '@/views/cycle/domain/domain';
import { toRefs } from 'vue';

interface Props {
  view: SchedulerView;
  date: Date;
  visible: boolean;
  disabled?: boolean;
  loading?: boolean;
  updating?: boolean;
}

interface Emits {
  (e: 'update:date', date: Date): void;
  (e: 'update:visible', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { date, disabled } = toRefs(props);

function handleClick() {
  if (disabled.value) {
    return;
  }

  emit('update:visible', true);
}

function handleDialogVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleDateUpdate(newDate: Date) {
  emit('update:date', newDate);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.scheduler {
  width: 100%;
  height: 100%;
  background: $color-light-grey;
  box-shadow:
    -2px 3px 4px 1px rgba(170, 170, 170, 0.25),
    inset 2px 2px 4.5px rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  padding: 8px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }

  &__title {
    font-style: normal;
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__hour {
    align-content: center;
    align-self: center;
    font-style: normal;
    font-weight: 500;
    font-size: 20px;
    color: $color-primary-button-text;
  }

  &__date {
    align-self: center;
    margin-top: 5px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
}
</style>
