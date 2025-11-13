<template>
  <div class="duration">
    <template v-if="loading">
      <Skeleton width="32px" height="32px" border-radius="50%" />
      <Skeleton width="100px" height="32px" border-radius="10px" />
      <Skeleton width="32px" height="32px" border-radius="50%" />
    </template>

    <template v-else>
      <Button
        type="button"
        icon="pi pi-minus"
        rounded
        severity="secondary"
        size="small"
        :onClick="decrementDuration"
        :onHoldStart="() => startAutoRepeat(TimeUnitAction.Decrement)"
        :onHoldEnd="stopAutoRepeat"
        :ariaLabel="'Decrease duration'"
        :disabled="completed"
      />
      <div class="duration__hours">
        {{ totalCycleDuration }}
      </div>
      <Button
        type="button"
        icon="pi pi-plus"
        rounded
        severity="secondary"
        size="small"
        :onClick="incrementDuration"
        :onHoldStart="() => startAutoRepeat(TimeUnitAction.Increment)"
        :onHoldEnd="stopAutoRepeat"
        :ariaLabel="'Increase duration'"
        :disabled="completed"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatDuration } from '@/utils';
import { Event } from '@/views/cycle/actors/cycle.actor';
import { differenceInMinutes, startOfMinute } from 'date-fns';
import { computed, onUnmounted, ref } from 'vue';
import { Actor, type AnyActorLogic } from 'xstate';

enum TimeUnitAction {
  Increment = 'increment',
  Decrement = 'decrement',
}

interface Props {
  loading?: boolean;
  completed: boolean;
  cycleActor: Actor<AnyActorLogic>;
  endDate: Date;
  idle: boolean;
  initialDuration: number;
  startDate: Date;
}

const RAPID_CHANGE_INTERVAL = 150;
const INITIAL_DELAY = 500;

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const normalizedStartDate = computed(() => startOfMinute(props.startDate));
const normalizedEndDate = computed(() => startOfMinute(props.endDate));
const totalCycleDuration = computed(() => {
  const totalMinutes = differenceInMinutes(normalizedEndDate.value, normalizedStartDate.value);
  return formatDuration(totalMinutes);
});
const autoRepeatTimer = ref<number | null>(null);
const autoRepeatAction = ref<TimeUnitAction | null>(null);

function incrementDuration() {
  props.cycleActor.send({ type: Event.INCREMENT_DURATION });
}

function decrementDuration() {
  const date = new Date(props.endDate);
  date.setHours(date.getHours() - 1);

  if (props.cycleActor.getSnapshot().can({ type: Event.DECREASE_DURATION, date })) {
    props.cycleActor.send({ type: Event.DECREASE_DURATION, date });
  }
}

function startAutoRepeat(action: TimeUnitAction) {
  if (props.completed) return;

  autoRepeatAction.value = action;

  autoRepeatTimer.value = window.setTimeout(() => {
    repeatAction();
  }, INITIAL_DELAY);
}

function repeatAction() {
  if (!autoRepeatAction.value || props.completed) return;

  if (autoRepeatAction.value === TimeUnitAction.Increment) {
    incrementDuration();
  } else {
    decrementDuration();
  }

  autoRepeatTimer.value = window.setTimeout(() => {
    repeatAction();
  }, RAPID_CHANGE_INTERVAL);
}

function stopAutoRepeat() {
  if (autoRepeatTimer.value) {
    clearTimeout(autoRepeatTimer.value);
    autoRepeatTimer.value = null;
  }
  autoRepeatAction.value = null;
}

onUnmounted(() => {
  stopAutoRepeat();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.duration {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: space-evenly;

  &__hours {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100px;
    height: 32px;
    background: $color-light-grey;
    border: 1px solid $color-primary-button-outline;
    border-radius: 10px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
}
</style>
