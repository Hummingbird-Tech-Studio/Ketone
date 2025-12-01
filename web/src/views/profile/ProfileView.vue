<template>
  <div class="profile">
    <!-- Mobile: Back button when viewing form -->
    <div v-if="showFormMobile" class="profile__back">
      <Button icon="pi pi-chevron-left" label="Profile" variant="text" severity="secondary" @click="handleBack" />
    </div>

    <!-- Title: Only show when menu is visible (desktop always, mobile when not in form) -->
    <h1 v-if="!showFormMobile" class="profile__title">Profile</h1>

    <div class="profile__content">
      <!-- Desktop: Show menu and form side by side -->
      <!-- Mobile: Show menu OR form based on selection -->
      <div
        class="profile__menu"
        :class="{ 'profile__menu--hidden-mobile': showFormMobile }"
      >
        <ProfileMenu
          :selectedOption="selectedOption"
          @select="handleMenuSelect"
        />
      </div>

      <div
        class="profile__form"
        :class="{ 'profile__form--hidden-mobile': !showFormMobile }"
      >
        <PersonalInformationForm
          v-if="selectedOption === 'personal'"
          :profile="profile"
          :loading="showSkeleton"
          :saving="saving"
          @save="handleSave"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ProfileMenu, { type ProfileMenuOption } from './components/ProfileMenu.vue';
import PersonalInformationForm from './components/PersonalInformationForm.vue';
import { useProfile } from './composables/useProfile';
import { useProfileNotifications } from './composables/useProfileNotifications';

const { profile, showSkeleton, saving, loadProfile, saveProfile, actorRef } = useProfile();

useProfileNotifications(actorRef);

const selectedOption = ref<ProfileMenuOption | null>('personal');
const mobileFormVisible = ref(false);

const showFormMobile = computed(() => {
  return selectedOption.value !== null && mobileFormVisible.value;
});

function handleMenuSelect(option: ProfileMenuOption) {
  selectedOption.value = option;
  mobileFormVisible.value = true;
}

function handleBack() {
  mobileFormVisible.value = false;
}

function handleSave(data: { name: string | null; dateOfBirth: string | null }) {
  saveProfile(data);
}

onMounted(() => {
  loadProfile();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.profile {
  display: flex;
  flex-direction: column;
  width: 312px;
  margin: auto;
  gap: 16px;

  @media only screen and (min-width: $breakpoint-desktop-min-width) {
    width: 100%;
    max-width: 800px;
    padding: 24px;
  }

  &__back {
    display: flex;
    align-items: center;

    @media only screen and (min-width: $breakpoint-desktop-min-width) {
      display: none;
    }
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin: 0;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 24px;

    @media only screen and (min-width: $breakpoint-desktop-min-width) {
      flex-direction: row;
      gap: 48px;
    }
  }

  &__menu {
    @media only screen and (max-width: #{$breakpoint-desktop-min-width - 1px}) {
      &--hidden-mobile {
        display: none;
      }
    }
  }

  &__form {
    flex: 1;

    @media only screen and (max-width: #{$breakpoint-desktop-min-width - 1px}) {
      &--hidden-mobile {
        display: none;
      }
    }
  }
}
</style>
