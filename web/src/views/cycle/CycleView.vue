<template>
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
    <div v-else-if="cycle" class="cycle-data">
      <h2>Cycle Details</h2>
      <div class="cycle-info">
        <p><strong>ID:</strong> {{ cycle.id }}</p>
        <p><strong>Status:</strong> {{ cycle.status }}</p>
        <p><strong>Start Date:</strong> {{ formatDate(cycle.startDate) }}</p>
        <p><strong>End Date:</strong> {{ formatDate(cycle.endDate) }}</p>
        <p><strong>Created At:</strong> {{ formatDate(cycle.createdAt) }}</p>
        <p><strong>Updated At:</strong> {{ formatDate(cycle.updatedAt) }}</p>
      </div>
    </div>

    <!-- No Cycle State -->
    <div v-else class="no-cycle">
      <p>No cycle loaded. Please provide a cycle ID in the route params.</p>
      <p>Example: /cycle?id=your-cycle-id</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Effect } from 'effect';
import { getCycleProgram, type GetCycleSuccess } from './services/cycle.service';

const route = useRoute();

// Reactive state
const cycle = ref<GetCycleSuccess | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// Load cycle from the service
const loadCycle = async (cycleId: string) => {
  loading.value = true;
  error.value = null;
  cycle.value = null;

  try {
    const result = await Effect.runPromise(getCycleProgram(cycleId));
    cycle.value = result;
  } catch (err) {
    console.error('Failed to load cycle:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    loading.value = false;
  }
};

// Format date for display
const formatDate = (date: Date) => {
  return new Date(date).toLocaleString();
};

// Load cycle on mount if cycleId is provided in query params
onMounted(() => {
  const cycleId = route.query.id as string;
  if (cycleId) {
    loadCycle(cycleId);
  }
});
</script>

<style scoped lang="scss">
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
