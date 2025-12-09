import { Emit, Event, State, versionCheckerActor } from '@/actors/versionCheckerActor';
import { useSelector } from '@xstate/vue';
import { useToast } from 'primevue/usetoast';
import { onUnmounted } from 'vue';

/**
 * Composable for version checking functionality
 * Integrates with PrimeVue Toast for notifications
 */
export function useVersionChecker() {
  const toast = useToast();

  // State selectors
  const idle = useSelector(versionCheckerActor, (state) => state.matches(State.IDLE));
  const checking = useSelector(versionCheckerActor, (state) => state.matches(State.CHECKING));
  const upToDate = useSelector(versionCheckerActor, (state) => state.matches(State.UP_TO_DATE));
  const updateAvailable = useSelector(versionCheckerActor, (state) => state.matches(State.UPDATE_AVAILABLE));
  const error = useSelector(versionCheckerActor, (state) => state.matches(State.ERROR));

  // Context data
  const currentVersion = useSelector(versionCheckerActor, (state) => state.context.currentVersion);
  const serverVersion = useSelector(versionCheckerActor, (state) => state.context.serverVersion);
  const lastCheckTime = useSelector(versionCheckerActor, (state) => state.context.lastCheckTime);

  // Actions
  const startPolling = () => {
    versionCheckerActor.send({ type: Event.START_POLLING });
  };

  const stopPolling = () => {
    versionCheckerActor.send({ type: Event.STOP_POLLING });
  };

  const reload = () => {
    versionCheckerActor.send({ type: Event.RELOAD });
  };

  const dismiss = () => {
    toast.removeGroup('version-update');
    versionCheckerActor.send({ type: Event.DISMISS });
  };

  // Handle update available emission
  const handleUpdateAvailable = () => {
    toast.add({
      severity: 'info',
      summary: 'Update Available',
      detail: `A new version is available. Click "Update Now" to refresh.`,
      closable: false,
      group: 'version-update',
    });
  };

  const subscription = versionCheckerActor.on(Emit.UPDATE_AVAILABLE, handleUpdateAvailable);

  onUnmounted(() => {
    subscription.unsubscribe();
  });

  return {
    // State
    idle,
    checking,
    upToDate,
    updateAvailable,
    error,

    // Context
    currentVersion,
    serverVersion,
    lastCheckTime,

    // Actions
    startPolling,
    stopPolling,
    reload,
    dismiss,

    // Actor reference
    actorRef: versionCheckerActor,
  };
}
