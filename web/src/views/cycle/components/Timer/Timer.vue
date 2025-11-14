<template>
  <div class="timer">
    <template v-if="loading">
      <div class="timer__header">
        <Skeleton class="timer__title" width="110px" height="14px" border-radius="4px" />
        <Skeleton class="timer__button" width="40px" height="40px" border-radius="50%" />
      </div>

      <div class="timer__time">
        <Skeleton width="140px" height="26px" border-radius="4px" />
      </div>
    </template>
    <template v-else>
      <div class="timer__header">
        <div class="timer__title">
          {{ title }}
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
      </div>

      <div class="timer__time">
        {{ time }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { assign, setup } from 'xstate';

interface Props {
  loading: boolean;
  elapsed: string;
  remaining: string;
}

const props = defineProps<Props>();

const TIMER_TITLE = {
  ELAPSED: 'Elapsed Time:',
  REMAINING: 'Remaining Time:',
};

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
  types: {
    context: {} as Context,
    events: {} as EventType,
  },
  actions: {
    onElapsed: assign({
      title: TIMER_TITLE.ELAPSED,
    }),
    onRemaining: assign({
      title: TIMER_TITLE.REMAINING,
    }),
  },
}).createMachine({
  id: 'timerCard',
  context: {
    title: TIMER_TITLE.ELAPSED,
  },
  initial: State.Elapsed,
  states: {
    [State.Elapsed]: {
      on: {
        [Event.TOGGLE]: {
          target: State.Remaining,
          actions: 'onRemaining',
        },
      },
    },
    [State.Remaining]: {
      on: {
        [Event.TOGGLE]: {
          target: State.Elapsed,
          actions: 'onElapsed',
        },
      },
    },
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
  width: 268px;
  height: 110px;
  background: $color-light-grey;
  box-shadow:
    -2px 3px 4px 1px rgba(170, 170, 170, 0.25),
    inset 2px 2px 4.5px rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  padding: 8px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__title {
    font-style: normal;
    font-weight: 600;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__time {
    display: flex;
    justify-content: center;
    margin-top: 12px;
    font-style: normal;
    font-weight: 400;
    font-size: 26px;
    color: $color-primary-button-text;
    font-variant-numeric: tabular-nums;
  }
}
</style>
