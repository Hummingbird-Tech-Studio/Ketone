import { isNativePlatform } from '@/utils/platform';
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications';
import { Data, Duration, Effect } from 'effect';

const PermissionStatus = {
  Prompt: 'prompt',
  PromptWithRationale: 'prompt-with-rationale',
  Granted: 'granted',
  Denied: 'denied',
} as const;

const PushEvent = {
  Registration: 'registration',
  RegistrationError: 'registrationError',
  Received: 'pushNotificationReceived',
  ActionPerformed: 'pushNotificationActionPerformed',
} as const;

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
              return PermissionStatus.Denied;
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
              return PermissionStatus.Denied;
            }

            const result = await PushNotifications.requestPermissions();
            return result.receive === PermissionStatus.Granted ? PermissionStatus.Granted : PermissionStatus.Denied;
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

          if (
            permStatus.receive === PermissionStatus.Prompt ||
            permStatus.receive === PermissionStatus.PromptWithRationale
          ) {
            const result = yield* Effect.tryPromise({
              try: () => PushNotifications.requestPermissions(),
              catch: (error) =>
                new PushNotificationError({
                  message: 'Failed to request permissions',
                  cause: error,
                }),
            });

            if (result.receive !== PermissionStatus.Granted) {
              return null;
            }
          } else if (permStatus.receive !== PermissionStatus.Granted) {
            return null;
          }

          // Wait for token using acquireUseRelease for guaranteed cleanup
          const token: Token = yield* Effect.acquireUseRelease(
            // Acquire: setup listeners BEFORE calling register() to avoid race condition
            Effect.tryPromise({
              try: async () => {
                let resolve: (token: Token) => void;
                let reject: (error: unknown) => void;
                const promise = new Promise<Token>((res, rej) => {
                  resolve = res;
                  reject = rej;
                });

                const regHandle = await PushNotifications.addListener(PushEvent.Registration, (token) => {
                  resolve(token);
                });
                const errHandle = await PushNotifications.addListener(PushEvent.RegistrationError, (error) => {
                  reject(error);
                });

                // Call register() AFTER listeners are ready to ensure we don't miss the token event
                await PushNotifications.register();

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
       * Add listener for when a push notification is received while app is in foreground.
       * Returns a handle to remove the listener, or null on non-native platforms.
       */
      addReceivedListener: (
        callback: (notification: PushNotificationSchema) => void,
      ): Effect.Effect<{ remove: () => Promise<void> } | null, PushNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return null;
            }
            const handle = await PushNotifications.addListener(PushEvent.Received, callback);
            return { remove: () => handle.remove() };
          },
          catch: (error) =>
            new PushNotificationError({
              message: 'Failed to add notification received listener',
              cause: error,
            }),
        }),

      /**
       * Add listener for when a push notification is tapped/actioned.
       * Returns a handle to remove the listener, or null on non-native platforms.
       */
      addActionListener: (
        callback: (action: ActionPerformed) => void,
      ): Effect.Effect<{ remove: () => Promise<void> } | null, PushNotificationError> =>
        Effect.tryPromise({
          try: async () => {
            if (!isNativePlatform()) {
              return null;
            }
            const handle = await PushNotifications.addListener(PushEvent.ActionPerformed, callback);
            return { remove: () => handle.remove() };
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
