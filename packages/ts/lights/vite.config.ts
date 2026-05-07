import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  resolve: {
    // Prefer TypeScript source for @lights/* workspace libs in dev/build.
    // Each lib's package.json exposes an "@lights/source" export condition
    // pointing to its src/index.ts — this bypasses the pre-built dist entirely.
    conditions: ['@lights/source', 'module', 'browser', 'default'],
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
})
