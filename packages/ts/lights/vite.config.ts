import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  resolve: {
    // Match tsconfig.base.json customConditions so Vite resolves workspace lib
    // packages to their TypeScript source rather than the pre-built dist JS.
    conditions: ['@lights/source'],
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
