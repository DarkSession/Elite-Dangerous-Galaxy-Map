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

/**
 * The nebula modules the main entry point must not reach as a value. The list holds each
 * form a module of `src/` can write, because a pattern of one shape does not match the
 * others: `src/render/` writes `./nebula-pass`, `src/app/` writes `../render/nebula-pass`
 * and a path from the root reads `src/render/nebula-pass`.
 *
 * `src/render/nebula-slot.ts` is not in the list. It is the module the renderer imports,
 * and it holds types and two number literals and nothing else.
 */
const nebulaImportGroups = [
  './nebula-pass',
  './nebula-volumes',
  '../render/nebula-pass',
  '../render/nebula-volumes',
  '../../render/nebula-pass',
  '../../render/nebula-volumes',
  'src/render/nebula-pass',
  'src/render/nebula-volumes',
  '**/render/nebula-pass',
  '**/render/nebula-volumes',
  '../scene-data/nebulae',
  '../../scene-data/nebulae',
  './nebulae',
  'src/scene-data/nebulae',
  '**/scene-data/nebulae',
];

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
      // Scratch directories. `.gitignore` holds `*.local`, so nothing here is committed
      // and nothing here ships. An offline spike is written to be read once and thrown
      // away, and a lint error in one must not fail the lint of the code that ships.
      '*.local/**',
      // The directory the demo data build fetches the sources into. `.gitignore` holds
      // it, so the repository never carries one. Two of those sources are JavaScript of
      // another project, which this project does not own and does not ship.
      'data/**',
      // The committed extracts of those two sources. They are test data: each one is cut
      // from the source and keeps its own style, so the lint of this project says nothing
      // about them.
      'tests/fixtures/*-extract.js',
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
  {
    // The nebulae are the optional feature, and the main entry point must not reach
    // them. A value import pulls the pass, the two shaders, the volume art and the
    // record set into the chunk every host downloads; a type import costs nothing,
    // because the build erases it. The renderer therefore reaches the nebulae through
    // `src/render/nebula-slot.ts` alone, which this rule does not name.
    //
    // Three files keep these imports by design and are ignored here: `src/nebulae/`,
    // which is the seam and holds the whole nebula import graph, and the two nebula
    // modules of `src/render/`, which import each other and the record set. A test is
    // ignored as well: it runs in Node and ships in no build.
    //
    // The rule is the typescript-eslint one and not the base rule, because the base rule
    // cannot tell a type import from a value import. It is a block of its own, so the
    // `no-restricted-imports` rules of the blocks above keep working: the two rule names
    // differ, so neither replaces the other.
    files: ['src/**/*.ts'],
    ignores: [
      'src/nebulae/**',
      'src/render/nebula-pass.ts',
      'src/render/nebula-volumes.ts',
      '**/*.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: nebulaImportGroups,
              allowTypeImports: true,
              message:
                'Only src/nebulae/ may import the nebulae as a value. The renderer ' +
                'reaches them through src/render/nebula-slot.ts.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
