import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Load environment variables for build
import dotenv from 'dotenv'
dotenv.config()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['recharts', 'framer-motion']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      external: [],
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    cssCodeSplit: true
  },
  esbuild: {
    target: 'es2020'
  },
  // Define environment variables for client-side code
  define: {
    'import.meta.env.VITE_TWITCH_CLIENT_ID': JSON.stringify(process.env.VITE_TWITCH_CLIENT_ID || ''),
    'import.meta.env.VITE_TWITCH_CLIENT_SECRET': JSON.stringify(process.env.VITE_TWITCH_CLIENT_SECRET || '')
  }
})
