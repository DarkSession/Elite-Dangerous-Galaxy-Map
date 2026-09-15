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

/** The same shape of pattern list for any one directory under `src/`. */
function importGroupsFor(directory) {
  return [
    `**/${directory}`,
    `**/${directory}/**`,
    `../${directory}`,
    `../${directory}/*`,
    `../${directory}/**`,
    `../../${directory}`,
    `../../${directory}/*`,
    `../../${directory}/**`,
    `src/${directory}`,
    `src/${directory}/*`,
    `src/${directory}/**`,
  ];
}

export default tseslint.config(
  {
    ignores: [
      // The mockup and the runtime the design tool wrote. The project does not own
      // that code and does not ship it.
      '.design/**',
      'dist/**',
      'dist-demo/**',
      // The directory `tests/main-bundle.test.ts` builds into. It is removed after the
      // run, and it holds build output and two files the declaration test compiles.
      '.library-build-*/**',
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
    // The HUD reaches the map through the public handle alone. It must not import the
    // renderer, the scene data or the camera, and it must not read `debug`. The rules
    // are what hold the boundary: the production build puts the HUD and the library in
    // one bundle, where a search of the served source cannot tell them apart. A type
    // import trips the rule as a value import does, so `src/app/create-map.ts`
    // re-exports the record types the HUD names.
    files: ['src/hud/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: renderImportGroups,
              message: 'The HUD must not import the renderer.',
            },
            {
              group: importGroupsFor('scene-data'),
              message: 'The HUD must not import the scene data.',
            },
            {
              group: importGroupsFor('camera'),
              message: 'The HUD must not import the camera.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[computed=false][property.name='debug']",
          message: 'The HUD must not read the debug member of the map handle.',
        },
        {
          selector: "MemberExpression[computed=true][property.value='debug']",
          message: 'The HUD must not read the debug member of the map handle.',
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
