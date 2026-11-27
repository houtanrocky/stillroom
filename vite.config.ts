import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/stillroom/' : '/',
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: null,
    manifest: {
      id: './',
      name: 'Stillroom',
      short_name: 'Stillroom',
      description: 'Practice exams and review your answers.',
      start_url: './',
      scope: './',
      display: 'standalone',
      theme_color: '#f4f5f2',
      background_color: '#f4f5f2',
      icons: [
        { src: 'stillroom-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'stillroom-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'stillroom-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,svg,png,woff,woff2,ttf,webmanifest}'],
      navigateFallback: 'index.html',
    },
  })],
})
