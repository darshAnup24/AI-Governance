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
    port: 3000,
    proxy: {
      // Governance API routes → governance backend (Node.js, port 4000)
      // rewrite strips /governance prefix so backend receives /api/...
      '/api/governance': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/governance/, '/api'),
      },
      // Auth routes → governance backend (owns user sessions)
      '/api/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Everything else → proxy gateway (Python FastAPI, port 8000)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
