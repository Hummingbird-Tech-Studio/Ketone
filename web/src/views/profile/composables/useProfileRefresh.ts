import type { InjectionKey, Ref } from 'vue';
import { inject, provide, ref } from 'vue';

type RefreshHandler = () => void;

interface ProfileRefreshContext {
  registerRefreshHandler: (handler: RefreshHandler) => void;
  unregisterRefreshHandler: () => void;
  loading: Ref<boolean>;
  setLoading: (value: boolean) => void;
}

export const ProfileRefreshKey: InjectionKey<ProfileRefreshContext> = Symbol('ProfileRefresh');

export function provideProfileRefresh() {
  const refreshHandler = ref<RefreshHandler | null>(null);
  const loading = ref(false);

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

  provide(ProfileRefreshKey, {
    registerRefreshHandler,
    unregisterRefreshHandler,
    loading,
    setLoading,
  });

  return { triggerRefresh, loading };
}

export function useProfileRefreshChild() {
  const context = inject(ProfileRefreshKey);

  if (!context) {
    throw new Error('useProfileRefreshChild must be used within ProfileView');
  }
  return context;
}
