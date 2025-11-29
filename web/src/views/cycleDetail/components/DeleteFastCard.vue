<template>
  <div class="delete-fast-card">
    <h2 class="delete-fast-card__title">Delete Fast</h2>
    <p class="delete-fast-card__description">
      This action will permanently delete your fast and all associated data.
      <strong>This cannot be undone.</strong>
    </p>
    <Button class="delete-fast-card__button" variant="outlined" label="Delete Fast" rounded severity="danger" />
  </div>
</template>

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

  &__button {
    align-self: center;
  }
}
</style>
