<template>
  <div class="cycle__status">
    <div class="cycle__status__timer">
      <Timer :loading="showSkeleton" :cycleActor="actorRef" :startDate="startDate" :endDate="endDate" />
    </div>
  </div>

  <div class="cycle__progress">
    <ProgressBar
      class="cycle__progress__bar"
      :loading="showSkeleton"
      :cycleActor="actorRef"
      :completed="completed"
      :startDate="startDate"
      :endDate="endDate"
      :finishing="finishing"
      :idle="idle"
      :inProgress="inProgress"
    />
  </div>

  <div class="cycle-view">
    <h1>Cycle View</h1>

    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <p>Loading cycle...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error">
      <h2>Error</h2>
      <p>{{ error }}</p>
    </div>

    <!-- Success State -->
    <div v-else-if="cycleData" class="cycle-data">
      <h2>Cycle Details</h2>
      <div class="cycle-info">
        <p><strong>ID:</strong> {{ cycleData.id }}</p>
        <p><strong>Status:</strong> {{ cycleData.status }}</p>
        <p><strong>Start Date:</strong> {{ formatDate(cycleData.startDate) }}</p>
        <p><strong>End Date:</strong> {{ formatDate(cycleData.endDate) }}</p>
        <p><strong>Created At:</strong> {{ formatDate(cycleData.createdAt) }}</p>
        <p><strong>Updated At:</strong> {{ formatDate(cycleData.updatedAt) }}</p>
      </div>
    </div>

    <!-- No Cycle State -->
    <div v-else class="no-cycle">
      <p>No cycle available.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Emit } from './actors/cycle.actor';
import ProgressBar from './components/ProgressBar/ProgressBar.vue';
import Timer from './components/Timer/Timer.vue';
import { useCycle } from './composables/useCycle';

// Use cycle composable
const {
  idle,
  inProgress,
  loading,
  finishing,
  completed,
  cycleData,
  startDate,
  endDate,
  showSkeleton,
  loadActiveCycle,
  actorRef,
} = useCycle();

// Error handling through emitted events
const error = ref<string | null>(null);

const subscriptions = [
  // Listen to cycle error events
  actorRef.on(Emit.CYCLE_ERROR, (event) => {
    error.value = event.error;
  }),
  // Clear error when cycle is loaded successfully
  actorRef.on(Emit.CYCLE_LOADED, () => {
    error.value = null;
  }),
];

// Format date for display
const formatDate = (date: Date) => {
  return new Date(date).toLocaleString();
};

// Load active cycle on mount
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
