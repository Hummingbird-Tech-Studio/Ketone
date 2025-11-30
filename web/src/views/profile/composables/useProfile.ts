import { Event, profileMachine, ProfileState } from '@/views/profile/actors/profile.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing profile state and actions
 *
 * @example
 * ```ts
 * const { loading, loaded, saving, profile, loadProfile, saveProfile } = useProfile();
 * ```
 */
export function useProfile() {
  const { send, actorRef } = useActor(profileMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(ProfileState.Idle));
  const loading = useSelector(actorRef, (state) => state.matches(ProfileState.Loading));
  const loaded = useSelector(actorRef, (state) => state.matches(ProfileState.Loaded));
  const saving = useSelector(actorRef, (state) => state.matches(ProfileState.Saving));
  const error = useSelector(actorRef, (state) => state.matches(ProfileState.Error));

  // Context data
  const profile = useSelector(actorRef, (state) => state.context.profile);

  // UI helpers
  const showSkeleton = computed(() => loading.value && profile.value === null);

  // Actions
  const loadProfile = () => {
    send({ type: Event.LOAD });
  };

  const saveProfile = (data: { name?: string | null; dateOfBirth?: string | null }) => {
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
    profile,
    // UI helpers
    showSkeleton,
    // Actions
    loadProfile,
    saveProfile,
    // Actor ref
    actorRef,
  };
}
