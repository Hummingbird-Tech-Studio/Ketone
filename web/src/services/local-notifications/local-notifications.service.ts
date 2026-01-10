import { isNativePlatform } from '@/utils/platform';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Data, Effect } from 'effect';

/**
 * Unique notification ID for fasting complete notification
 */
export const FASTING_COMPLETE_NOTIFICATION_ID = 1;

const PermissionStatus = {
  Prompt: 'prompt',
  Granted: 'granted',
  Denied: 'denied',
} as const;

/**
 * Local Notification Error
 */
export class LocalNotificationError extends Data.TaggedError('LocalNotificationError')<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Local Notification Service
 *
 * Handles local notification scheduling and management.
 * Only active on native platforms (iOS/Android).
 */
export class LocalNotificationService extends Effect.Service<LocalNotificationService>()('LocalNotificationService', {
  effect: Effect.gen(function* () {
    return {
      /**
       * Check if local notifications are available
       */
      isAvailable: (): boolean => isNativePlatform(),

      /**
       * Check current permission status
       */
      checkPermissions: (): Effect.Effect<'prompt' | 'granted' | 'denied', LocalNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return PermissionStatus.Denied;
            }

            const result = await LocalNotifications.checkPermissions();
            // Map 'prompt-with-rationale' to 'prompt'
            if (result.display === 'prompt-with-rationale') {
              return PermissionStatus.Prompt;
            }
            return result.display;
          },
          catch: (error) =>
            new LocalNotificationError({
              message: 'Failed to check local notification permissions',
              cause: error,
            }),
        }),

      /**
       * Request permission for local notifications
       */
      requestPermissions: (): Effect.Effect<'granted' | 'denied', LocalNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return PermissionStatus.Denied;
            }

            const result = await LocalNotifications.requestPermissions();
            return result.display === PermissionStatus.Granted ? PermissionStatus.Granted : PermissionStatus.Denied;
          },
          catch: (error) =>
            new LocalNotificationError({
              message: 'Failed to request local notification permissions',
              cause: error,
            }),
        }),

      /**
       * Schedule a local notification for fasting cycle completion.
       * Handles permissions internally and degrades gracefully if denied.
       */
      scheduleFastingComplete: (endDate: Date): Effect.Effect<void, LocalNotificationError> =>
        Effect.gen(function* () {
          if (!isNativePlatform()) {
            return;
          }

          // Check permissions first
          const permStatus = yield* Effect.tryPromise({
            try: () => LocalNotifications.checkPermissions(),
            catch: (error) =>
              new LocalNotificationError({
                message: 'Failed to check permissions',
                cause: error,
              }),
          });

          // Request if needed
          if (permStatus.display === PermissionStatus.Prompt) {
            const result = yield* Effect.tryPromise({
              try: () => LocalNotifications.requestPermissions(),
              catch: (error) =>
                new LocalNotificationError({
                  message: 'Failed to request permissions',
                  cause: error,
                }),
            });

            if (result.display !== PermissionStatus.Granted) {
              yield* Effect.logWarning('Local notification permissions denied');
              return;
            }
          } else if (permStatus.display !== PermissionStatus.Granted) {
            yield* Effect.logWarning('Local notification permissions not granted');
            return;
          }

          // Cancel any existing fasting notification first to avoid duplicates
          yield* Effect.tryPromise({
            try: () => LocalNotifications.cancel({ notifications: [{ id: FASTING_COMPLETE_NOTIFICATION_ID }] }),
            catch: () =>
              new LocalNotificationError({
                message: 'Failed to cancel existing notification',
              }),
          }).pipe(Effect.catchAll(() => Effect.void));

          // Schedule the notification
          yield* Effect.tryPromise({
            try: () =>
              LocalNotifications.schedule({
                notifications: [
                  {
                    id: FASTING_COMPLETE_NOTIFICATION_ID,
                    title: 'Fasting Complete',
                    body: 'Your fasting cycle has ended!',
                    schedule: {
                      at: endDate,
                      allowWhileIdle: true,
                    },
                  },
                ],
              }),
            catch: (error) =>
              new LocalNotificationError({
                message: 'Failed to schedule fasting complete notification',
                cause: error,
              }),
          });

          yield* Effect.logInfo('Scheduled fasting complete notification');
        }).pipe(Effect.annotateLogs({ service: 'LocalNotificationService', endDate: endDate.toISOString() })),

      /**
       * Cancel the fasting complete notification
       */
      cancelFastingComplete: (): Effect.Effect<void, LocalNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return;
            }

            await LocalNotifications.cancel({
              notifications: [{ id: FASTING_COMPLETE_NOTIFICATION_ID }],
            });
          },
          catch: (error) =>
            new LocalNotificationError({
              message: 'Failed to cancel fasting complete notification',
              cause: error,
            }),
        }).pipe(
          Effect.tap(() => Effect.logInfo('Cancelled fasting complete notification')),
          Effect.annotateLogs({ service: 'LocalNotificationService' }),
        ),

      /**
       * Get all pending notifications
       */
      getPending: (): Effect.Effect<{ id: number; title?: string; body?: string }[], LocalNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return [];
            }

            const result = await LocalNotifications.getPending();
            return result.notifications;
          },
          catch: (error) =>
            new LocalNotificationError({
              message: 'Failed to get pending notifications',
              cause: error,
            }),
        }),
    };
  }),
  accessors: true,
}) {}
