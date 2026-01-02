import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications';
import { Data, Duration, Effect } from 'effect';

import { isNativePlatform } from '@/utils/platform';

/**
 * Push Notification Error
 */
export class PushNotificationError extends Data.TaggedError('PushNotificationError')<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Push Notification Service
 *
 * Handles push notification registration and management.
 * Only active on native platforms (iOS/Android).
 */
export class PushNotificationService extends Effect.Service<PushNotificationService>()('PushNotificationService', {
  effect: Effect.gen(function* () {
    return {
      /**
       * Check if push notifications are available
       */
      isAvailable: (): boolean => isNativePlatform(),

      /**
       * Check current permission status
       */
      checkPermissions: (): Effect.Effect<
        'prompt' | 'prompt-with-rationale' | 'granted' | 'denied',
        PushNotificationError
      > =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return 'denied' as const;
            }
            const result = await PushNotifications.checkPermissions();
            return result.receive;
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to check push notification permissions',
              cause: error,
            }),
        }),

      /**
       * Request permission for push notifications
       */
      requestPermissions: (): Effect.Effect<'granted' | 'denied', PushNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return 'denied' as const;
            }
            const result = await PushNotifications.requestPermissions();
            return result.receive === 'granted' ? 'granted' : 'denied';
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to request push notification permissions',
              cause: error,
            }),
        }),

      /**
       * Register for push notifications and get device token
       */
      register: (): Effect.Effect<Token | null, PushNotificationError> =>
        Effect.gen(function* () {
          if (!isNativePlatform()) {
            return null;
          }

          const permStatus = yield* Effect.tryPromise({
            try: () => PushNotifications.checkPermissions(),
            catch: (error) =>
              new PushNotificationError({
                message: 'Failed to check permissions',
                cause: error,
              }),
          });

          if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
            const result = yield* Effect.tryPromise({
              try: () => PushNotifications.requestPermissions(),
              catch: (error) =>
                new PushNotificationError({
                  message: 'Failed to request permissions',
                  cause: error,
                }),
            });

            if (result.receive !== 'granted') {
              return null;
            }
          } else if (permStatus.receive !== 'granted') {
            return null;
          }

          yield* Effect.tryPromise({
            try: () => PushNotifications.register(),
            catch: (error) =>
              new PushNotificationError({
                message: 'Failed to initiate registration',
                cause: error,
              }),
          });

          // Wait for token using acquireUseRelease for guaranteed cleanup
          const token: Token = yield* Effect.acquireUseRelease(
            // Acquire: setup listeners
            Effect.tryPromise({
              try: async () => {
                let resolve: (token: Token) => void;
                let reject: (error: unknown) => void;
                const promise = new Promise<Token>((res, rej) => {
                  resolve = res;
                  reject = rej;
                });

                const regHandle = await PushNotifications.addListener('registration', (token) => {
                  resolve(token);
                });
                const errHandle = await PushNotifications.addListener('registrationError', (error) => {
                  reject(error);
                });

                return { promise, regHandle, errHandle };
              },
              catch: (error) =>
                new PushNotificationError({
                  message: 'Failed to setup registration listeners',
                  cause: error,
                }),
            }),
            // Use: wait for the token
            ({ promise }) =>
              Effect.tryPromise({
                try: () => promise,
                catch: (error) =>
                  new PushNotificationError({
                    message: 'Registration failed',
                    cause: error,
                  }),
              }),
            // Release: cleanup listeners (always runs)
            ({ regHandle, errHandle }) =>
              Effect.promise(async () => {
                await regHandle.remove();
                await errHandle.remove();
              }),
          ).pipe(
            Effect.timeoutFail({
              duration: Duration.seconds(10),
              onTimeout: () =>
                new PushNotificationError({
                  message: 'Registration timeout',
                }),
            }),
          );

          return token;
        }),

      /**
       * Add listener for when a push notification is received while app is in foreground
       */
      addReceivedListener: (
        callback: (notification: PushNotificationSchema) => void,
      ): Effect.Effect<void, PushNotificationError> =>
        Effect.try({
          try: () => {
            if (isNativePlatform()) {
              PushNotifications.addListener('pushNotificationReceived', callback);
            }
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to add notification received listener',
              cause: error,
            }),
        }),

      /**
       * Add listener for when a push notification is tapped/actioned
       */
      addActionListener: (callback: (action: ActionPerformed) => void): Effect.Effect<void, PushNotificationError> =>
        Effect.try({
          try: () => {
            if (isNativePlatform()) {
              PushNotifications.addListener('pushNotificationActionPerformed', callback);
            }
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to add notification action listener',
              cause: error,
            }),
        }),

      /**
       * Remove all push notification listeners
       */
      removeAllListeners: (): Effect.Effect<void, PushNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (isNativePlatform()) {
              await PushNotifications.removeAllListeners();
            }
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to remove notification listeners',
              cause: error,
            }),
        }),

      /**
       * Get list of delivered notifications
       */
      getDeliveredNotifications: (): Effect.Effect<PushNotificationSchema[], PushNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return [];
            }
            const result = await PushNotifications.getDeliveredNotifications();
            return result.notifications;
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to get delivered notifications',
              cause: error,
            }),
        }),

      /**
       * Remove all delivered notifications
       */
      removeAllDeliveredNotifications: (): Effect.Effect<void, PushNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (isNativePlatform()) {
              await PushNotifications.removeAllDeliveredNotifications();
            }
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to remove delivered notifications',
              cause: error,
            }),
        }),
    };
  }),
  accessors: true,
}) {}
