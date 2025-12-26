import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use relative paths for Electron file:// protocol
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://backend:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    // Output to electron/dist/renderer for Electron builds
    outDir: process.env.ELECTRON_BUILD === 'true'
      ? '../electron/dist/renderer'
      : 'dist',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    },
    // Inline all assets for air-gap deployment
    assetsInlineLimit: 100000000
  }
})
