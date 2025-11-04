/* eslint-disable immutable/no-mutation */
import react from '@vitejs/plugin-react'
// load .env files
import { config } from 'dotenv'
import { defineConfig } from 'vite'
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

config()
const replaceOptions = { __DATE__: new Date().toISOString() }
// Env variables
const reload = process.env.RELOAD_SW === 'true'
const selfDestroying = process.env.SW_DESTROY === 'true'
if (reload) {
  // @ts-expect-error just ignore
  replaceOptions.__RELOAD_SW__ = 'true'
}

const manifestForPlugin: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  injectRegister: 'script',
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
  manifest: {
    name: 'Node Grade',
    short_name: 'task-editor',
    description: 'Editor for automated task assessments',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ],
    theme_color: '#000000',
    background_color: '#000000',
    display: 'standalone',
    scope: '/',
    start_url: '/',
    orientation: 'portrait'
  },
  devOptions: {
    enabled: true,
    /* other options */
    navigateFallback: '/index.html',
    type: 'module'
  },
  selfDestroying: selfDestroying
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    sourcemap: process.env.SOURCE_MAP === 'true'
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    headers: {
      'Access-Control-Allow-Origin': 'https://nodegrade.haski.app'
    },
    cors: true,
    hmr: {
      host: 'nodegrade.haski.app'
    },
    proxy: {
      // Configure a proxy to route API requests through Vite server
      '/api': {
        target: process.env.VITE_API_URL || 'https://nodegrade-backend.haski.app',
        changeOrigin: true,
        secure: false, // This is the key setting that disables certificate validation
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  optimizeDeps: {
    include: ['@emotion/react', '@emotion/styled', '@mui/material/Tooltip']
  },
  plugins: [
    tsconfigPaths(),
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin']
      }
    }),
    VitePWA(manifestForPlugin)
  ]
})
