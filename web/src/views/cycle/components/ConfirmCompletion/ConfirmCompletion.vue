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
        <div class="cycle-summary__time">25:51:50</div>
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
          <div class="cycle-summary__scheduler-hour">6:00 AM</div>
          <div class="cycle-summary__scheduler-date">Sun, Sep 23</div>
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
          <div class="cycle-summary__scheduler-hour">7:00 AM</div>
          <div class="cycle-summary__scheduler-date">Sun, Sep 23</div>
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
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import type { ActorRefFrom } from 'xstate';
import type { cycleMachine } from '../../actors/cycle.actor';

defineProps<{
  visible: boolean;
  actorRef: ActorRefFrom<typeof cycleMachine>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'complete'): void;
}>();

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
