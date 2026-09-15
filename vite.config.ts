import { defineConfig } from 'vite';

// The demo site build, the dev server and `preview`. `vite.config.lib.ts` builds the
// library, and the two write to two directories: the check job runs one build after the
// other, and a shared directory would leave the second build's output where the first
// one's is looked for.
//
// The dev container forwards ports, so the servers must listen on every interface.
export default defineConfig({
  // Where the repository's GitHub Pages site serves from. `vite preview` serves the
  // build under the same path, so the browser suite's base URL carries it.
  base: '/Elite-Dangerous-Galaxy-Map/',
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
    outDir: 'dist-demo',
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl'],
});
