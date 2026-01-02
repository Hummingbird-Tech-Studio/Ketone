import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.ketone.app',
  appName: 'Ketone',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Allow HTTP only for local development (localhost:3000)
    cleartext: process.env.NODE_ENV !== 'production',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
