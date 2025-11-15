import { Event } from '@/views/cycle/actors/cycle.actor';
import { computed, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';

interface UseActionButtonParams {
  cycleActor: Actor<AnyActorLogic>;
  idle: Ref<boolean>;
  completed: Ref<boolean>;
  inProgress: Ref<boolean>;
}

export function useActionButton({ cycleActor, idle, completed, inProgress }: UseActionButtonParams) {
  const buttonText = computed(() => {
    if (idle.value) {
      return 'Start Fasting';
    }

    if (completed.value) {
      return 'Start New Fast';
    }

    return 'Finish Fasting';
  });

  function handleButtonClick() {
    if (idle.value) {
      cycleActor.send({ type: Event.CREATE });
    }

    if (inProgress.value) {
      console.warn('Complete cycle action not yet implemented in cycle actor');
    }

    if (completed.value) {
      cycleActor.send({ type: Event.LOAD });
    }
  }

  return {
    buttonText,
    handleButtonClick,
  };
}
