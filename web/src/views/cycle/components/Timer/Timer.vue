<template>
  <div class="timer">
    <template v-if="loading">
      <div class="timer__icon">
        <Skeleton width="32px" height="32px" border-radius="8px" />
      </div>
      <div class="timer__content">
        <Skeleton width="100px" height="14px" border-radius="4px" />
        <Skeleton width="80px" height="26px" border-radius="4px" />
      </div>
      <div class="timer__action">
        <Skeleton width="32px" height="32px" border-radius="50%" />
      </div>
    </template>
    <template v-else>
      <div class="timer__icon">
        <component :is="timerState ? ElapsedTimeIcon : RemainingTimeIcon" />
      </div>
      <div class="timer__content">
        <div class="timer__label">
          {{ title }}
        </div>
        <div class="timer__time">
          {{ time }}
        </div>
      </div>
      <Button
        type="button"
        icon="pi pi-sync"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Toggle timer view"
        @click="toggleTimer"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import ElapsedTimeIcon from '@/components/Icons/ElapsedTime.vue';
import RemainingTimeIcon from '@/components/Icons/RemainingTime.vue';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { assign, setup } from 'xstate';

interface Props {
  loading: boolean;
  elapsed: string;
  remaining: string;
}

const props = defineProps<Props>();

const TIMER_TITLE = { ELAPSED: 'Elapsed Time', REMAINING: 'Remaining Time' };

enum State {
  Elapsed = 'Elapsed',
  Remaining = 'Remaining',
}

enum Event {
  TOGGLE = 'TOGGLE',
}

type EventType = { type: Event.TOGGLE };
type Context = { title: string };

const timerMachine = setup({
  types: { context: {} as Context, events: {} as EventType },
  actions: { onElapsed: assign({ title: TIMER_TITLE.ELAPSED }), onRemaining: assign({ title: TIMER_TITLE.REMAINING }) },
}).createMachine({
  id: 'timerCard',
  context: { title: TIMER_TITLE.ELAPSED },
  initial: State.Elapsed,
  states: {
    [State.Elapsed]: { on: { [Event.TOGGLE]: { target: State.Remaining, actions: 'onRemaining' } } },
    [State.Remaining]: { on: { [Event.TOGGLE]: { target: State.Elapsed, actions: 'onElapsed' } } },
  },
});

const { send, actorRef } = useActor(timerMachine);

const timerState = useSelector(actorRef, (state) => state.matches(State.Elapsed));
const title = useSelector(actorRef, (state) => state.context.title);

const time = computed(() => (timerState.value ? props.elapsed : props.remaining));

function toggleTimer() {
  send({ type: Event.TOGGLE });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.timer {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 312px;
  height: 110px;
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
    background: rgba(61, 159, 255, 0.1);
    border-radius: 8px;
    flex-shrink: 0;
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__label {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__time {
    font-weight: 400;
    font-size: 24px;
    color: $color-primary-button-text;
    font-variant-numeric: tabular-nums;
  }

  &__action {
    flex-shrink: 0;
  }
}
</style>
