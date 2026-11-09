import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Ikele reuses the storefront pages of the Kzion web app (store, feed card, cart,
// customer account) through the @web alias: one code for both apps.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Ikele',
        short_name: 'Ikele',
        description: 'Découvre et commande auprès des boutiques près de chez toi',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'fr',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@web': path.resolve(__dirname, '../web/src'),
    },
  },
  // The web app's .env.local (VITE_API_URL) serves Ikele too, unless Ikele has its own.
  envDir: path.resolve(__dirname, '../web'),
  build: {
    rollupOptions: {
      output: {
        manualChunks: { 'react-core': ['react', 'react-dom'] },
      },
    },
  },
})
