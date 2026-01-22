<template>
  <div v-if="checkingPlan" class="cycle-view__loading">
    <Skeleton width="100%" height="112px" />
    <Skeleton width="100%" height="84px" />
    <Skeleton width="200px" height="40px" />
  </div>
  <Plan v-else-if="hasActivePlan" />
  <Cycle v-else />
</template>

<script setup lang="ts">
import { usePlan } from '@/views/plan/composables/usePlan';
import Skeleton from 'primevue/skeleton';
import { computed, onMounted } from 'vue';
import Cycle from './components/Cycle/Cycle.vue';
import Plan from './components/Plan/Plan.vue';

const { loadActivePlan, loadingActivePlan, hasActivePlan, noPlan } = usePlan();

const checkingPlan = computed(() => loadingActivePlan.value && !hasActivePlan.value && !noPlan.value);

onMounted(() => {
  loadActivePlan();
});
</script>

<style scoped lang="scss">
.cycle-view {
  &__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 2rem;
  }
}
</style>
