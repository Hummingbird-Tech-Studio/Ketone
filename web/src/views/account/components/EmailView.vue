<template>
  <div class="email-view">
    <div class="email-view__card">
      <h2 class="email-view__title">Email</h2>
      <span class="email-view__email">{{ maskedEmail }}</span>
      <Button
        class="email-view__button"
        label="Change Email"
        variant="outlined"
        rounded
        @click="changeEmailModalVisible = true"
      />
    </div>

    <ChangeEmailModal
      :visible="changeEmailModalVisible"
      :current-email="currentEmail"
      @update:visible="changeEmailModalVisible = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '@/composables/useAuth';
import { computed, ref } from 'vue';
import { useAccount } from '../composables/useAccount';
import { useAccountNotifications } from '../composables/useAccountNotifications';
import ChangeEmailModal from './ChangeEmailModal.vue';

const changeEmailModalVisible = ref(false);

const { user } = useAuth();

// Setup account notifications at this level so they persist when modals close
const { actorRef } = useAccount();

useAccountNotifications(actorRef);

const currentEmail = computed(() => {
  return user.value?.email ?? '';
});

const maskedEmail = computed(() => {
  return maskEmail(currentEmail.value);
});

function maskEmail(email: string): string {
  if (!email) return '';

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;

  if (localPart.length <= 3) {
    return `${localPart[0]}${'*'.repeat(localPart.length - 1)}@${domain}`;
  }

  const visibleStart = localPart.slice(0, 3);
  const maskedPart = '*'.repeat(Math.min(localPart.length - 3, 10));
  return `${visibleStart}${maskedPart}@${domain}`;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.email-view {
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

  &__email {
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__button {
    align-self: center;
  }
}
</style>
