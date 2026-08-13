/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mentisProxy = {
  '/api': {
    target: 'http://127.0.0.1:9472',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
} as const

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: mentisProxy,
  },
  // Same proxy for `vite preview` so production builds can talk to MentisDB locally.
  preview: {
    proxy: mentisProxy,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
