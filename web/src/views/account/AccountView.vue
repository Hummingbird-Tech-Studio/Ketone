<template>
  <div class="account">
    <!-- Mobile: Back button when viewing form -->
    <div class="account__back" :class="{ 'account__back--visible-mobile': mobileFormVisible }">
      <Button icon="pi pi-chevron-left" label="Account" variant="text" severity="secondary" @click="handleBack" />
    </div>

    <!-- Title: Always visible on desktop, hidden on mobile when viewing form -->
    <h1 class="account__title" :class="{ 'account__title--hidden-mobile': mobileFormVisible }">Account</h1>

    <div class="account__content">
      <!-- Desktop: Show menu and form side by side -->
      <!-- Mobile: Show menu OR form based on selection -->
      <div class="account__menu" :class="{ 'account__menu--hidden-mobile': mobileFormVisible }">
        <div class="account__list">
          <RouterLink to="/account/email" class="account__list__item" @click="handleMenuClick">
            <div class="account__list__item__icon account__list__item__icon--email">
              <i class="pi pi-envelope" />
            </div>
            <span class="account__list__item__text">Email Address</span>
            <span class="account__list__item__arrow pi pi-chevron-right" />
          </RouterLink>
        </div>
      </div>

      <div class="account__form" :class="{ 'account__form--hidden-mobile': !mobileFormVisible }">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const mobileFormVisible = ref(false);

function handleMenuClick() {
  mobileFormVisible.value = true;
}

function handleBack() {
  mobileFormVisible.value = false;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.account {
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

      &:hover {
        background: $color-light-grey;
      }

      &.router-link-active {
        background: $color-light-grey;
        border-right: 1px solid;
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

        &--email {
          background: $color-ultra-light-blue;
          color: $color-dark-blue;
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
