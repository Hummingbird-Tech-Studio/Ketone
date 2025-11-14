<template>
  <div class="progress">
    <div class="progress__barSection">
      <template v-if="loading">
        <div class="progress__barSection__iconContainer">
          <Skeleton width="74px" height="74px" border-radius="50%" />
        </div>

        <div class="progress__barSection__barContainer">
          <Skeleton width="100%" height="100%" border-radius="10px" />
        </div>
      </template>

      <template v-else>
        <div
          :class="[
            'progress__barSection__iconContainer',
            {
              'progress__barSection__iconContainer--idle': idle,
            },
          ]"
          @click="handleIconClick"
        >
          <component v-if="idle" class="progress__icon" :is="IdleIcon" />
          <component v-else class="progress__icon" :is="stage.icon" data-test-name="Cycle.Progress.iconComponent" />
        </div>

        <div
          v-for="item in BLUR_ELEMENTS_COUNT"
          :key="'blur-div-' + item"
          :class="{
            progress__barSection__blur: isBlurActive,
            'progress__barSection__blur--rotate': isRotating,
            'progress__barSection__blur--paused': !isRotating,
          }"
          data-test-name="Cycle.Progress.blur"
        />

        <div class="progress__barSection__barContainer">
          <Dialog
            v-model:visible="open"
            modal
            :header="stage.name"
            :style="{ width: `${DIALOG_WIDTH}px` }"
            :draggable="false"
            @hide="closeDialog"
          >
            <div class="progress__stageInfo">
              <component class="progress__stageInfo__icon" :is="stage.icon" />
              <div class="progress__stageInfo__description">
                {{ stage.description }}
                <a class="progress__stageInfo__link" :href="stage.link" target="_blank">See more</a>
              </div>
              <Button
                class="progress__stageInfo__button"
                severity="secondary"
                @click="closeDialog"
                outlined
                label="Got it"
              />
            </div>
          </Dialog>

          <div
            v-if="isBlurActive"
            class="progress__bar"
            :style="{ width: progressPercentage + '%', background: gradientStyle }"
            data-test-name="Cycle.Progress.progressBar"
          >
            <div class="progress__bar__blur" :style="{ background: gradientStyle }"></div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import IdleIcon from '@/components/Icons/CycleStages/Idle.vue';
import type { FastingStage } from '@/views/cycle/domain/domain';
import { computed, ref } from 'vue';

interface Props {
  loading: boolean;
  completed: boolean;
  stage: FastingStage;
  endDate: Date;
  finishing: boolean;
  idle: boolean;
  inProgress: boolean;
  progressPercentage: number;
  startDate: Date;
}

// Dialog constants
const DIALOG_WIDTH = 290;

// Gradient stop positions
const GRADIENT_GREEN_STOP = 125;
const GRADIENT_ORANGE_STOP = 150;
const GRADIENT_PURPLE_STOP = 200;

// Animation constants
const BLUR_ELEMENTS_COUNT = 2;

const props = defineProps<Props>();

const open = ref(false);
const closeDialog = () => (open.value = false);

const gradientStyle = computed(() => {
  return `linear-gradient(90deg, #7abdff 0%, #96f4a0 ${GRADIENT_GREEN_STOP - props.progressPercentage}%, #ffc149 ${GRADIENT_ORANGE_STOP - props.progressPercentage}%, #d795ff ${GRADIENT_PURPLE_STOP - props.progressPercentage}%)`;
});
const isBlurActive = computed(() => props.inProgress || props.finishing || props.completed);
const isRotating = computed(() => props.inProgress);

function handleIconClick() {
  if (!props.idle) {
    open.value = true;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.progress {
  width: 100%;
  display: flex;

  &__icon {
    height: 74px;
    width: 74px;
    position: absolute;
    z-index: 1;
  }

  &__barSection {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 8px 0 14px;
    width: 100%;
    height: 40px;
    background: $color-light-grey;
    box-shadow:
      0 4px 4px rgba(170, 170, 170, 0.25),
      -6px -4px 4px rgba(255, 255, 255, 0.95);
    border-radius: 30px;

    &__barContainer {
      width: 100%;
      height: 8px;
      background: $color-light-grey;
      box-shadow:
        inset -2px -2px 3px rgba(224, 224, 224, 0.25),
        inset 2px 2px 3px rgba(144, 144, 144, 0.25);
      border-radius: 10px;
    }

    &__iconContainer {
      cursor: pointer;
      position: absolute;
      width: 74px;
      height: 74px;
      left: -29px;
      background: $color-light-grey;
      border-radius: 50px;
      z-index: 1;
      box-shadow: 0 4px 4px rgba(170, 170, 170, 0.25);

      &--idle {
        cursor: default;
      }
    }

    @keyframes rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    &__blur {
      position: absolute;
      width: 74px;
      height: 74px;
      left: -29px;
      background: conic-gradient(
        from 90deg at 46.59% 50%,
        $color-purple 0deg,
        $color-blue 89.71deg,
        $color-green 180.53deg,
        $color-orange 270.84deg,
        $color-purple 360deg
      );
      filter: blur(15px);
      border-radius: 30px;
      transition: filter 0.7s ease;
      animation-name: rotate;
      animation-duration: 15s;
      animation-iteration-count: infinite;
      animation-play-state: paused;

      &--rotate {
        animation-play-state: running;
      }

      &--paused {
        animation-play-state: paused;
      }
    }
  }

  &__bar {
    height: 100%;
    position: relative;
    border-radius: 10px;
    transition: width 0.3s ease-out;

    &__blur {
      position: absolute;
      width: 100%;
      height: 4px;
      filter: blur(3.5px);
      border-radius: 10px;
      transition: width 0.3s ease-out;
    }
  }

  &__stageInfo {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: $horizontal-gap;

    &__description {
      font-size: 12px;
      color: $color-primary-button-text;
    }

    &__button {
      margin-left: auto;
    }

    &__icon {
      height: 46px;
      width: 46px;
    }

    &__link {
      color: $color-dark-purple;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
