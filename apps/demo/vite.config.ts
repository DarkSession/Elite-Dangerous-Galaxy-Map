import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The demo site build, the dev server and `preview`. `packages/galaxy-map/vite.config.ts`
// builds the library. Each build writes inside its own package, so neither can land where
// the other is looked for.
//
// The dev container forwards ports, so the servers must listen on every interface.

/** The library's source, which the three aliases below resolve the package name to. */
const LIBRARY_SRC = fileURLToPath(
  new URL('../../packages/galaxy-map/src/', import.meta.url),
);

export default defineConfig({
  // The demo imports the map by its package name, and the name resolves to the
  // library's **source**. The dev server then needs no library build and hot reload
  // reaches a change in either package.
  //
  // The two subpaths come **first**. A string alias matches an importee that starts
  // with the alias plus `/`, so the bare name listed first would swallow both and
  // resolve `.../testing` to `src/index.ts/testing`.
  resolve: {
    alias: [
      {
        find: '@elite-dangerous-almanac/galaxy-map/nebulae',
        replacement: `${LIBRARY_SRC}nebulae/index.ts`,
      },
      {
        find: '@elite-dangerous-almanac/galaxy-map/testing',
        replacement: `${LIBRARY_SRC}testing.ts`,
      },
      {
        find: '@elite-dangerous-almanac/galaxy-map',
        replacement: `${LIBRARY_SRC}index.ts`,
      },
    ],
  },
  // Where the repository's GitHub Pages site serves from. `vite preview` serves the
  // build under the same path, so the browser suite's base URL carries it.
  base: '/Galaxy-Map/',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl'],
});
