import { startOfMinute } from 'date-fns';
import { Match } from 'effect';
import { onUnmounted } from 'vue';
import type { ActorRefFrom } from 'xstate';
import {
  Emit as CycleEmit,
  type EmitType as CycleEmitType,
  Event as CycleEvent,
  type cycleMachine,
} from '../actors/cycle.actor';
import {
  Emit as DialogEmit,
  type EmitType as DialogEmitType,
  Event as DialogEvent,
  type schedulerDialogMachine,
} from '../actors/schedulerDialog.actor';

export enum DateTransform {
  RoundToMinute = 'roundToMinute',
  None = 'none',
}

interface UseCycleSchedulerSyncOptions {
  cycleActorRef: ActorRefFrom<typeof cycleMachine>;
  schedulerDialogActorRef: ActorRefFrom<typeof schedulerDialogMachine>;
  /**
   * Date transformation to apply to user-selected dates.
   * - `RoundToMinute`: Removes seconds, rounding to start of minute
   * - `None`: Preserves exact date/time including seconds
   * @default DateTransform.None
   */
  dateTransform?: DateTransform;
}

/**
 * Composable that establishes bidirectional synchronization between
 * the cycle actor and the scheduler dialog actor.
 *
 * Handles:
 * - Dialog → Cycle: Date update requests
 * - Cycle → Dialog: Update completion and validation feedback
 *
 * Automatically cleans up subscriptions when the component unmounts.
 *
 * @param options Configuration including actor refs and optional date transformation
 */
export function useCycleSchedulerSync(options: UseCycleSchedulerSyncOptions) {
  const { cycleActorRef, schedulerDialogActorRef, dateTransform = DateTransform.None } = options;

  function handleDialogEmit(emitType: DialogEmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: DialogEmit.REQUEST_UPDATE }, (emit) => {
        const event = emit.view._tag === 'Start' ? CycleEvent.REQUEST_START_CHANGE : CycleEvent.REQUEST_END_CHANGE;

        const date = dateTransform === DateTransform.RoundToMinute ? startOfMinute(emit.date) : emit.date;

        cycleActorRef.send({ type: event, date });
      }),
    );
  }

  function handleCycleEmit(emitType: CycleEmitType) {
    Match.value(emitType).pipe(
      Match.when({ type: CycleEmit.UPDATE_COMPLETE }, () => {
        schedulerDialogActorRef.send({ type: DialogEvent.UPDATE_COMPLETE });
      }),
      Match.when({ type: CycleEmit.VALIDATION_INFO }, () => {
        schedulerDialogActorRef.send({ type: DialogEvent.VALIDATION_FAILED });
      }),
    );
  }

  const subscriptions = [
    ...Object.values(DialogEmit).map((emit) => schedulerDialogActorRef.on(emit, handleDialogEmit)),
    ...Object.values(CycleEmit).map((emit) => cycleActorRef.on(emit, handleCycleEmit)),
  ];

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });
}
