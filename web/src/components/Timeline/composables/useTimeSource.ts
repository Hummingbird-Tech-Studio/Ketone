import { onUnmounted, ref, type Ref } from 'vue';
import type { AnyActorRef } from 'xstate';
import { INTERVAL_REFRESH_MS } from '../constants';

interface UseTimeSourceOptions {
  /** Time source: 'tick' uses actor events, 'interval' uses setInterval */
  source: 'tick' | 'interval';
  /** Actor ref that emits TICK events (required if source='tick') */
  tickActorRef?: AnyActorRef;
  /** Event name for tick (default: 'TICK') */
  tickEventName?: string;
  /** Interval in ms for 'interval' source (default: 60000) */
  intervalMs?: number;
  /** Whether to pause updates when dragging */
  pauseWhenDragging?: boolean;
  /** Ref to check if currently dragging */
  isDragging?: Ref<boolean>;
}

/**
 * Composable that provides a reactive current time value with configurable update source.
 *
 * - 'tick' mode: Subscribes to an actor's TICK event for 100ms precision updates
 * - 'interval' mode: Uses setInterval for 60s precision updates (sufficient for editing)
 */
export function useTimeSource(options: UseTimeSourceOptions) {
  const currentTime = ref(new Date());

  if (options.source === 'tick') {
    if (!options.tickActorRef) {
      console.warn('useTimeSource: tickActorRef is required when source is "tick"');
      return { currentTime };
    }

    const eventName = options.tickEventName ?? 'TICK';
    const subscription = options.tickActorRef.on(eventName, () => {
      currentTime.value = new Date();
    });

    onUnmounted(() => {
      subscription.unsubscribe();
    });
  } else {
    const intervalMs = options.intervalMs ?? INTERVAL_REFRESH_MS;

    const interval = setInterval(() => {
      // Skip updates during drag to prevent interference
      if (options.pauseWhenDragging && options.isDragging?.value) {
        return;
      }
      currentTime.value = new Date();
    }, intervalMs);

    onUnmounted(() => {
      clearInterval(interval);
    });
  }

  return { currentTime };
}
