import { onMounted, onUnmounted, watch, type Ref, type ShallowRef } from 'vue';
import { LOADING_SPINNER_OPTIONS } from './constants';
import type { echarts, ECOption } from './types';

interface UseChartLifecycleOptions {
  chartContainer: Ref<HTMLElement | null>;
  chartInstance: ShallowRef<echarts.ECharts | null>;
  buildChartOptions: () => ECOption;
  initChart: () => void;
  isLoading?: Ref<boolean>;
}

/**
 * Sets up common lifecycle logic for eCharts composables:
 * - refresh() and handleResize() functions
 * - ResizeObserver for responsive charts
 * - Loading state watcher
 * - Cleanup on unmount
 */
export function useChartLifecycle(options: UseChartLifecycleOptions) {
  const { chartContainer, chartInstance, buildChartOptions, initChart, isLoading } = options;

  function refresh() {
    if (!chartInstance.value) return;
    chartInstance.value.setOption(buildChartOptions(), { notMerge: true });
  }

  function handleResize() {
    chartInstance.value?.resize();
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    initChart();

    if (isLoading?.value && chartInstance.value) {
      chartInstance.value.showLoading('default', LOADING_SPINNER_OPTIONS);
    }

    if (chartContainer.value) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(chartContainer.value);
    }
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
    chartInstance.value?.dispose();
    chartInstance.value = null;
  });

  watch(
    () => isLoading?.value,
    (loading) => {
      if (!chartInstance.value) return;
      if (loading) {
        chartInstance.value.showLoading('default', LOADING_SPINNER_OPTIONS);
      } else {
        chartInstance.value.hideLoading();
      }
    },
    { immediate: true },
  );

  return {
    refresh,
  };
}
