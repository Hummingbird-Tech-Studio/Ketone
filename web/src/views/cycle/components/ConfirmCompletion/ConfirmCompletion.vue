<template>
  <Dialog
    :visible="visible"
    modal
    header="Confirm Completion"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleClose"
  >
    <div class="cycle-summary">
      <div class="cycle-summary__section">
        <div class="cycle-summary__label">Total Fasting Time:</div>
        <div class="cycle-summary__time">{{ totalFastingTime }}</div>
      </div>

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler">
          <div class="cycle-summary__scheduler-header">
            <div class="cycle-summary__scheduler-title">Start:</div>
            <Button
              type="button"
              icon="pi pi-calendar"
              rounded
              variant="outlined"
              severity="secondary"
              aria-label="Start Date"
            />
          </div>
          <div class="cycle-summary__scheduler-hour">{{ startHour }}</div>
          <div class="cycle-summary__scheduler-date">{{ startDateFormatted }}</div>
        </div>
      </div>

      <Divider />

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler">
          <div class="cycle-summary__scheduler-header">
            <div class="cycle-summary__scheduler-title">End:</div>
            <Button
              type="button"
              icon="pi pi-calendar"
              rounded
              variant="outlined"
              severity="secondary"
              aria-label="End Date"
            />
          </div>
          <div class="cycle-summary__scheduler-hour">{{ endHour }}</div>
          <div class="cycle-summary__scheduler-date">{{ endDateFormatted }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="cycle-summary__footer">
        <Button label="Close" outlined @click="handleClose" />
        <Button label="Save" :loading="false" @click="handleSave" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { formatDate, formatHour, formatTime } from '@/utils/formatting';
import { useSelector } from '@xstate/vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import type { ActorRefFrom } from 'xstate';
import type { cycleMachine } from '../../actors/cycle.actor';

const props = defineProps<{
  visible: boolean;
  actorRef: ActorRefFrom<typeof cycleMachine>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'complete'): void;
}>();

// Extract dates from actor context
const startDate = useSelector(props.actorRef, (state) => state.context.startDate);
const endDate = useSelector(props.actorRef, (state) => state.context.endDate);

// Calculate total fasting time (from start to now)
const totalFastingTime = computed(() => {
  const now = new Date();
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startDate.value.getTime()) / 1000));

  const SECONDS_PER_MINUTE = 60;
  const SECONDS_PER_HOUR = 60 * 60;

  const hours = Math.floor(elapsedSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((elapsedSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
  const seconds = elapsedSeconds % SECONDS_PER_MINUTE;

  return formatTime(hours, minutes, seconds);
});

// Format start date and time
const startHour = computed(() => formatHour(startDate.value));
const startDateFormatted = computed(() => formatDate(startDate.value));

// Format end date and time
const endHour = computed(() => formatHour(endDate.value));
const endDateFormatted = computed(() => formatDate(endDate.value));

function handleClose() {
  emit('update:visible', false);
}

function handleSave() {
  emit('complete');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.cycle-summary {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
  &__section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  &__label {
    align-self: center;
    font-size: 16px;
    color: $color-primary-button-text;
  }
  &__time {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    text-align: center;
    padding: 8px 0;
  }
  &__scheduler {
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  &__scheduler-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  &__scheduler-title {
    font-weight: 700;
    font-size: 16px;
    color: $color-primary-button-text;
  }
  &__scheduler-hour {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
  &__scheduler-date {
    margin-top: 5px;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
  &__footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
