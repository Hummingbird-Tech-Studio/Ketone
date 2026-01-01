import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications';
import { Data, Effect } from 'effect';

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
      checkPermissions: (): Effect.Effect<'prompt' | 'prompt-with-rationale' | 'granted' | 'denied', PushNotificationError> =>
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
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return null;
            }

            const permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
              const result = await PushNotifications.requestPermissions();
              if (result.receive !== 'granted') {
                return null;
              }
            } else if (permStatus.receive !== 'granted') {
              return null;
            }

            await PushNotifications.register();

            return new Promise<Token>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Registration timeout'));
              }, 10000);

              PushNotifications.addListener('registration', (token) => {
                clearTimeout(timeout);
                resolve(token);
              });

              PushNotifications.addListener('registrationError', (error) => {
                clearTimeout(timeout);
                reject(error);
              });
            });
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to register for push notifications',
              cause: error,
            }),
        }),

      /**
       * Add listener for when a push notification is received while app is in foreground
       */
      addReceivedListener: (callback: (notification: PushNotificationSchema) => void): Effect.Effect<void, PushNotificationError> =>
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
