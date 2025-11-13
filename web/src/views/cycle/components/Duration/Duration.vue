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
        :ariaLabel="'Increase duration'"
        :disabled="completed"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatDuration } from '@/utils';
import { Event } from '@/views/cycle/actors/cycle.actor';
import { differenceInMinutes, startOfMinute, subHours } from 'date-fns';
import { computed } from 'vue';
import { Actor, type AnyActorLogic } from 'xstate';

interface Props {
  loading?: boolean;
  completed: boolean;
  cycleActor: Actor<AnyActorLogic>;
  endDate: Date;
  startDate: Date;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const normalizedStartDate = computed(() => startOfMinute(props.startDate));
const normalizedEndDate = computed(() => startOfMinute(props.endDate));
const totalCycleDuration = computed(() => {
  const totalMinutes = differenceInMinutes(normalizedEndDate.value, normalizedStartDate.value);
  return formatDuration(totalMinutes);
});

function incrementDuration() {
  props.cycleActor.send({ type: Event.INCREMENT_DURATION });
}

function decrementDuration() {
  const date = subHours(props.endDate, 1);

  if (props.cycleActor.getSnapshot().can({ type: Event.DECREASE_DURATION, date })) {
    props.cycleActor.send({ type: Event.DECREASE_DURATION, date });
  }
}
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
