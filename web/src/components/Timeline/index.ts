// Main component
export { default as Timeline } from './Timeline.vue';

// Types
export type {
  BarType,
  ChartDimensions,
  CompletedCycleBar,
  CurrentTimePosition,
  DragBarType,
  DragEdge,
  DragState,
  PeriodConfig,
  PeriodState,
  PeriodUpdate,
  ResizeZone,
  TimelineBar,
  TimelineEmits,
  TimelineMode,
  TimelineProps,
} from './types';

// Constants (for external customization)
export {
  COLOR_COMPLETED_CYCLE,
  COLOR_EATING,
  COLOR_FASTING_ACTIVE,
  COLOR_FASTING_COMPLETED,
  COLOR_FASTING_PLANNED,
  COLOR_LOCATION_MARKER,
} from './constants';

// Composables (for advanced usage)
export { useTimelineChart } from './composables/useTimelineChart';
export { addHoursToDate, formatDuration, useTimelineData } from './composables/useTimelineData';
export { useTimelineDrag } from './composables/useTimelineDrag';
export { useTimelineHover } from './composables/useTimelineHover';
export { useTimeSource } from './composables/useTimeSource';
