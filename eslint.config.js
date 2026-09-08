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
  prettier,
);
