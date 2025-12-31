<template>
  <div class="delete-account-view">
    <div class="delete-account-view__card">
      <h2 class="delete-account-view__title">Delete Account</h2>

      <Message severity="error" icon="pi pi-exclamation-triangle" class="delete-account-view__warning">
        <strong>Warning:</strong> This action is permanent and cannot be undone.
      </Message>

      <div class="delete-account-view__info">
        <p>Deleting your account will:</p>
        <ul>
          <li>Permanently remove all your data</li>
          <li>Delete your fasting history and statistics</li>
          <li>Remove your profile information</li>
        </ul>
      </div>

      <Button
        class="delete-account-view__button"
        label="Delete Account"
        severity="danger"
        variant="outlined"
        rounded
        @click="deleteAccountModalVisible = true"
      />
    </div>

    <DeleteAccountModal :visible="deleteAccountModalVisible" @update:visible="deleteAccountModalVisible = $event" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAccount } from '../composables/useAccount';
import { useAccountNotifications } from '../composables/useAccountNotifications';
import DeleteAccountModal from './DeleteAccountModal.vue';

const deleteAccountModalVisible = ref(false);

// Setup account notifications at this level so they persist when modals close
const { actorRef } = useAccount();
useAccountNotifications(actorRef);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.delete-account-view {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    padding: 20px;
  }

  &__warning {
    margin-top: 0;
  }

  &__info {
    font-size: 14px;
    color: $color-primary-button-text;
    line-height: 1.5;

    p {
      margin: 0 0 8px 0;
    }

    ul {
      margin: 0;
      padding-left: 20px;
    }

    li {
      margin-bottom: 4px;
    }
  }

  &__button {
    align-self: center;
  }
}
</style>
