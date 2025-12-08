import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Sitemap from 'vite-plugin-sitemap'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    Sitemap({
      hostname: 'https://www.ketone.dev',
      dynamicRoutes: [
        '/',
        '/about',
        '/contact',
        '/privacy',
        '/terms',
        '/sign-up',
        '/sign-in',
      ],
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
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
