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
        advancedChunks: {
          groups: [
            // framer-motion is EXCLUDED rather than given a group of its own, and
            // the difference is not cosmetic. Naming a group creates a chunk the
            // entry statically imports, which was measured: with a `motion` group
            // the entry chunk still carried `import ... from "./motion-*.js"` and
            // index.html still preloaded it, so the route split bought nothing.
            // Left ungrouped, the bundler places it where it is actually used, and
            // it comes down with the board or the scorepad.
            // All THREE packages: framer-motion is a shell over `motion-dom` and
            // `motion-utils`, which are siblings in node_modules and carry most of
            // the weight. Excluding only the first left about 100 kB of the library
            // in the eager chunk and the split looked like it had worked.
            { name: 'vendor', test: /[\\/]node_modules[\\/](?!framer-motion[\\/]|motion-dom[\\/]|motion-utils[\\/])/ },
          ],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
