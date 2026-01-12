import type { Ref } from 'vue';
import { ref, watch } from 'vue';
import type PullToRefresh from './PullToRefresh.vue';

type PullToRefreshRef = InstanceType<typeof PullToRefresh> | null;

export function usePullToRefresh(loading: Ref<boolean>, onRefresh: () => void) {
  const pullToRefreshRef = ref<PullToRefreshRef>(null);
  let doneCallback: (() => void) | null = null;

  watch(loading, (isLoading, wasLoading) => {
    if (wasLoading && !isLoading && doneCallback) {
      doneCallback();
      doneCallback = null;
    }
  });

  function handleRefresh(done: () => void) {
    doneCallback = done;
    onRefresh();
  }

  return {
    pullToRefreshRef,
    handleRefresh,
  };
}
