import type { RenderItemReturn } from './types';

/**
 * Creates a stripe pattern overlay for indicating overflow in Gantt bars.
 * Used when a cycle spans across multiple weeks/periods.
 */
export function createStripeOverlay(
  width: number,
  height: number,
  status: 'InProgress' | 'Completed',
  hasOverflowBefore: boolean,
  hasOverflowAfter: boolean,
  borderRadius: number,
): RenderItemReturn | null {
  if (!hasOverflowBefore && !hasOverflowAfter) return null;

  // For active (purple) cycles, use white semi-transparent stripes
  // For completed (green) cycles, use dark semi-transparent stripes
  const stripeColor = status === 'InProgress' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.15)';

  const lines: RenderItemReturn[] = [];
  const spacing = 8;

  // Generate diagonal lines across the entire bar
  for (let i = -height; i < width + height; i += spacing) {
    lines.push({
      type: 'line',
      shape: {
        x1: i,
        y1: height,
        x2: i + height,
        y2: 0,
      },
      style: {
        stroke: stripeColor,
        lineWidth: 2,
      },
    });
  }

  return {
    type: 'group',
    children: lines,
    clipPath: {
      type: 'rect',
      shape: { x: 0, y: 0, width, height, r: borderRadius },
    },
  } as RenderItemReturn;
}
