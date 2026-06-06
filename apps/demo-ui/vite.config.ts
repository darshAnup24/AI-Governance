import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@airlock/shared-ui': path.resolve(__dirname, '../shared-ui/src'),
      '@airlock/shared-ui/design-system': path.resolve(__dirname, '../shared-ui/src/design-system'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      // Demo/Lab API → demo-api sandbox backend (port 4001)
      '/api/demo': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      // Proxy gateway for chat/inspect passthrough (port 8000)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
