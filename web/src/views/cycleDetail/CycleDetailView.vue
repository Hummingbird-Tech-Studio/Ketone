<template>
  <div class="cycle-detail">
    <div class="cycle-detail__back">
      <Button icon="pi pi-chevron-left" label="Statistics" variant="text" severity="secondary" @click="handleBack" />
    </div>

    <div class="cycle-detail__content-wrapper">
      <div class="cycle-detail__header">
        <h1 class="cycle-detail__title">Fast Overview</h1>
      </div>

      <div class="cycle-detail__content">
        <template v-if="showSkeleton">
          <div class="cycle-detail__summary">
            <div class="cycle-detail__total-time">
              <Skeleton width="120px" height="20px" border-radius="4px" />
              <Skeleton width="100px" height="30px" border-radius="4px" />
            </div>
            <Skeleton width="140px" height="40px" border-radius="20px" />
          </div>

          <div class="cycle-detail__times">
            <div class="cycle-detail__times__content">
              <Skeleton width="40px" height="16px" border-radius="4px" />
              <Skeleton width="40px" height="40px" border-radius="50%" />
            </div>
            <Skeleton width="180px" height="16px" border-radius="4px" />
            <Divider />
            <div class="cycle-detail__times__content">
              <Skeleton width="40px" height="16px" border-radius="4px" />
              <Skeleton width="40px" height="40px" border-radius="50%" />
            </div>
            <Skeleton width="180px" height="16px" border-radius="4px" />
          </div>
        </template>

        <template v-else-if="error">
          <div class="cycle-detail__error">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ errorMessage || 'Failed to load cycle details' }}</span>
          </div>
        </template>

        <template v-else>
          <div class="cycle-detail__summary">
            <div class="cycle-detail__total-time">
              <span class="cycle-detail__total-time__label">Total Fasting Time</span>
              <div class="cycle-detail__total-time__content">
                <ProgressSpinner v-if="loading" :style="{ width: '30px', height: '30px' }" severity="secondary" />
                <span v-else class="cycle-detail__total-time__value">{{ totalFastingTime }}</span>
              </div>
            </div>

            <div
              :class="[
                'cycle-detail__status',
                {
                  'cycle-detail__status--completed': isCompleted,
                  'cycle-detail__status--in-progress': !isCompleted,
                },
              ]"
            >
              <i
                :style="{
                  color: isCompleted ? '#2db35e' : '#ab43ea',
                }"
                :class="isCompleted ? 'pi pi-check' : 'pi pi-play-circle'"
              ></i>
              <span class="cycle-detail__status__text">{{ isCompleted ? 'Completed' : 'In Progress' }}</span>
            </div>
          </div>

          <div class="cycle-detail__times">
            <div class="cycle-detail__times__content">
              <div class="cycle-detail__times__label">Start:</div>
              <Button
                type="button"
                icon="pi pi-calendar"
                rounded
                variant="outlined"
                severity="secondary"
                aria-label="Start Date"
                @click="handleStartCalendarClick"
              />
            </div>
            <div>{{ startDate }}</div>
            <Divider />
            <div class="cycle-detail__times__content">
              <div class="cycle-detail__times__label">End:</div>
              <Button
                type="button"
                icon="pi pi-calendar"
                rounded
                variant="outlined"
                severity="secondary"
                aria-label="End Date"
                @click="handleEndCalendarClick"
              />
            </div>
            <div>{{ endDate }}</div>
          </div>
        </template>
      </div>

      <DeleteFastCard :loading="showSkeleton" :error="error" />
    </div>

    <DateTimePickerDialog
      v-if="dialogVisible"
      :visible="dialogVisible"
      :title="dialogTitle"
      :dateTime="dialogDate"
      :loading="updating"
      @update:visible="handleDialogVisibilityChange"
      @update:dateTime="handleDateUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import DeleteFastCard from '@/views/cycleDetail/components/DeleteFastCard.vue';
import { goal, type SchedulerView, start } from '@/views/cycle/domain/domain';
import { useCycleDetail } from '@/views/cycleDetail/composables/useCycleDetail';
import { useCycleDetailNotifications } from '@/views/cycleDetail/composables/useCycleDetailNotifications';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();

const cycleId = route.params.id as string;

const {
  loading,
  showSkeleton,
  error,
  errorMessage,
  isCompleted,
  startDate,
  endDate,
  totalFastingTime,
  loadCycle,
  cycle,
  updating,
  requestStartDateChange,
  requestEndDateChange,
  actorRef,
} = useCycleDetail(cycleId);

useCycleDetailNotifications(actorRef, {
  onUpdateComplete: () => {
    dialogVisible.value = false;
  },
});

const dialogVisible = ref(false);
const dialogType = shallowRef<SchedulerView>(start);
const isStartDialog = computed(() => dialogType.value._tag === 'Start');
const dialogTitle = computed(() => dialogType.value.name);
const dialogDate = computed(() => {
  if (!cycle.value) return new Date();
  return isStartDialog.value ? cycle.value.startDate : cycle.value.endDate;
});

onMounted(() => {
  loadCycle();
});

function handleBack() {
  router.push('/statistics');
}

function handleStartCalendarClick() {
  dialogType.value = start;
  dialogVisible.value = true;
}

function handleEndCalendarClick() {
  dialogType.value = goal;
  dialogVisible.value = true;
}

function handleDialogVisibilityChange(value: boolean) {
  dialogVisible.value = value;
}

function handleDateUpdate(newDate: Date) {
  if (!cycle.value) return;

  if (isStartDialog.value) {
    requestStartDateChange(newDate);
  } else {
    requestEndDateChange(newDate);
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.cycle-detail {
  --cd-status-completed-border-color: #2db35e;
  --cd-status-completed-background-color: #e2fae5;

  display: flex;
  flex-direction: column;
  width: 312px;
  margin: auto;
  gap: 16px;

  &__back {
    display: flex;
    align-items: center;
  }

  &__content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__header {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    background: white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    padding: 20px;

    &--loading {
      justify-content: center;
      align-items: center;
      min-height: 200px;
      gap: 12px;
    }

    :deep(.p-divider) {
      --p-divider-border-color: #{$color-purple};
    }
  }

  &__loading-text {
    font-size: 14px;
    color: $color-primary-button-text;
    opacity: 0.7;
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    color: $color-primary-button-text;

    i {
      font-size: 32px;
      color: $color-orange;
    }

    span {
      font-size: 14px;
      text-align: center;
    }
  }

  &__date {
    text-align: center;
    font-size: 16px;
    color: $color-primary-button-text;

    &-content {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 20px;
      min-width: 20px;
    }

    &-value {
      font-size: 16px;
      color: $color-primary-button-text;
      line-height: 1;
    }
  }

  &__summary {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }

  &__total-time {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;

    &__content {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      min-width: 30px;
    }

    &__label {
      font-size: 16px;
      color: $color-primary-button-text;
    }

    &__value {
      font-size: 24px;
      font-weight: 700;
      color: $color-primary-button-text;
      line-height: 1;
    }
  }

  &__status {
    display: flex;
    justify-content: space-evenly;
    align-items: center;
    height: 40px;
    border-radius: 20px;
    padding: 14px;
    gap: 8px;

    &--completed {
      background: var(--cd-status-completed-background-color);
      border: 1px solid var(--cd-status-completed-border-color);
    }

    &--in-progress {
      background: $color-light-purple;
      border: 1px solid $color-dark-purple;
    }

    &__text {
      color: $color-primary-button-text;
    }
  }

  &__status-badge {
    :deep(.p-button) {
      background: #22c55e !important;
      border-color: #22c55e !important;
      color: white !important;
      font-size: 12px !important;
      padding: 6px 12px !important;
      border-radius: 16px !important;

      .p-button-icon {
        font-size: 10px;
        margin-right: 4px;
      }
    }
  }

  &__times {
    &__content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    &__label {
      font-weight: 600;
      font-size: 16px;
      color: $color-primary-button-text;
    }

    &__value {
      font-size: 16px;
      color: $color-primary-button-text;
    }
  }
}
</style>
