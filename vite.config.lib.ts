import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The two packages a host installs beside the library. They stay external, so a host
 * that already uses `gl-matrix` holds one copy of it.
 *
 * The rule is a pattern and not two strings, because
 * `src/scene-data/region-lines.ts` imports
 * `@elite-dangerous-almanac/core/astro/codex-region-lookup`, and a plain string in
 * Rollup's `external` does not match a subpath.
 */
const EXTERNAL_PACKAGES = /^(gl-matrix|@elite-dangerous-almanac\/core)(\/.*)?$/;

// The library build. `vite.config.ts` keeps the dev server, the demo site build and
// `preview`; this file emits the package alone.
export default defineConfig({
  // A package is not served from the root of a site. With `./` every asset URL the
  // build writes is `new URL('assets/...', import.meta.url)`, so the worker files, the
  // detail image and the three faces are found beside the module a host installed.
  base: './',
  // `public/` holds the demo site's pictures, and Vite copies that directory into the
  // output by default. The library needs none of them, so the copy is off.
  publicDir: false,
  worker: {
    format: 'es',
    // Vite builds a worker through `worker.rollupOptions` and not through
    // `build.rollupOptions`, so the external rule above does not reach it. A worker
    // chunk that carried a bare specifier would not resolve in the browser, because a
    // worker starts with no import map. Every worker therefore bundles what it imports.
    rollupOptions: { external: [] },
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      // One format, so code splitting stays on: the HUD stays a chunk a host downloads
      // only when it asks for the HUD, and each worker stays a file of its own.
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: EXTERNAL_PACKAGES,
      // A library build names an asset `[name].[ext]` by default, in the root of the
      // output. The worker build writes `assets/[name]-[hash][extname]`, so the detail
      // image would be emitted twice under two names. One pattern for both gives one
      // file.
      output: { assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
});
