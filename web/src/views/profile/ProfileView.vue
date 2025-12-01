<template>
  <div class="profile">
    <!-- Mobile: Back button when viewing form -->
    <div class="profile__back" :class="{ 'profile__back--visible-mobile': showFormMobile }">
      <Button icon="pi pi-chevron-left" label="Profile" variant="text" severity="secondary" @click="handleBack" />
    </div>

    <!-- Title: Always visible on desktop, hidden on mobile when viewing form -->
    <h1 class="profile__title" :class="{ 'profile__title--hidden-mobile': showFormMobile }">Profile</h1>

    <div class="profile__content">
      <!-- Desktop: Show menu and form side by side -->
      <!-- Mobile: Show menu OR form based on selection -->
      <div class="profile__menu" :class="{ 'profile__menu--hidden-mobile': showFormMobile }">
        <div class="profile__list">
          <RouterLink to="/profile/personal" class="profile__list__item" @click="handleMenuClick">
            <div class="profile__list__item__icon profile__list__item__icon--personal">
              <SmileFaceIcon />
            </div>
            <span class="profile__list__item__text">Personal Information</span>
            <span class="profile__list__item__arrow pi pi-chevron-right" />
          </RouterLink>

          <RouterLink to="/profile/physical" class="profile__list__item" @click="handleMenuClick">
            <div class="profile__list__item__icon profile__list__item__icon--physical">
              <HeartIcon />
            </div>
            <span class="profile__list__item__text">Physical Information</span>
            <span class="profile__list__item__arrow pi pi-chevron-right" />
          </RouterLink>
        </div>
      </div>

      <div class="profile__form" :class="{ 'profile__form--hidden-mobile': !showFormMobile }">
        <RouterView :profile="profile" :loading="showSkeleton" :saving="saving" @save="handleSave" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import HeartIcon from '@/components/Icons/HeartIcon.vue';
import SmileFaceIcon from '@/components/Icons/SmileFaceIcon.vue';
import { useProfile } from './composables/useProfile';
import { useProfileNotifications } from './composables/useProfileNotifications';

const { profile, showSkeleton, saving, loadProfile, saveProfile, actorRef } = useProfile();

useProfileNotifications(actorRef);

const mobileFormVisible = ref(false);

const showFormMobile = computed(() => mobileFormVisible.value);

function handleMenuClick() {
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

  @media only screen and (min-width: $breakpoint-tablet-min-width) {
    width: 100%;
    max-width: 800px;
    padding: 24px;
  }

  &__back {
    display: none;
    align-items: center;

    @media only screen and (max-width: #{$breakpoint-tablet-min-width - 1px}) {
      &--visible-mobile {
        display: flex;
      }
    }
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin: 0;

    @media only screen and (max-width: #{$breakpoint-tablet-min-width - 1px}) {
      &--hidden-mobile {
        display: none;
      }
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 24px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      flex-direction: row;
      gap: 48px;
    }
  }

  &__menu {
    @media only screen and (max-width: #{$breakpoint-tablet-min-width - 1px}) {
      &--hidden-mobile {
        display: none;
      }
    }
  }

  &__form {
    flex: 1;
    min-width: 312px;

    @media only screen and (max-width: #{$breakpoint-tablet-min-width - 1px}) {
      &--hidden-mobile {
        display: none;
      }
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    height: 48px;
    min-width: 290px;

    &__item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px;
      background: white;
      border: 1px solid $color-primary-button-outline;
      text-decoration: none;
      color: $color-primary-button-text;
      transition: all 0.1s ease;
      cursor: pointer;

      &:first-child {
        border-bottom: none;
      }

      &:hover {
        background: $color-light-grey;
      }

      &.router-link-active {
        background: $color-light-grey;
        border-right: 2px solid;
        border-right-color: $color-primary;
      }

      &__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 6px;
        flex-shrink: 0;
        font-size: 18px;

        &--personal {
          background: #f6e6ff;
        }

        &--physical {
          background: #e2fae5;
          color: #2db35e;
        }
      }

      &__text {
        flex: 1;
        font-size: 14px;
        font-weight: 500;
      }

      &__arrow {
        color: $color-primary-button-text;
        font-size: 14px;
        opacity: 0.5;
      }
    }
  }
}
</style>
