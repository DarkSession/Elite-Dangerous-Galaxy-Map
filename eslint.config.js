import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// The data layers must stay independent of the renderer, so a future density source
// can replace them without a change in `src/render/`.
const renderImportGroups = [
  '**/render',
  '**/render/**',
  '../render',
  '../render/*',
  '../render/**',
  '../../render',
  '../../render/*',
  '../../render/**',
  'src/render',
  'src/render/*',
  'src/render/**',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/galaxy-model/**/*.ts', 'src/scene-data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: renderImportGroups,
              message:
                'The galaxy model and the scene data must not import the renderer.',
            },
          ],
        },
      ],
    },
  },
  {
    // The library owns no URL. The page parses the fragment and writes it back, so
    // `window.location` belongs to `src/app/main.ts` alone. A lint rule is what holds
    // the boundary, because the production build puts the page and the library in one
    // bundle, where a search of the served source cannot tell them apart.
    files: ['src/**/*.ts'],
    ignores: ['src/app/main.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'location',
          message:
            'The library must not read or write window.location. The page owns the URL.',
        },
      ],
    },
  },
  prettier,
);
