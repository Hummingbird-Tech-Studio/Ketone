<template>
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
      :idle="idle"
      :isBlurActive="isBlurActive"
      :isRotating="isRotating"
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
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { useFastingTimeCalculation } from '@/composables/useFastingTimeCalculation';
import { goal, start } from '@/views/cycle/domain/domain';
import Dialog from 'primevue/dialog';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Event as CycleEvent } from './actors/cycle.actor';
import ActionButton from './components/ActionButton/ActionButton.vue';
import ConfirmCompletion from './components/ConfirmCompletion/ConfirmCompletion.vue';
import CycleCompleted from './components/CycleCompleted/CycleCompleted.vue';
import Duration from './components/Duration/Duration.vue';
import { useDuration } from './components/Duration/useDuration';
import ProgressBar from './components/ProgressBar/ProgressBar.vue';
import { useProgressBar } from './components/ProgressBar/useProgressBar';
import Scheduler from './components/Scheduler/Scheduler.vue';
import Timer from './components/Timer/Timer.vue';
import { useTimer } from './components/Timer/useTimer';
import { useCycle } from './composables/useCycle';
import { useCycleNotifications } from './composables/useCycleNotifications';
import { useSchedulerDialog } from './composables/useSchedulerDialog';

const router = useRouter();

const {
  creating,
  idle,
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
  loadActiveCycle,
  buttonText,
  handleButtonClick,
  actorRef,
} = useCycle();

useCycleNotifications(actorRef);

const { elapsedTime, remainingTime } = useTimer({
  cycleActor: actorRef,
  cycleMetadata,
  startDate,
  endDate,
});

const { progressPercentage, stage } = useProgressBar({
  cycleActor: actorRef,
  cycleMetadata,
  startDate,
  endDate,
});

const isBlurActive = computed(
  () => inProgress.value || updating.value || finishing.value || completed.value || confirmCompletion.value,
);
const isRotating = computed(() => inProgress.value || updating.value || confirmCompletion.value);

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

onMounted(() => {
  loadActiveCycle();
});

// actorRef.subscribe((snapshot) => {
//   console.log('🔄 Machine State:', snapshot.value);
//   console.log('🔄 Machine Context:', snapshot.context);
// });
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
    }
  }

  &__progress {
    height: 84px;
    display: flex;
    justify-content: center;
    margin-bottom: 16px;

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
      height: 110px;
      width: 268px;
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

  .cycle-data {
    max-width: 600px;
    width: 100%;

    h2 {
      margin-bottom: 1.5rem;
      font-size: 1.5rem;
    }

    .cycle-info {
      background-color: #f5f5f5;
      padding: 1.5rem;
      border-radius: 8px;
      text-align: left;

      p {
        margin: 0.75rem 0;
        font-size: 1rem;

        strong {
          color: #333;
          margin-right: 0.5rem;
        }
      }
    }
  }

  .no-cycle {
    color: #666;
    padding: 2rem;

    p {
      margin: 0.5rem 0;
      font-size: 1.1rem;

      &:last-child {
        font-size: 0.9rem;
        color: #999;
      }
    }
  }
}
</style>
