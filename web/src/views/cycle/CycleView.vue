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
      :updating="updating"
      :progressPercentage="progressPercentage"
      :stage="stage"
      :completed="completed"
      :startDate="startDate"
      :endDate="endDate"
      :finishing="finishing"
      :idle="idle"
      :inProgress="inProgress"
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
      <Scheduler :loading="showSkeleton" :view="start" :date="startDate" :disabled="idle" @click="handleStartClick" />
    </div>

    <div class="cycle__schedule__scheduler cycle__schedule__scheduler--goal">
      <Scheduler :loading="showSkeleton" :view="goal" :date="endDate" @click="handleEndClick" />
    </div>
  </div>

  <DateTimePickerDialog
    :visible="timePickerDialog.visible.value"
    :title="timePickerDialog.currentView.value.name"
    :dateTime="timePickerDialog.date.value || new Date()"
    :loading="timePickerDialog.updating.value"
    @update:visible="handleDialogVisibilityChange"
    @update:dateTime="handleDateUpdate"
  />

  <div class="cycle__actions">
    <div class="cycle__actions__button">
      <ActionButton :loading="showSkeleton" :buttonText="buttonText" :isLoading="loading" @click="handleButtonClick" />
    </div>
  </div>
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { goal, start } from '@/views/cycle/domain/domain';
import { startOfMinute } from 'date-fns';
import { Match } from 'effect';
import { onMounted, onUnmounted } from 'vue';
import { Emit as CycleEmit, type EmitType as CycleEmitType, Event as CycleEvent } from './actors/cycle.actor';
import {
  Emit as DialogEmit,
  type EmitType as DialogEmitType,
  Event as DialogEvent,
} from './actors/schedulerDialog.actor';
import ActionButton from './components/ActionButton/ActionButton.vue';
import { useActionButton } from './components/ActionButton/useActionButton';
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

const {
  idle,
  inProgress,
  updating,
  loading,
  finishing,
  completed,
  startDate,
  endDate,
  showSkeleton,
  loadActiveCycle,
  actorRef,
} = useCycle();

useCycleNotifications(actorRef);

const { elapsedTime, remainingTime } = useTimer({
  cycleActor: actorRef,
  startDate,
  endDate,
});

const { progressPercentage, stage } = useProgressBar({
  cycleActor: actorRef,
  startDate,
  endDate,
});

const { duration, canDecrement, incrementDuration, decrementDuration } = useDuration({
  cycleActor: actorRef,
  startDate,
  endDate,
});

// Create single dialog actor
const timePickerDialog = useSchedulerDialog(start);

const { buttonText, handleButtonClick } = useActionButton({
  cycleActor: actorRef,
  idle,
  completed,
  inProgress,
});

// ============================================================================
// SCHEDULER HANDLERS
// ============================================================================

function handleStartClick() {
  timePickerDialog.open(start, startDate.value);
}

function handleEndClick() {
  timePickerDialog.open(goal, endDate.value);
}

function handleDialogVisibilityChange(value: boolean) {
  if (!value) {
    timePickerDialog.close();
  }
}

function handleDateUpdate(newDate: Date) {
  timePickerDialog.submit(newDate);
}

function handleDialogEmit(emitType: DialogEmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: DialogEmit.REQUEST_UPDATE }, (emit) => {
      const event = emit.view._tag === 'Start' ? CycleEvent.UPDATE_START_DATE : CycleEvent.UPDATE_END_DATE;

      actorRef.send({ type: event, date: startOfMinute(emit.date) });
    }),
  );
}

function handleCycleEmit(emitType: CycleEmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: CycleEmit.UPDATE_COMPLETE }, () => {
      timePickerDialog.actorRef.send({ type: DialogEvent.UPDATE_COMPLETE });
    }),
    Match.when({ type: CycleEmit.VALIDATION_INFO }, () => {
      timePickerDialog.actorRef.send({ type: DialogEvent.VALIDATION_FAILED });
    }),
  );
}

const subscriptions = [
  ...Object.values(DialogEmit).map((emit) => timePickerDialog.actorRef.on(emit, handleDialogEmit)),
  ...Object.values(CycleEmit).map((emit) => actorRef.on(emit, handleCycleEmit)),
];

onMounted(() => {
  loadActiveCycle();
});

onUnmounted(() => {
  subscriptions.forEach((sub) => sub.unsubscribe());
});
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
