import type { InjectionKey, Ref } from 'vue';
import { inject, provide, ref } from 'vue';

type RefreshHandler = () => void;

interface ProfileRefreshContext {
  registerRefreshHandler: (handler: RefreshHandler) => void;
  unregisterRefreshHandler: () => void;
  loading: Ref<boolean>;
  setLoading: (value: boolean) => void;
  refreshing: Ref<boolean>;
}

export const ProfileRefreshKey: InjectionKey<ProfileRefreshContext> = Symbol('ProfileRefresh');

export function provideProfileRefresh() {
  const refreshHandler = ref<RefreshHandler | null>(null);
  const loading = ref(false);
  const refreshing = ref(false);

  function registerRefreshHandler(handler: RefreshHandler) {
    refreshHandler.value = handler;
  }

  function unregisterRefreshHandler() {
    refreshHandler.value = null;
  }

  function setLoading(value: boolean) {
    loading.value = value;
  }

  function triggerRefresh() {
    refreshHandler.value?.();
  }

  function setRefreshing(value: boolean) {
    refreshing.value = value;
  }

  provide(ProfileRefreshKey, {
    registerRefreshHandler,
    unregisterRefreshHandler,
    loading,
    setLoading,
    refreshing,
  });

  return { triggerRefresh, loading, setRefreshing };
}

export function useProfileRefreshChild() {
  const context = inject(ProfileRefreshKey);

  if (!context) {
    throw new Error('useProfileRefreshChild must be used within ProfileView');
  }
  return context;
}
