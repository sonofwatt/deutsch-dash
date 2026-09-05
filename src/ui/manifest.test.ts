/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The web app manifest, and the one thing about a manifest that actually breaks:
 * a path in it that does not resolve.
 *
 * Every path here is RELATIVE, deliberately. The app is served from `/` locally
 * and from `/deutsch-dash/` on Pages, and Vite rewrites the paths it finds in
 * `index.html` but not the ones inside a file it copies verbatim out of `public/`.
 * An absolute `start_url` or icon `src` would therefore work in dev and point at
 * the wrong origin path in production, which is the failure this pins.
 */
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  name: string; start_url: string; scope: string; display: string;
  icons: { src: string; sizes: string; type: string }[];
};

describe('the web app manifest', () => {
  it('is linked from the page, or nothing ever reads it', () => {
    expect(readFileSync('index.html', 'utf8')).toMatch(/rel="manifest"\s+href="\.\/manifest\.webmanifest"/);
  });

  it('names the app and asks for a standalone window', () => {
    expect(manifest.name).toBe('Deutsch Dash');
    expect(manifest.display).toBe('standalone');
  });

  it('points every path at a file that exists, by a relative route', () => {
    for (const p of [manifest.start_url, manifest.scope, ...manifest.icons.map(i => i.src)]) {
      expect({ path: p, relative: p.startsWith('./') }).toEqual({ path: p, relative: true });
    }
    for (const icon of manifest.icons) {
      const file = `public/${icon.src.slice(2)}`;
      expect({ icon: icon.src, exists: existsSync(file) }).toEqual({ icon: icon.src, exists: true });
    }
  });
});
