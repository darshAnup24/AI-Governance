import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
<<<<<<< HEAD

export default defineConfig({
  plugins: [react()],
=======
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // Cache governance API calls for 5 minutes (stale-while-revalidate)
          {
            urlPattern: /^http:\/\/localhost:4000\/api\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'gov-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          // Cache proxy API calls
          {
            urlPattern: /^http:\/\/localhost:8000\/api\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'proxy-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          // Cache Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'ShieldAI Governance',
        short_name: 'ShieldAI',
        description: 'Enterprise AI governance — real-time prompt monitoring, compliance, and threat detection',
        start_url: '/governance',
        display: 'standalone',
        background_color: '#020617',
        theme_color: '#6366f1',
        orientation: 'any',
        categories: ['business', 'security', 'productivity'],
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%236366f1"/><path d="M96 20L32 50v56c0 46 26 88 64 106 38-18 64-60 64-106V50L96 20z" fill="white"/></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
        ],
        shortcuts: [
          { name: 'Dashboard', url: '/governance', description: 'AI Governance overview' },
          { name: 'Threats', url: '/governance/threats', description: 'Live threat feed' },
          { name: 'Policies', url: '/governance/policies', description: 'Policy builder' },
          { name: 'Compliance', url: '/governance/reports', description: 'Compliance reports' },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
