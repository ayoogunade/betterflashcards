/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'seed/*.tsv'],
      manifest: {
        name: 'BetterFlashcards',
        short_name: 'Flashcards',
        description: 'Personal flashcards, offline first.',
        display: 'standalone',
        start_url: '/',
        background_color: '#f6f6f3',
        theme_color: '#f6f6f3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 700 },
  // Tests never talk to Supabase, even when .env.local has keys.
  test: { environment: 'node', env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } },
})
