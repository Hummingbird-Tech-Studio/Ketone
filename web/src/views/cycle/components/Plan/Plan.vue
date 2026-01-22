<template>
  <div class="plan">
    <div class="plan__header">
      <h2 class="plan__header__title">Active Plan</h2>
      <p v-if="activePlan" class="plan__header__name">{{ activePlan.name }}</p>
    </div>

    <div v-if="activePlan" class="plan__content">
      <p v-if="activePlan.description" class="plan__content__description">
        {{ activePlan.description }}
      </p>

      <div class="plan__content__progress">
        <span>{{ completedPeriodsCount }} / {{ totalPeriodsCount }} periods completed</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePlan } from '@/views/plan/composables/usePlan';

const { activePlan, completedPeriodsCount, totalPeriodsCount } = usePlan();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;

  &__header {
    text-align: center;
    margin-bottom: 1.5rem;

    &__title {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      color: $color-primary-button-text;
    }

    &__name {
      font-size: 1.25rem;
      font-weight: 600;
      color: $color-primary;
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;

    &__description {
      text-align: center;
      color: $color-primary-light-text;
      max-width: 400px;
    }

    &__progress {
      font-size: 1rem;
      color: $color-primary-light-text;
    }
  }
}
</style>
