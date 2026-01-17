<template>
  <div class="plans">
    <section v-for="section in sections" :key="section.id" class="plans__section">
      <div class="plans__section-header" :class="`plans__section-header--${section.theme}`">
        <div class="plans__section-icon">
          <i :class="section.icon"></i>
        </div>
        <div class="plans__section-info">
          <h2 class="plans__section-title">{{ section.title }}</h2>
          <p class="plans__section-description">{{ section.description }}</p>
        </div>
      </div>

      <div v-if="section.presets" class="plans__grid">
        <div v-for="preset in section.presets" :key="preset.id" class="plans__card" @click="selectPreset(preset)">
          <div class="plans__card-ratio">{{ preset.ratio }}</div>
          <div class="plans__card-duration">{{ preset.duration }}</div>
          <div class="plans__card-tagline" :class="`plans__card-tagline--${section.theme}`">
            {{ preset.tagline }}
          </div>
        </div>
      </div>

      <div v-if="section.id === 'custom'" class="plans__custom" @click="selectCustom">
        <i class="pi pi-sliders-h plans__custom-icon"></i>
        <span class="plans__custom-text">Create custom plan</span>
        <i class="pi pi-chevron-right plans__custom-arrow"></i>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { sections, type Preset } from './presets';

const router = useRouter();

const selectPreset = (preset: Preset) => {
  router.push(`/plans/${preset.id}`);
};

const selectCustom = () => {
  router.push('/plans/custom');
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.plans {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 312px;
  margin: auto;
  gap: 24px;
  padding-bottom: 24px;

  @media only screen and (min-width: $breakpoint-tablet-min-width) {
    max-width: 680px;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    background: $color-white;

    &--green {
      background: linear-gradient(135deg, rgba(#10b981, 0.1) 0%, rgba(#10b981, 0.05) 100%);

      .plans__section-icon {
        background: rgba(#10b981, 0.15);
        color: #10b981;
      }
    }

    &--teal {
      background: linear-gradient(135deg, rgba(#14b8a6, 0.1) 0%, rgba(#14b8a6, 0.05) 100%);

      .plans__section-icon {
        background: rgba(#14b8a6, 0.15);
        color: #14b8a6;
      }
    }

    &--purple {
      background: linear-gradient(135deg, rgba(#a855f7, 0.1) 0%, rgba(#a855f7, 0.05) 100%);

      .plans__section-icon {
        background: rgba(#a855f7, 0.15);
        color: #a855f7;
      }
    }

    &--pink {
      background: linear-gradient(135deg, rgba(#ec4899, 0.1) 0%, rgba(#ec4899, 0.05) 100%);

      .plans__section-icon {
        background: rgba(#ec4899, 0.15);
        color: #ec4899;
      }
    }

    &--blue {
      background: linear-gradient(135deg, rgba(#3b82f6, 0.1) 0%, rgba(#3b82f6, 0.05) 100%);

      .plans__section-icon {
        background: rgba(#3b82f6, 0.15);
        color: #3b82f6;
      }
    }
  }

  &__section-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    font-size: 18px;
  }

  &__section-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__section-title {
    font-size: 16px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__section-description {
    font-size: 13px;
    color: $color-primary-light-text;
    margin: 0;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    background: $color-white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: $color-primary-light-text;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
  }

  &__card-ratio {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    line-height: 1.2;
  }

  &__card-duration {
    font-size: 12px;
    color: $color-primary-light-text;
  }

  &__card-tagline {
    font-size: 13px;
    font-weight: 500;
    margin-top: 8px;

    &--green {
      color: #10b981;
    }

    &--teal {
      color: #14b8a6;
    }

    &--purple {
      color: #a855f7;
    }

    &--pink {
      color: #ec4899;
    }

    &--blue {
      color: #3b82f6;
    }
  }

  &__custom {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: $color-white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: $color-primary-light-text;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
  }

  &__custom-icon {
    font-size: 20px;
    color: #3b82f6;
  }

  &__custom-text {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: $color-primary-button-text;
  }

  &__custom-arrow {
    font-size: 14px;
    color: $color-primary-light-text;
  }
}
</style>
