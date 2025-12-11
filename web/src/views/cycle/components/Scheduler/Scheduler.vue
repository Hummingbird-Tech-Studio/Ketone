<template>
  <div class="scheduler" :class="{ 'scheduler--start': isStart, 'scheduler--end': !isStart }">
    <template v-if="loading">
      <div class="scheduler__icon">
        <Skeleton width="32px" height="32px" border-radius="8px" />
      </div>
      <div class="scheduler__content">
        <Skeleton width="80px" height="14px" border-radius="4px" />
        <Skeleton width="100px" height="24px" border-radius="4px" />
        <Skeleton width="90px" height="14px" border-radius="4px" />
      </div>
      <div class="scheduler__action">
        <Skeleton width="32px" height="32px" border-radius="50%" />
      </div>
    </template>

    <template v-else>
      <div class="scheduler__icon">
        <component :is="isStart ? StartTimeIcon : EndTimeIcon" />
      </div>
      <div class="scheduler__content">
        <div class="scheduler__title" data-test-name="Cycle.Scheduler.title">
          {{ view.name }}
        </div>
        <div class="scheduler__hour" data-test-name="Cycle.Scheduler.hour">
          {{ formatHour(date) }}
        </div>
        <div class="scheduler__date" data-test-name="Cycle.Scheduler.date">
          {{ formatDate(date) }}
        </div>
      </div>
      <Button
        type="button"
        icon="pi pi-calendar"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Select date"
        :disabled="disabled"
        @click="handleClick"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import EndTimeIcon from '@/components/Icons/EndTime.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import { formatDate, formatHour } from '@/utils';
import type { SchedulerView } from '@/views/cycle/domain/domain';
import { computed, toRefs } from 'vue';

interface Props {
  view: SchedulerView;
  date: Date;
  disabled?: boolean;
  loading?: boolean;
}

interface Emits {
  (e: 'click'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { disabled, view } = toRefs(props);

const isStart = computed(() => view.value._tag === 'Start');

function handleClick() {
  if (disabled.value) {
    return;
  }

  emit('click');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.scheduler {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  // background: $color-light-grey;
  // box-shadow:
  //   -2px 3px 4px 1px rgba(170, 170, 170, 0.25),
  //   inset 2px 2px 4.5px rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  padding: 16px;

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  &--start &__icon {
    background: rgba(45, 179, 94, 0.1);
  }

  &--end &__icon {
    background: rgba(171, 67, 234, 0.1);
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__hour {
    // font-weight: 600;
    font-size: 20px;
    color: $color-primary-button-text;
  }

  &__date {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-light-text;
  }

  &__action {
    flex-shrink: 0;
  }
}
</style>
