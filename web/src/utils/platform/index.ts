import { Capacitor } from '@capacitor/core';

/**
 * Check if the app is running on a native platform (iOS or Android)
 */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get the current platform
 */
export const getPlatform = (): 'web' | 'ios' | 'android' => {
  return Capacitor.getPlatform() as 'web' | 'ios' | 'android';
};

/**
 * Check if the app is running on iOS
 */
export const isIOS = (): boolean => {
  return Capacitor.getPlatform() === 'ios';
};

/**
 * Check if the app is running on Android
 */
export const isAndroid = (): boolean => {
  return Capacitor.getPlatform() === 'android';
};

/**
 * Check if the app is running on the web
 */
export const isWeb = (): boolean => {
  return Capacitor.getPlatform() === 'web';
};
