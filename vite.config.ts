import { defineConfig } from 'vite';

// The dev container forwards ports, so the servers must listen on every interface.
export default defineConfig({
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
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl'],
});
