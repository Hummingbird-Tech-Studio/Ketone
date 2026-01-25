<template>
  <Dialog
    :visible="visible"
    modal
    header="End Plan"
    :style="{ width: '380px' }"
    :draggable="false"
    @update:visible="handleVisibilityChange"
  >
    <div class="end-plan-confirm-dialog">
      <Chip v-if="activePlan.name" class="end-plan-confirm-dialog__plan-chip">
        {{ activePlan.name }}
      </Chip>

      <Divider class="end-plan-confirm-dialog__divider" />
      <div class="end-plan-confirm-dialog__stats">
        <span class="end-plan-confirm-dialog__stats-label">Total Fasting Time:</span>
        <span class="end-plan-confirm-dialog__stats-time">{{ totalFastingTime }}</span>
        <span class="end-plan-confirm-dialog__stats-duration">{{ completedPeriodsText }}</span>
      </div>
      <Divider class="end-plan-confirm-dialog__divider" />

      <div class="end-plan-confirm-dialog__dates">
        <div class="end-plan-confirm-dialog__date-row">
          <div class="end-plan-confirm-dialog__date-icon end-plan-confirm-dialog__date-icon--start">
            <StartTimeIcon />
          </div>
          <div class="end-plan-confirm-dialog__date-info">
            <div class="end-plan-confirm-dialog__date-label">Started:</div>
            <div class="end-plan-confirm-dialog__date-value">{{ formatFullDateTime(activePlan.startDate) }}</div>
          </div>
        </div>
        <div class="end-plan-confirm-dialog__date-row">
          <div class="end-plan-confirm-dialog__date-icon end-plan-confirm-dialog__date-icon--end">
            <EndTimeIcon />
          </div>
          <div class="end-plan-confirm-dialog__date-info">
            <div class="end-plan-confirm-dialog__date-label">Ends:</div>
            <div class="end-plan-confirm-dialog__date-value">{{ formatFullDateTime(new Date()) }}</div>
          </div>
        </div>
      </div>

      <div class="end-plan-confirm-dialog__timeline">
        <ActivePlanTimeline
          :activePlan="activePlan"
          :currentPeriod="currentPeriod"
          :activePlanActorRef="activePlanActorRef"
        />
      </div>

      <Message severity="info" icon="pi pi-info-circle" class="end-plan-confirm-dialog__info">
        Ending the plan will save your progress and cancel the remaining days.
      </Message>
    </div>

    <template #footer>
      <div class="end-plan-confirm-dialog__actions">
        <Button label="Cancel" severity="secondary" outlined @click="handleCancel" :disabled="loading" />
        <Button label="End Plan" severity="danger" @click="handleConfirm" :loading="loading" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import EndTimeIcon from '@/components/Icons/EndTime.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import { formatFullDateTime } from '@/utils';
import type { PeriodResponse, PlanWithPeriodsResponse } from '@ketone/shared';
import { computed } from 'vue';
import type { AnyActorRef } from 'xstate';
import { ActivePlanTimeline } from '../ActivePlanTimeline';

interface Props {
  visible: boolean;
  activePlan: PlanWithPeriodsResponse;
  currentPeriod: PeriodResponse | null;
  activePlanActorRef: AnyActorRef;
  loading?: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});
const emit = defineEmits<Emits>();

const totalFastingTime = computed(() => {
  const now = new Date();
  let totalMinutes = 0;

  for (const period of props.activePlan.periods) {
    if (now >= period.fastingEndDate) {
      // Fully completed fasting period
      const minutes = Math.floor((period.fastingEndDate.getTime() - period.fastingStartDate.getTime()) / 60000);
      totalMinutes += minutes;
    } else if (now >= period.fastingStartDate && now < period.fastingEndDate) {
      // Currently in fasting - count elapsed time
      const minutes = Math.floor((now.getTime() - period.fastingStartDate.getTime()) / 60000);
      totalMinutes += minutes;
    }
    // Periods in the future don't count
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
});

const completedPeriodsText = computed(() => {
  const now = new Date();
  const totalPeriods = props.activePlan.periods.length;
  const completedPeriods = props.activePlan.periods.filter((p) => now >= p.endDate).length;

  return `${completedPeriods} of ${totalPeriods} periods completed`;
});

function handleVisibilityChange(value: boolean) {
  emit('update:visible', value);
}

function handleCancel() {
  emit('update:visible', false);
}

function handleConfirm() {
  emit('confirm');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.end-plan-confirm-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__plan-chip {
    align-self: center;
    background-color: var(--p-blue-50);
    color: var(--p-blue-600);
    font-weight: 600;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__divider {
    margin: 0;
  }

  &__stats {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
  }

  &__stats-label {
    font-size: 14px;
    color: $color-primary-light-text;
  }

  &__stats-time {
    font-size: 28px;
    font-weight: 700;
    color: $color-primary-button-text;
    letter-spacing: 1px;
  }

  &__stats-duration {
    font-size: 14px;
    color: $color-primary-light-text;
  }

  &__dates {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__date-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba($color-primary-button-outline, 0.3);
    border-radius: 8px;
  }

  &__date-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    flex-shrink: 0;

    &--start {
      background: rgba(45, 179, 94, 0.1);
    }

    &--end {
      background: rgba(171, 67, 234, 0.1);
    }
  }

  &__date-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__date-label {
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__date-value {
    font-weight: 400;
    font-size: 13px;
    color: $color-primary-button-text;
  }

  &__timeline {
    max-height: 200px;
    overflow-y: auto;
  }

  &__info {
    margin: 0;

    :deep(.p-message-text) {
      font-size: 13px;
    }

    :deep(.p-message-icon) {
      font-size: 16px;
    }
  }

  &__actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
