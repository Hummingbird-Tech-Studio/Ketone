import type { Ref } from 'vue';
import { ref, watch } from 'vue';
import type PullToRefresh from './PullToRefresh.vue';

type PullToRefreshRef = InstanceType<typeof PullToRefresh> | null;

export function usePullToRefresh(loading: Ref<boolean>, onRefresh: () => void) {
  const pullToRefreshRef = ref<PullToRefreshRef>(null);
  const refreshing = ref(false);
  let doneCallback: (() => void) | null = null;

  watch(loading, (isLoading, wasLoading) => {
    if (wasLoading && !isLoading && doneCallback) {
      doneCallback();
      doneCallback = null;
      refreshing.value = false;
    }
  });

  function handleRefresh(done: () => void) {
    refreshing.value = true;
    doneCallback = done;
    onRefresh();
  }

  return {
    pullToRefreshRef,
    handleRefresh,
    refreshing,
  };
}
