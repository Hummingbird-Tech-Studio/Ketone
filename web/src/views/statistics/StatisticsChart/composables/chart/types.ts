// Shared eCharts setup and types for chart composables

import { CustomChart, type CustomSeriesOption } from 'echarts/charts';
import { GridComponent, type GridComponentOption } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([CustomChart, GridComponent, CanvasRenderer]);

export { echarts };

export type CustomRenderItem = NonNullable<CustomSeriesOption['renderItem']>;
export type ECOption = echarts.ComposeOption<CustomSeriesOption | GridComponentOption>;

// Custom types for eCharts renderItem functions.
// eCharts 6.x exported types have internal conflicts, so we define our own based on actual usage.
export interface RenderItemParams {
  coordSys: {
    width: number;
    height: number;
  };
}

export interface RenderItemAPI {
  value: (dimensionIndex: number) => number;
}

export interface RenderItemStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  text?: string;
  x?: number;
  y?: number;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'middle' | 'bottom';
  fontSize?: number;
  fontWeight?: number;
}

export interface RenderItemShape {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface RenderItemElement {
  type: 'group' | 'rect' | 'text' | 'line';
  x?: number;
  y?: number;
  shape?: RenderItemShape;
  style?: RenderItemStyle;
  children?: RenderItemElement[];
  clipPath?: {
    type: 'rect';
    shape: RenderItemShape;
  };
}

export type RenderItemReturn = RenderItemElement;
