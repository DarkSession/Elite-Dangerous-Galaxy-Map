import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/** This package's own directory, which the page list below is read from. */
const DEMO_ROOT = fileURLToPath(new URL('.', import.meta.url));

/**
 * Every page the demo site build takes as an input: the demo page at the base path, one
 * page for each sample directory of `examples/`, the cycles page and the Canonn page.
 *
 * The list is read from the directory rather than written out, so a new sample needs no
 * edit here. Vite writes each page under its own path, and the base path already
 * applies, so a sample is published at `<base>examples/<id>/`.
 */
function pageInputs(): string[] {
  const found = [join(DEMO_ROOT, 'index.html')];
  const examples = join(DEMO_ROOT, 'examples');
  if (existsSync(examples)) {
    for (const name of readdirSync(examples).sort()) {
      const page = join(examples, name, 'index.html');
      if (existsSync(page)) found.push(page);
    }
  }
  for (const name of ['cycles', 'canonn']) {
    const page = join(DEMO_ROOT, name, 'index.html');
    if (existsSync(page)) found.push(page);
  }
  return found;
}

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
    // Every set of the Canonn page stays a file. Vite otherwise writes an asset under
    // 4,096 bytes into the chunk that names it, as a data URL, and the smallest Canonn
    // sets are 317 bytes. The page fetches its sets, so an inlined one would be a
    // request the browser cannot make.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: pageInputs(),
    },
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl'],
});
