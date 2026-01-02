import type { Ref } from 'vue';
import { ref, watch } from 'vue';
import type PullToRefresh from './PullToRefresh.vue';

type PullToRefreshRef = InstanceType<typeof PullToRefresh> | null;

export function usePullToRefresh(loading: Ref<boolean>, onRefresh: () => void) {
  const pullToRefreshRef = ref<PullToRefreshRef>(null);

  watch(loading, (isLoading, wasLoading) => {
    if (wasLoading && !isLoading) {
      pullToRefreshRef.value?.stopRefreshing();
    }
  });

  return {
    pullToRefreshRef,
    handleRefresh: onRefresh,
  };
}
