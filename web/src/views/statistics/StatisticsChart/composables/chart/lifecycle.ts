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
    if (!chartInstance.value) return;
    chartInstance.value.resize();
    // Re-render with new dimensions so renderItem functions use updated chartWidth
    chartInstance.value.setOption(buildChartOptions(), { notMerge: true });
  }

  let resizeObserver: ResizeObserver | null = null;

  function setupChart() {
    if (!chartContainer.value || chartInstance.value) return;

    initChart();

    // Show loading if needed (initChart() sets chartInstance.value)
    const chart = chartInstance.value as echarts.ECharts | null;
    if (isLoading?.value && chart) {
      chart.showLoading('default', LOADING_SPINNER_OPTIONS);
    }

    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(chartContainer.value);
  }

  onMounted(() => {
    setupChart();
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
