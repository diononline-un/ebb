import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import shell from './locales/en/shell.json'
import { APP_NAME } from './src/shared/brand.ts'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/web/routes',
      generatedRouteTree: './src/web/routeTree.gen.ts',
      // One chunk per route: the first load ships only the shell and the page that opens (PRD §8 budget).
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/web',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F4F2EE',
        theme_color: '#F4F2EE',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: shell.quickCapture,
            short_name: shell.quickCapture,
            url: '/today?capture=1',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  build: {
    outDir: 'dist/web',
  },
  server: {
    port: 2042,
    proxy: {
      '/api': 'http://127.0.0.1:2040',
    },
  },
})
