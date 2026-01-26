<template>
  <div class="plans">
    <div v-if="isChecking" class="plans__loading-overlay">
      <ProgressSpinner :style="{ width: '40px', height: '40px' }" />
    </div>

    <BlockingResourcesDialog
      :visible="showBlockDialog"
      :has-cycle="hasCycle"
      :has-plan="hasPlan"
      @update:visible="handleBlockDialogClose"
      @go-to-cycle="goToCycle"
      @go-to-plan="goToPlan"
    />

    <PresetConfigDialog
      v-if="selectedPreset"
      :visible="showConfigDialog"
      :preset="selectedPreset"
      :theme="selectedTheme"
      @update:visible="handleDialogClose"
      @confirm="handleConfirm"
    />

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
        <button
          v-for="preset in section.presets"
          :key="preset.id"
          type="button"
          class="plans__card"
          :aria-label="`${preset.ratio} fasting plan - ${preset.tagline}`"
          @click="selectPreset(preset, section.theme)"
        >
          <div class="plans__card-ratio">{{ preset.ratio }}</div>
          <div class="plans__card-duration">{{ preset.duration }}</div>
          <div class="plans__card-tagline" :class="`plans__card-tagline--${section.theme}`">
            {{ preset.tagline }}
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import BlockingResourcesDialog from './components/BlockingResourcesDialog.vue';
import PresetConfigDialog, { type PresetInitialConfig } from './components/PresetConfigDialog.vue';
import { useBlockingResourcesDialog } from './composables/useBlockingResourcesDialog';
import { useBlockingResourcesDialogEmissions } from './composables/useBlockingResourcesDialogEmissions';
import { sections, type Preset, type Theme } from './presets';

const router = useRouter();
const {
  showDialog: showBlockDialog,
  isChecking,
  hasCycle,
  hasPlan,
  startCheck,
  dismiss,
  goToCycle,
  goToPlan,
  actorRef,
} = useBlockingResourcesDialog();

const showConfigDialog = ref(false);
const selectedPreset = ref<Preset | null>(null);
const selectedTheme = ref<Theme>('green');

// Handle emissions
useBlockingResourcesDialogEmissions(actorRef, {
  onProceed: () => {
    if (selectedPreset.value) {
      showConfigDialog.value = true;
    }
  },
  onNavigateToCycle: () => {
    router.push('/cycle');
  },
  onNavigateToPlan: () => {
    router.push('/cycle');
  },
});

const handleBlockDialogClose = (value: boolean) => {
  if (!value) {
    selectedPreset.value = null;
    dismiss();
  }
};

const selectPreset = (preset: Preset, theme: Theme) => {
  selectedPreset.value = preset;
  selectedTheme.value = theme;
  startCheck();
};

const handleDialogClose = (value: boolean) => {
  showConfigDialog.value = value;
  if (!value) {
    selectedPreset.value = null;
  }
};

const handleConfirm = (config: PresetInitialConfig) => {
  showConfigDialog.value = false;
  router.push({
    path: `/plans/${selectedPreset.value!.id}`,
    query: {
      fastingDuration: config.fastingDuration.toString(),
      eatingWindow: config.eatingWindow.toString(),
      periods: config.periods.toString(),
    },
  });
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
      background: linear-gradient(135deg, rgba($color-theme-green, 0.1) 0%, rgba($color-theme-green, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-green, 0.15);
        color: $color-theme-green;
      }
    }

    &--teal {
      background: linear-gradient(135deg, rgba($color-theme-teal, 0.1) 0%, rgba($color-theme-teal, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-teal, 0.15);
        color: $color-theme-teal;
      }
    }

    &--purple {
      background: linear-gradient(135deg, rgba($color-theme-purple, 0.1) 0%, rgba($color-theme-purple, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-purple, 0.15);
        color: $color-theme-purple;
      }
    }

    &--pink {
      background: linear-gradient(135deg, rgba($color-theme-pink, 0.1) 0%, rgba($color-theme-pink, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-pink, 0.15);
        color: $color-theme-pink;
      }
    }

    &--blue {
      background: linear-gradient(135deg, rgba($color-theme-blue, 0.1) 0%, rgba($color-theme-blue, 0.05) 100%);

      .plans__section-icon {
        background: rgba($color-theme-blue, 0.15);
        color: $color-theme-blue;
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
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    width: 100%;

    &:hover {
      border-color: $color-primary-light-text;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    &:focus-visible {
      outline: 2px solid $color-primary;
      outline-offset: 2px;
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
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;

    &--green {
      color: $color-theme-green;
    }

    &--teal {
      color: $color-theme-teal;
    }

    &--purple {
      color: $color-theme-purple;
    }

    &--pink {
      color: $color-theme-pink;
    }

    &--blue {
      color: $color-theme-blue;
    }
  }

  &__loading-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.7);
    z-index: 1000;
  }
}
</style>
