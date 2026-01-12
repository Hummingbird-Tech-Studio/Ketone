import { Event, physicalInfoMachine, PhysicalInfoState } from '@/views/profile/actors/physicalInfo.actor';
import type { SavePhysicalInfoPayload } from '@/views/profile/services/profile.service';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing physical info state and actions
 *
 * @example
 * ```ts
 * const { loading, loaded, saving, physicalInfo, loadPhysicalInfo, savePhysicalInfo } = usePhysicalInfo();
 * ```
 */
export function usePhysicalInfo() {
  const { send, actorRef } = useActor(physicalInfoMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(PhysicalInfoState.Idle));
  const loading = useSelector(actorRef, (state) => state.matches(PhysicalInfoState.Loading));
  const loaded = useSelector(actorRef, (state) => state.matches(PhysicalInfoState.Loaded));
  const saving = useSelector(actorRef, (state) => state.matches(PhysicalInfoState.Saving));
  const error = useSelector(actorRef, (state) => state.matches(PhysicalInfoState.Error));

  // Context data
  const physicalInfo = useSelector(actorRef, (state) => state.context.physicalInfo);

  // UI helpers
  const showSkeleton = computed(() => loading.value);

  // Actions
  const loadPhysicalInfo = () => {
    send({ type: Event.LOAD });
  };

  const refreshPhysicalInfo = () => {
    send({ type: Event.REFRESH });
  };

  const savePhysicalInfo = (data: SavePhysicalInfoPayload) => {
    send({ type: Event.SAVE, data });
  };

  return {
    // State checks
    idle,
    loading,
    loaded,
    saving,
    error,
    // Context data
    physicalInfo,
    // UI helpers
    showSkeleton,
    // Actions
    loadPhysicalInfo,
    refreshPhysicalInfo,
    savePhysicalInfo,
    // Actor ref
    actorRef,
  };
}
