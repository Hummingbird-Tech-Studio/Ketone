<template>
  <div class="profile-menu">
    <button
      class="profile-menu__item"
      :class="{ 'profile-menu__item--selected': selectedOption === 'personal' }"
      @click="$emit('select', 'personal')"
    >
      <div class="profile-menu__item__icon">
        <SmileFaceIcon />
      </div>
      <span class="profile-menu__item__label">Personal Information</span>
      <span class="profile-menu__item__arrow">›</span>
    </button>

    <button
      class="profile-menu__item"
      :class="{ 'profile-menu__item--disabled': true }"
      disabled
    >
      <div class="profile-menu__item__icon">
        <HeartIcon />
      </div>
      <span class="profile-menu__item__label">Physical Information</span>
      <span class="profile-menu__item__arrow">›</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import SmileFaceIcon from '@/components/Icons/SmileFaceIcon.vue';
import HeartIcon from '@/components/Icons/HeartIcon.vue';

export type ProfileMenuOption = 'personal' | 'physical';

defineProps<{
  selectedOption: ProfileMenuOption | null;
}>();

defineEmits<{
  select: [option: ProfileMenuOption];
}>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.profile-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 220px;

  &__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid #e9e9e9;
    border-radius: 8px;
    background: $color-white;
    cursor: pointer;
    transition: background-color 0.2s ease;
    width: 100%;
    text-align: left;

    &:hover:not(&--disabled) {
      background-color: #f5f5f5;
    }

    &--selected {
      background-color: #e6f7ef;
      border-color: #e6f7ef;

      &:hover {
        background-color: #d9f2e6;
      }
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }

    &__label {
      flex: 1;
      font-size: 14px;
      color: #333;
    }

    &__arrow {
      font-size: 18px;
      color: #999;
    }
  }
}
</style>
