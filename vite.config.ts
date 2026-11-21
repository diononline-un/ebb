import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/web/routes',
      generatedRouteTree: './src/web/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
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
