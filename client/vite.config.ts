import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Read the single root .env (see env.example) instead of requiring a
  // separate client/.env.
  envDir: '../',
  server: {
    // Proxy API calls to the Express server in dev so the client only ever
    // talks to same-origin /api, never CoinGecko directly.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
