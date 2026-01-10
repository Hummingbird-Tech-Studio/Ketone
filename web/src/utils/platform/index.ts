import { Capacitor } from '@capacitor/core';

const Platform = {
  Web: 'web',
  iOS: 'ios',
  Android: 'android',
} as const;

type PlatformType = (typeof Platform)[keyof typeof Platform];

/**
 * Check if the app is running on a native platform (iOS or Android)
 */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get the current platform
 */
export const getPlatform = (): PlatformType => {
  return Capacitor.getPlatform() as PlatformType;
};

/**
 * Check if the app is running on iOS
 */
export const isIOS = (): boolean => {
  return Capacitor.getPlatform() === Platform.iOS;
};

/**
 * Check if the app is running on Android
 */
export const isAndroid = (): boolean => {
  return Capacitor.getPlatform() === Platform.Android;
};

/**
 * Check if the app is running on the web
 */
export const isWeb = (): boolean => {
  return Capacitor.getPlatform() === Platform.Web;
};
