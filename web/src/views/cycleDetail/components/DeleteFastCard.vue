<template>
  <div v-if="loading" class="delete-fast-card delete-fast-card--skeleton">
    <Skeleton width="100px" height="21px" border-radius="4px" />
    <div class="delete-fast-card__description-skeleton">
      <Skeleton width="100%" height="14px" border-radius="4px" />
      <Skeleton width="80%" height="14px" border-radius="4px" />
      <Skeleton width="30%" height="14px" border-radius="4px" />
    </div>
    <Skeleton width="120px" height="38px" border-radius="20px" class="delete-fast-card__button-skeleton" />
  </div>

  <div v-else-if="!error" class="delete-fast-card">
    <h2 class="delete-fast-card__title">Delete Fast</h2>
    <p class="delete-fast-card__description">
      This action will permanently delete your fast and all associated data.
      <strong>This cannot be undone.</strong>
    </p>
    <Button class="delete-fast-card__button" variant="outlined" label="Delete Fast" rounded severity="danger" />
  </div>
</template>

<script setup lang="ts">
interface Props {
  loading: boolean;
  error: boolean;
}

defineProps<Props>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.delete-fast-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: white;
  border: 1px solid $color-error;
  border-radius: 12px;
  padding: 20px;

  &--skeleton {
    border-color: $color-primary-button-outline;
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-error;
    margin: 0;
  }

  &__description {
    font-size: 14px;
    color: $color-primary-button-text;
    margin: 0;
    line-height: 1.5;

    strong {
      font-weight: 700;
    }
  }

  &__description-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__button {
    align-self: center;
  }

  &__button-skeleton {
    align-self: center;
  }
}
</style>
