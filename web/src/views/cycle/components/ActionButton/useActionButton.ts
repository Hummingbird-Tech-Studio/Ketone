import { Event } from '@/views/cycle/actors/cycle.actor';
import { computed, type Ref } from 'vue';
import type { Actor, AnyActorLogic } from 'xstate';

interface UseActionButtonParams {
  cycleActor: Actor<AnyActorLogic>;
  idle: Ref<boolean>;
  completed: Ref<boolean>;
  inProgress: Ref<boolean>;
  onFinishFasting?: () => void;
}

export function useActionButton({ cycleActor, idle, completed, inProgress, onFinishFasting }: UseActionButtonParams) {
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
      onFinishFasting?.();
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
