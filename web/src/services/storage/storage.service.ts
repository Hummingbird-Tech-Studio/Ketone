import { Preferences } from '@capacitor/preferences';
import { Data, Effect } from 'effect';

import { isNativePlatform } from '@/utils/platform';

/**
 * Storage Error
 */
export class StorageError extends Data.TaggedError('StorageError')<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Storage Service
 *
 * Abstraction layer for storage that works on both web and native platforms.
 * Uses localStorage on web and Capacitor Preferences on native.
 */
export class StorageService extends Effect.Service<StorageService>()('StorageService', {
  effect: Effect.gen(function* () {
    return {
      /**
       * Store a value
       */
      setItem: (key: string, value: string): Effect.Effect<void, StorageError> =>
        Effect.tryPromise({
          try: async () => {
            if (isNativePlatform()) {
              await Preferences.set({ key, value });
            } else {
              localStorage.setItem(key, value);
            }
          },
          catch: (error) =>
            new StorageError({
              message: `Failed to set item: ${key}`,
              cause: error,
            }),
        }),

      /**
       * Retrieve a value
       */
      getItem: (key: string): Effect.Effect<string | null, StorageError> =>
        Effect.tryPromise({
          try: async () => {
            if (isNativePlatform()) {
              const result = await Preferences.get({ key });
              return result.value;
            } else {
              return localStorage.getItem(key);
            }
          },
          catch: (error) =>
            new StorageError({
              message: `Failed to get item: ${key}`,
              cause: error,
            }),
        }),

      /**
       * Remove a value
       */
      removeItem: (key: string): Effect.Effect<void, StorageError> =>
        Effect.tryPromise({
          try: async () => {
            if (isNativePlatform()) {
              await Preferences.remove({ key });
            } else {
              localStorage.removeItem(key);
            }
          },
          catch: (error) =>
            new StorageError({
              message: `Failed to remove item: ${key}`,
              cause: error,
            }),
        }),

      /**
       * Clear all stored values
       */
      clear: (): Effect.Effect<void, StorageError> =>
        Effect.tryPromise({
          try: async () => {
            if (isNativePlatform()) {
              await Preferences.clear();
            } else {
              localStorage.clear();
            }
          },
          catch: (error) =>
            new StorageError({
              message: 'Failed to clear storage',
              cause: error,
            }),
        }),
    };
  }),
  accessors: true,
}) {}
