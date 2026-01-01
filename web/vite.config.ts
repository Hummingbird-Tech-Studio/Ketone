import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import Sitemap from 'vite-plugin-sitemap';
import vueDevTools from 'vite-plugin-vue-devtools';
import packageJson from './package.json';

// https://vite.dev/config/
export default defineConfig({
  // Use relative paths for Capacitor builds
  base: process.env.CAPACITOR_BUILD ? './' : '/',
  plugins: [
    vue(),
    vueDevTools(),
    Sitemap({
      hostname: 'https://www.ketone.dev',
      dynamicRoutes: ['/', '/about', '/contact', '/privacy', '/terms', '/sign-up', '/sign-in'],
      exclude: [
        '/cycle',
        '/statistics',
        '/cycles/*',
        '/profile',
        '/profile/*',
        '/account',
        '/account/*',
        '/forgot-password',
        '/reset-password',
      ],
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
