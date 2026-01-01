import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.ketone.app',
  appName: 'Ketone',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Allows HTTP for local development (localhost:3000)
    // Production uses HTTPS so this has no effect there
    cleartext: true,
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
