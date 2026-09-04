/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GH Actions sets GITHUB_PAGES_BASE=/<repo-name>/ ; local dev defaults to '/'
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [react()],
  build: {
    // One vendor chunk beside the app chunk. This saves no bytes on a first visit
    // (one more request, a few hundred bytes of glue); it changes what a RETURNING
    // player downloads after a deploy, which is most visits to a game that ships
    // often: the ~170 kB gzip of React, Firebase and framer-motion keeps its hash
    // and revalidates, and only the ~30 kB of app code is fetched again.
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'vendor', test: /[\\/]node_modules[\\/]/ }] },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
