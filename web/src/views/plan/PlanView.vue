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
type Preset = {
  id: string;
  ratio: string;
  fastingDuration: number;
  eatingWindow: number;
  duration: string;
  tagline: string;
};

type Section = {
  id: string;
  title: string;
  description: string;
  icon: string;
  theme: 'green' | 'teal' | 'purple' | 'pink' | 'blue';
  presets?: Preset[];
};

const sections: Section[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    description: 'Perfect for your first fasting experience',
    icon: 'pi pi-sparkles',
    theme: 'green',
    presets: [
      {
        id: '12:12',
        ratio: '12:12',
        fastingDuration: 12,
        eatingWindow: 12,
        duration: '12h fasting · 12h eating',
        tagline: 'Gentle start',
      },
      {
        id: '13:11',
        ratio: '13:11',
        fastingDuration: 13,
        eatingWindow: 11,
        duration: '13h fasting · 11h eating',
        tagline: 'Easy progress',
      },
      {
        id: '14:10',
        ratio: '14:10',
        fastingDuration: 14,
        eatingWindow: 10,
        duration: '14h fasting · 10h eating',
        tagline: 'Daily balance',
      },
      {
        id: '15:9',
        ratio: '15:9',
        fastingDuration: 15,
        eatingWindow: 9,
        duration: '15h fasting · 9h eating',
        tagline: 'Step up',
      },
    ],
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Balanced plans to deepen your practice',
    icon: 'pi pi-star',
    theme: 'teal',
    presets: [
      {
        id: '16:8',
        ratio: '16:8',
        fastingDuration: 16,
        eatingWindow: 8,
        duration: '16h fasting · 8h eating',
        tagline: 'The classic protocol',
      },
      {
        id: '17:7',
        ratio: '17:7',
        fastingDuration: 17,
        eatingWindow: 7,
        duration: '17h fasting · 7h eating',
        tagline: 'Extended balance',
      },
      {
        id: '18:6',
        ratio: '18:6',
        fastingDuration: 18,
        eatingWindow: 6,
        duration: '18h fasting · 6h eating',
        tagline: 'Metabolic balance',
      },
      {
        id: '19:5',
        ratio: '19:5',
        fastingDuration: 19,
        eatingWindow: 5,
        duration: '19h fasting · 5h eating',
        tagline: 'Focused routine',
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'For those who already know their rhythm',
    icon: 'pi pi-bolt',
    theme: 'purple',
    presets: [
      {
        id: '20:4',
        ratio: '20:4',
        fastingDuration: 20,
        eatingWindow: 4,
        duration: '20h fasting · 4h eating',
        tagline: 'High discipline',
      },
      {
        id: '21:3',
        ratio: '21:3',
        fastingDuration: 21,
        eatingWindow: 3,
        duration: '21h fasting · 3h eating',
        tagline: 'Peak control',
      },
      {
        id: '22:2',
        ratio: '22:2',
        fastingDuration: 22,
        eatingWindow: 2,
        duration: '22h fasting · 2h eating',
        tagline: 'Extreme focus',
      },
      {
        id: '23:1',
        ratio: '23:1 OMAD',
        fastingDuration: 23,
        eatingWindow: 1,
        duration: '23h fasting · 1h eating',
        tagline: 'One meal a day',
      },
    ],
  },
  {
    id: 'long-fasts',
    title: 'Long Fasts',
    description: 'Extended fasting for deeper metabolic benefits',
    icon: 'pi pi-clock',
    theme: 'pink',
    presets: [
      {
        id: '24h',
        ratio: '24h',
        fastingDuration: 24,
        eatingWindow: 0,
        duration: '1 day of fasting',
        tagline: 'Full-day fast',
      },
      {
        id: '36h',
        ratio: '36h',
        fastingDuration: 36,
        eatingWindow: 0,
        duration: '1.5 days of fasting',
        tagline: 'Extended reset',
      },
      {
        id: '48h',
        ratio: '48h',
        fastingDuration: 48,
        eatingWindow: 0,
        duration: '2 days of fasting',
        tagline: 'Deep metabolic shift',
      },
      {
        id: '72h',
        ratio: '72h',
        fastingDuration: 72,
        eatingWindow: 0,
        duration: '3 days of fasting',
        tagline: 'Extended endurance',
      },
    ],
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Build a plan that fits your lifestyle',
    icon: 'pi pi-cog',
    theme: 'blue',
  },
];

const selectPreset = (preset: Preset) => {
  console.log('Selected preset:', preset);
  // TODO: Navigate to plan creation with preset values
};

const selectCustom = () => {
  console.log('Selected custom');
  // TODO: Navigate to custom plan creation
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
