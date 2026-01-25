<template>
  <PullToRefresh ref="pullToRefreshRef" @refresh="handleRefresh">
    <!-- Completing Plan State (loading) -->
    <div v-if="completingPlan || endingPlan" class="plan__completing">
      <i class="pi pi-spin pi-spinner plan__completing__spinner"></i>
      <p class="plan__completing__message">{{ endingPlan ? 'Ending your plan...' : 'Completing your plan...' }}</p>
    </div>

    <!-- Complete Plan Error State -->
    <div v-else-if="completePlanError && activePlan" class="plan__error">
      <div class="plan__error__icon">
        <i class="pi pi-exclamation-circle"></i>
      </div>
      <h2 class="plan__error__title">Unable to Complete Plan</h2>
      <p class="plan__error__message">
        {{ completeErrorMessage || 'An error occurred while completing your plan.' }}
      </p>
      <Button label="Try Again" icon="pi pi-refresh" @click="retryComplete" class="plan__error__retry-btn" />
    </div>

    <!-- End Plan Error State -->
    <div v-else-if="endPlanError && activePlan" class="plan__error">
      <div class="plan__error__icon">
        <i class="pi pi-exclamation-circle"></i>
      </div>
      <h2 class="plan__error__title">Unable to End Plan</h2>
      <p class="plan__error__message">
        {{ endErrorMessage || 'An error occurred while ending your plan.' }}
      </p>
      <Button label="Try Again" icon="pi pi-refresh" @click="retryEnd" class="plan__error__retry-btn" />
    </div>

    <!-- Completed State -->
    <div v-else-if="allPeriodsCompleted && activePlan" class="plan__completed">
      <div class="plan__completed__icon">
        <i class="pi pi-check-circle"></i>
      </div>
      <h2 class="plan__completed__title">Congratulations!</h2>
      <p class="plan__completed__message">You have successfully completed your fasting plan.</p>
      <p v-if="activePlan.name" class="plan__completed__plan-name">
        {{ activePlan.name }}
      </p>
      <p class="plan__completed__stats">
        {{ totalPeriodsCount }} {{ totalPeriodsCount === 1 ? 'period' : 'periods' }} completed
      </p>

      <div class="plan__timeline plan__timeline--completed">
        <ActivePlanTimeline :activePlan="activePlan" :currentPeriod="currentPeriod" :activePlanActorRef="actorRef" />
      </div>
    </div>

    <!-- Active Plan State -->
    <template v-else>
      <div v-if="waitingForPlanStart" class="plan__header plan__header--waiting">
        <span class="plan__header__status"> Plan starts in {{ timeUntilPlanStart }} </span>
      </div>
      <div
        v-else-if="inFastingWindow || inEatingWindow"
        :class="[
          'plan__header',
          {
            'plan__header--fasting': inFastingWindow,
            'plan__header--eating': inEatingWindow,
          },
        ]"
      >
        <span class="plan__header__status">
          {{ inFastingWindow ? "You're fasting!" : 'Eating Window!' }}
        </span>
      </div>

      <div class="plan__status">
        <div class="plan__status__timer">
          <Timer :loading="showSkeleton" :elapsed="elapsedTime" :remaining="remainingTime" />
        </div>
      </div>

      <div class="plan__progress">
        <ProgressBar
          class="plan__progress__bar"
          :loading="showSkeleton"
          :progressPercentage="progressPercentage"
          :stage="stage"
          :startDate="fastingStartDate"
          :endDate="fastingEndDate"
          :idle="!showProgressBar"
          :isBlurActive="showProgressBar"
          :isRotating="isActive"
          :isEatingWindow="inEatingWindow"
        />
      </div>

      <div class="plan__schedule">
        <div class="plan__schedule__card">
          <PlanTimeCard
            :loading="showSkeleton"
            :title="scheduleCardTitles.start"
            :date="windowBounds.start"
            variant="start"
          />
        </div>

        <div class="plan__schedule__card">
          <PlanTimeCard
            :loading="showSkeleton"
            :title="scheduleCardTitles.end"
            :date="windowBounds.end"
            variant="end"
          />
        </div>
      </div>

      <div v-if="activePlan && !showSkeleton" class="plan__info">
        <p v-if="activePlan.description" class="plan__info__description">
          {{ activePlan.description }}
        </p>
        <p class="plan__info__periods">Period {{ completedPeriodsCount + 1 }} of {{ totalPeriodsCount }}</p>
      </div>

      <div v-if="activePlan && !showSkeleton" class="plan__timeline">
        <ActivePlanTimeline :activePlan="activePlan" :currentPeriod="currentPeriod" :activePlanActorRef="actorRef" />
      </div>

      <div v-if="canEndPlan && activePlan && !showSkeleton" class="plan__end-plan">
        <Button
          label="End Plan"
          severity="danger"
          outlined
          rounded
          @click="handleEndPlanClick"
          class="plan__end-plan__btn"
        />
      </div>
    </template>
  </PullToRefresh>

  <!-- End Plan Confirm Dialog -->
  <EndPlanConfirmDialog
    v-if="activePlan"
    v-model:visible="showEndPlanConfirmDialog"
    :activePlan="activePlan"
    :currentPeriod="currentPeriod"
    :activePlanActorRef="actorRef"
    :loading="endingPlan"
    @confirm="handleEndPlanConfirm"
  />

  <!-- Plan Ended Dialog -->
  <PlanEndedDialog
    v-model:visible="showPlanEndedDialog"
    @viewStatistics="handleViewStatistics"
    @startNewFast="handleStartNewFast"
    @startNewPlan="handleStartNewPlan"
  />
</template>

<script setup lang="ts">
import { PullToRefresh, usePullToRefresh } from '@/components/PullToRefresh';
import { MILLISECONDS_PER_HOUR } from '@/shared/constants';
import { getFastingStageByHours } from '@/views/cycle/domain/domain';
import { differenceInMilliseconds } from 'date-fns';
import { useToast } from 'primevue/usetoast';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useActivePlan } from '../../composables/useActivePlan';
import { useActivePlanEmissions } from '../../composables/useActivePlanEmissions';
import { useActivePlanTimer } from '../../composables/useActivePlanTimer';
import { ActivePlanTimeline } from '../ActivePlanTimeline';
import PlanTimeCard from '../PlanTimeCard/PlanTimeCard.vue';
import ProgressBar from '../ProgressBar/ProgressBar.vue';
import Timer from '../Timer/Timer.vue';
import EndPlanConfirmDialog from './EndPlanConfirmDialog.vue';
import PlanEndedDialog from './PlanEndedDialog.vue';

const emit = defineEmits<{
  (e: 'noActivePlan'): void;
}>();

const toast = useToast();

const router = useRouter();

const {
  loading,
  waitingForPlanStart,
  inFastingWindow,
  inEatingWindow,
  completingPlan,
  completePlanError,
  allPeriodsCompleted,
  endingPlan,
  endPlanError,
  activePlan,
  currentPeriod,
  windowPhase,
  completeErrorMessage,
  endErrorMessage,
  endedAt,
  showSkeleton,
  isActive,
  canEndPlan,
  completedPeriodsCount,
  totalPeriodsCount,
  refresh,
  retryComplete,
  endPlan,
  retryEnd,
  actorRef,
} = useActivePlan();

useActivePlanEmissions(actorRef, {
  onPlanError: (error) => {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
      life: 15000,
    });
  },
  onNoActivePlan: () => emit('noActivePlan'),
  onPlanEnded: () => {
    showEndPlanConfirmDialog.value = false;
    showPlanEndedDialog.value = true;
  },
  onPlanEndError: (error) => {
    showEndPlanConfirmDialog.value = false;
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
      life: 15000,
    });
  },
});

const { now, elapsedTime, remainingTime, progressPercentage, fastingStartDate, fastingEndDate, windowBounds } =
  useActivePlanTimer({
    activePlanActor: actorRef,
    currentPeriod,
    windowPhase,
    endedAt,
  });

// Show progress bar when active OR when plan was ended (frozen state)
const showProgressBar = computed(() => isActive.value || endedAt.value !== null);

const scheduleCardTitles = computed(() => ({
  start: inEatingWindow.value ? 'Start Eating' : 'Start Fast',
  end: inEatingWindow.value ? 'End Eating' : 'End Fast',
}));

// Calculate fasting stage based on hours elapsed
const stage = computed(() => {
  if (!currentPeriod.value) {
    return getFastingStageByHours(0);
  }

  const now = new Date();
  const diffInMs = differenceInMilliseconds(now, currentPeriod.value.startDate);
  const hours = Math.floor(diffInMs / MILLISECONDS_PER_HOUR);

  return getFastingStageByHours(hours);
});

// Calculate countdown time until plan starts
const timeUntilPlanStart = computed(() => {
  if (!waitingForPlanStart.value || !currentPeriod.value) return null;
  const diffMs = currentPeriod.value.fastingStartDate.getTime() - now.value.getTime();
  if (diffMs <= 0) return null;

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

const { pullToRefreshRef, handleRefresh } = usePullToRefresh(loading, refresh);

// End Plan Dialog State
const showEndPlanConfirmDialog = ref(false);
const showPlanEndedDialog = ref(false);

function handleEndPlanClick() {
  showEndPlanConfirmDialog.value = true;
}

function handleEndPlanConfirm() {
  endPlan();
}

function handleViewStatistics() {
  showPlanEndedDialog.value = false;
  router.push('/statistics');
}

function handleStartNewFast() {
  showPlanEndedDialog.value = false;
  emit('noActivePlan');
}

function handleStartNewPlan() {
  showPlanEndedDialog.value = false;
  router.push('/plans');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan {
  &__header {
    text-align: center;
    margin-bottom: 1rem;

    &--waiting &__status {
      color: $color-primary-button-text;
    }

    &--fasting &__status {
      color: $color-blue;
    }

    &--eating &__status {
      color: $color-coral;
    }

    &__status {
      font-weight: 700;
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
  }

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

    &__card {
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
  }

  &__info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;

    &__description {
      text-align: center;
      color: $color-primary-light-text;
      max-width: 400px;
      word-break: break-word;
    }

    &__periods {
      font-size: 14px;
      color: $color-primary-button-text;
    }
  }

  &__timeline {
    max-width: 312px;
    margin: 0 auto;
    width: 100%;
    padding-bottom: 1rem;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      max-width: 680px;
    }

    &--completed {
      margin-top: 2rem;
    }
  }

  &__end-plan {
    display: flex;
    justify-content: center;

    &__btn {
      min-width: 120px;
    }
  }

  &__completing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 1rem;
    text-align: center;

    &__spinner {
      font-size: 48px;
      color: $color-primary;
      margin-bottom: 1rem;
    }

    &__message {
      font-size: 16px;
      color: $color-primary-light-text;
    }
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem;
    text-align: center;

    &__icon {
      font-size: 64px;
      color: #e74c3c;
      margin-bottom: 1rem;

      .pi {
        font-size: inherit;
      }
    }

    &__title {
      font-size: 24px;
      font-weight: 700;
      color: $color-primary-button-text;
      margin: 0 0 0.5rem 0;
    }

    &__message {
      font-size: 16px;
      color: $color-primary-light-text;
      margin: 0 0 1.5rem 0;
      max-width: 300px;
    }

    &__retry-btn {
      min-width: 150px;
    }
  }

  &__completed {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem;
    text-align: center;

    &__icon {
      font-size: 64px;
      color: #70c07a;
      margin-bottom: 1rem;

      .pi {
        font-size: inherit;
      }
    }

    &__title {
      font-size: 28px;
      font-weight: 700;
      color: $color-primary-button-text;
      margin: 0 0 0.5rem 0;
    }

    &__message {
      font-size: 16px;
      color: $color-primary-light-text;
      margin: 0 0 1rem 0;
      max-width: 300px;
    }

    &__plan-name {
      font-size: 18px;
      font-weight: 600;
      color: $color-primary-button-text;
      margin: 0 0 0.5rem 0;
    }

    &__stats {
      font-size: 14px;
      color: $color-primary-light-text;
      margin: 0;
    }
  }
}
</style>
