<template>
  <div class="feelings-card">
    <div class="feelings-card__title">How did you feel?</div>
    <div class="feelings-card__row">
      <div class="feelings-card__icons">
        <div
          v-for="feeling in feelings"
          :key="feeling"
          :class="['feelings-card__icon-box', `feelings-card__icon-box--${feeling}`]"
        >
          <component :is="getFeelingIcon(feeling)" />
        </div>
        <div v-if="feelings.length === 0" class="feelings-card__empty">No feelings selected</div>
      </div>

      <Button
        type="button"
        icon="pi pi-pencil"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Edit Feelings"
        @click="$emit('edit')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FastingFeeling } from '@ketone/shared';
import type { Component } from 'vue';

import AnxiousIcon from '@/components/Icons/Feelings/AnxiousIcon.vue';
import CalmIcon from '@/components/Icons/Feelings/CalmIcon.vue';
import DizzyIcon from '@/components/Icons/Feelings/DizzyIcon.vue';
import EnergeticIcon from '@/components/Icons/Feelings/EnergeticIcon.vue';
import HungryIcon from '@/components/Icons/Feelings/HungryIcon.vue';
import IrritableIcon from '@/components/Icons/Feelings/IrritableIcon.vue';
import MotivatedIcon from '@/components/Icons/Feelings/MotivatedIcon.vue';
import NormalIcon from '@/components/Icons/Feelings/NormalIcon.vue';
import SufferingIcon from '@/components/Icons/Feelings/SufferingIcon.vue';
import SwollenIcon from '@/components/Icons/Feelings/SwollenIcon.vue';
import TiredIcon from '@/components/Icons/Feelings/TiredIcon.vue';
import WeakIcon from '@/components/Icons/Feelings/WeakIcon.vue';

defineProps<{
  feelings: readonly string[];
}>();

defineEmits<{
  (e: 'edit'): void;
}>();

const feelingIconMap: Record<FastingFeeling, Component> = {
  energetic: EnergeticIcon,
  motivated: MotivatedIcon,
  calm: CalmIcon,
  normal: NormalIcon,
  hungry: HungryIcon,
  tired: TiredIcon,
  swollen: SwollenIcon,
  anxious: AnxiousIcon,
  dizzy: DizzyIcon,
  weak: WeakIcon,
  suffering: SufferingIcon,
  irritable: IrritableIcon,
};

function getFeelingIcon(feeling: string): Component {
  return feelingIconMap[feeling as FastingFeeling] || NormalIcon;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.feelings-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid $color-primary-button-outline;
  border-radius: 8px;

  &__title {
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__icons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
  }

  &__icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    flex-shrink: 0;

    svg {
      width: 36px;
      height: 36px;
    }

    // Green feelings
    &--energetic,
    &--motivated,
    &--calm {
      background: rgba(45, 179, 94, 0.1);
    }

    // Blue feelings
    &--normal,
    &--hungry,
    &--tired {
      background: $color-light-blue;
    }

    // Purple feelings
    &--swollen,
    &--anxious,
    &--dizzy {
      background: $color-ultra-light-purple;
    }

    // Orange feelings
    &--weak,
    &--suffering,
    &--irritable {
      background: $color-orange-light;
    }
  }

  &__empty {
    font-size: 14px;
    color: $color-primary-button-text;
    opacity: 0.6;
  }
}
</style>
