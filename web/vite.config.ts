import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Sitemap from 'vite-plugin-sitemap'

// Get git commit hash for versioning
const getGitHash = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'development'
  }
}

// Get version based on environment
// In development, use 'development' to match API default
// In production, use the git hash
const getAppVersion = (): string => {
  return process.env.NODE_ENV === 'production' ? getGitHash() : 'development'
}

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
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
