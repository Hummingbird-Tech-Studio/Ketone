<template>
  <PullToRefresh ref="pullToRefreshRef" @refresh="handleRefresh">
    <div class="cycle__status">
      <div class="cycle__status__timer">
        <Timer :loading="showSkeleton" :elapsed="elapsedTime" :remaining="remainingTime" />
      </div>
    </div>

    <div class="cycle__progress">
      <ProgressBar
        class="cycle__progress__bar"
        :loading="showSkeleton"
        :progressPercentage="progressPercentage"
        :stage="stage"
        :startDate="startDate"
        :endDate="endDate"
        :idle="showIdleIcon"
        :isBlurActive="isBlurActive"
        :isRotating="isRotating"
        :isEatingWindow="false"
      />
    </div>

    <div class="cycle__schedule">
      <div class="cycle__schedule__durationSection">
        <div class="cycle__schedule__durationSection__duration">
          <Duration
            :loading="showSkeleton"
            :completed="completed"
            :duration="duration"
            :canDecrement="canDecrement"
            @increment="incrementDuration"
            @decrement="decrementDuration"
          />
        </div>
      </div>

      <div class="cycle__schedule__scheduler">
        <Scheduler
          :loading="showSkeleton"
          :view="start"
          :date="startDate"
          :disabled="idle || completed"
          @click="handleStartClick"
        />
      </div>

      <div class="cycle__schedule__scheduler cycle__schedule__scheduler--goal">
        <Scheduler :loading="showSkeleton" :view="goal" :date="endDate" :disabled="completed" @click="handleEndClick" />
      </div>
    </div>

    <DateTimePickerDialog
      v-if="dialogVisible"
      :visible="dialogVisible"
      :title="dialogTitle"
      :dateTime="dialogDate || new Date()"
      :loading="dialogUpdating"
      @update:visible="handleDialogVisibilityChange"
      @update:dateTime="handleDateUpdate"
    />

    <ConfirmCompletion
      :visible="confirmCompletion"
      :loading="finishing"
      :actorRef="actorRef"
      @update:visible="handleConfirmDialogVisibility"
      @complete="handleComplete"
    />

    <Dialog
      :visible="completedDialogVisible"
      @update:visible="handleCompletedDialogVisibility"
      modal
      :closable="true"
      :draggable="false"
      header="Cycle Completed"
    >
      <CycleCompleted
        :summaryDuration="completedFastingTime"
        :loading="creating"
        @view-statistics="handleViewStatistics"
        @start-new-fast="handleStartNewFast"
      />
    </Dialog>

    <div class="cycle__actions">
      <div class="cycle__actions__button">
        <ActionButton
          :showSkeleton="showSkeleton"
          :buttonText="buttonText"
          :loading="isActionButtonLoading"
          @click="handleButtonClick"
        />
      </div>
    </div>
  </PullToRefresh>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { PullToRefresh, usePullToRefresh } from '@/components/PullToRefresh';
import { useFastingTimeCalculation } from '@/composables/useFastingTimeCalculation';
import { goal, start } from '@/views/cycle/domain/domain';
import Dialog from 'primevue/dialog';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Event as CycleEvent } from '../../actors/cycle.actor';
import { useCycle } from '../../composables/useCycle';
import { useCycleEmissions } from '../../composables/useCycleEmissions';
import { useSchedulerDialog } from '../../composables/useSchedulerDialog';
import ActionButton from '../ActionButton/ActionButton.vue';
import ConfirmCompletion from '../ConfirmCompletion/ConfirmCompletion.vue';
import CycleCompleted from '../CycleCompleted/CycleCompleted.vue';
import Duration from '../Duration/Duration.vue';
import { useDuration } from '../Duration/useDuration';
import ProgressBar from '../ProgressBar/ProgressBar.vue';
import { useProgressBar } from '../ProgressBar/useProgressBar';
import Scheduler from '../Scheduler/Scheduler.vue';
import Timer from '../Timer/Timer.vue';
import { useTimer } from '../Timer/useTimer';

const emit = defineEmits<{
  (e: 'hasActivePlan'): void;
}>();

const router = useRouter();
const toast = useToast();

const {
  creating,
  idle,
  loading,
  inProgress,
  updating,
  isActionButtonLoading,
  finishing,
  completed,
  confirmCompletion,
  cycleMetadata,
  startDate,
  endDate,
  showSkeleton,
  refreshCycle,
  buttonText,
  handleButtonClick,
  actorRef,
} = useCycle();

useCycleEmissions(actorRef, {
  onCycleError: (error) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
      life: 15000,
    });
  },
  onValidationInfo: (summary, detail) => {
    toast.add({
      severity: 'info',
      summary,
      detail,
      life: 15000,
    });
  },
  onHasActivePlan: () => emit('hasActivePlan'),
});

const { elapsedTime, remainingTime } = useTimer({ cycleActor: actorRef, cycleMetadata, startDate, endDate });

const { progressPercentage, stage } = useProgressBar({ cycleActor: actorRef, cycleMetadata, startDate, endDate });

const isBlurActive = computed(
  () => inProgress.value || updating.value || finishing.value || completed.value || confirmCompletion.value,
);
const isRotating = computed(() => inProgress.value || updating.value || confirmCompletion.value);
const showIdleIcon = computed(() => idle.value || creating.value);

const { duration, canDecrement, incrementDuration, decrementDuration } = useDuration({
  cycleActor: actorRef,
  startDate,
  endDate,
});

const completedFastingTime = useFastingTimeCalculation(startDate, endDate);

const {
  dialogVisible,
  dialogTitle,
  dialogDate,
  dialogUpdating,
  openStartDialog,
  openEndDialog,
  closeDialog,
  submitDialog,
} = useSchedulerDialog(actorRef);

const { pullToRefreshRef, handleRefresh } = usePullToRefresh(loading, refreshCycle);

const completedDialogVisible = ref(false);

watch(completed, (isCompleted) => {
  if (isCompleted) {
    completedDialogVisible.value = true;
  }
});

watch(inProgress, (isInProgress) => {
  if (isInProgress) {
    completedDialogVisible.value = false;
  }
});

function handleStartClick() {
  openStartDialog();
}

function handleEndClick() {
  openEndDialog();
}

function handleDialogVisibilityChange(value: boolean) {
  if (!value) {
    closeDialog();
  }
}

function handleDateUpdate(newDate: Date) {
  submitDialog(newDate);
}

function handleConfirmDialogVisibility(value: boolean) {
  if (!value) {
    actorRef.send({ type: CycleEvent.CANCEL_COMPLETION });
  }
}

function handleCompletedDialogVisibility(value: boolean) {
  completedDialogVisible.value = value;
}

function handleComplete() {
  actorRef.send({ type: CycleEvent.SAVE_EDITED_DATES });
}

function handleViewStatistics() {
  router.push('/statistics');
}

function handleStartNewFast() {
  actorRef.send({ type: CycleEvent.CREATE });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.cycle {
  &__status {
    height: 112px;
    display: flex;
    gap: 20px;
    justify-content: center;
    margin-bottom: 16px;

    &__timer {
      height: 110px;
      border: 1px solid $color-primary-button-outline;
      border-radius: 8px;
    }
  }

  &__progress {
    height: 84px;
    display: flex;
    justify-content: center;
    margin-bottom: 28px;

    &__bar {
      width: 335px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 0 8px 0 38px;
    }

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      &__bar {
        width: 628px;
        height: 84px;
      }
    }

    @media only screen and (min-width: $breakpoint-desktop-min-width) {
      &__bar {
        width: 864px;
        height: 84px;
      }
    }
  }

  &__schedule {
    display: flex;
    flex-wrap: wrap;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;

    &__durationSection {
      flex: 0 0 100%;
      margin: 0 auto;
      display: flex;
      justify-content: center;

      &__duration {
        width: 200px;
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }

    &__scheduler {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 312px;
      height: 110px;
      border: 1px solid $color-primary-button-outline;
      border-radius: 8px;
    }

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      flex-direction: row;
      align-items: center;
    }

    @media only screen and (min-width: $breakpoint-desktop-min-width) {
      &__durationSection {
        order: 2;
        flex: unset;
        margin: unset;
      }

      &__scheduler {
        order: 1;

        &--goal {
          order: 3;
        }
      }
    }
  }

  &__actions {
    height: 50px;
    display: flex;
    justify-content: center;

    &__button {
      display: flex;
      justify-content: center;
      width: 250px;
      height: auto;
    }

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      &__button {
        width: 450px;
      }
    }

    @media only screen and (min-width: $breakpoint-desktop-min-width) {
      height: 80px;

      &__button {
        align-self: flex-end;
        width: 568px;
        height: 80px;
      }
    }
  }
}

.cycle-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;

  h1 {
    font-size: 2rem;
    margin-bottom: 2rem;
  }

  .loading {
    font-size: 1.2rem;
    color: #666;
  }

  .error {
    color: #d32f2f;
    padding: 1rem;
    border: 1px solid #d32f2f;
    border-radius: 8px;
    background-color: #ffebee;

    h2 {
      margin-bottom: 0.5rem;
    }
  }
}
</style>
