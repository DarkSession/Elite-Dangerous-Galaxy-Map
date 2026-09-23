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
  'packages/*/src/render',
  'packages/*/src/render/*',
  'packages/*/src/render/**',
];

/** The same shape of pattern list for any one directory of the library's `src/`. */
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
    `packages/*/src/${directory}`,
    `packages/*/src/${directory}/*`,
    `packages/*/src/${directory}/**`,
  ];
}

/**
 * The nebula modules the main entry point must not reach as a value. The list holds each
 * form a module of `src/` can write, because a pattern of one shape does not match the
 * others: `src/render/` writes `./nebula-pass`, `src/app/` writes `../render/nebula-pass`
 * and a path from the repository root reads `packages/galaxy-map/src/render/nebula-pass`.
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
  'packages/*/src/render/nebula-pass',
  'packages/*/src/render/nebula-volumes',
  '**/render/nebula-pass',
  '**/render/nebula-volumes',
  '../scene-data/nebulae',
  '../../scene-data/nebulae',
  './nebulae',
  'packages/*/src/scene-data/nebulae',
  '**/scene-data/nebulae',
];

export default tseslint.config(
  {
    ignores: [
      // The mockup and the runtime the design tool wrote. The project does not own
      // that code and does not ship it.
      '.design/**',
      // The two build outputs. Each package writes inside itself, so each glob names
      // its package. An unanchored `dist/**` would not match either.
      'packages/*/dist/**',
      'apps/*/dist/**',
      // The directory `tests/main-bundle.test.ts` builds into. It is removed after the
      // run, and it holds build output and two files the declaration test compiles. It
      // now sits inside the library package, so the glob matches at any depth.
      '**/.library-build-*/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'coverage/**',
      // Scratch directories. `.gitignore` holds `*.local`, so nothing here is committed
      // and nothing here ships. An offline spike is written to be read once and thrown
      // away, and a lint error in one must not fail the lint of the code that ships.
      '*.local/**',
      // The directory the demo data build fetches the sources into. The script computes
      // its root as its own parent directory, so after the restructure it fetches into
      // `apps/demo/data/`. `.gitignore` holds it, so the repository never carries one.
      // Two of those sources are JavaScript of another project, which this project does
      // not own and does not ship.
      'apps/demo/data/**',
      'data/**',
      // The copy of the licence the library package's `prepack` makes.
      'packages/galaxy-map/LICENSE.md',
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
    files: ['packages/*/src/galaxy-model/**/*.ts', 'packages/*/src/scene-data/**/*.ts'],
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
    files: ['packages/*/src/hud/**/*.ts'],
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
    // The library owns no URL. The page parses the fragment and writes it back, and the
    // page is now a module of `apps/demo/`, so this rule holds over the library package
    // **with no exception**. It held one, `src/app/main.ts`, because one `src/` tree
    // carried both and a search of the served source could not tell them apart.
    //
    // The rule stays rather than being dropped as unnecessary: a library module that
    // read the location would still compile and still bundle. The rule is what fails it.
    files: ['packages/*/src/**/*.ts'],
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
    // Three files keep these imports by design and are ignored here: the package's
    // `src/nebulae/`,
    // which is the seam and holds the whole nebula import graph, and the two nebula
    // modules of `src/render/`, which import each other and the record set. A test is
    // ignored as well: it runs in Node and ships in no build.
    //
    // The rule is the typescript-eslint one and not the base rule, because the base rule
    // cannot tell a type import from a value import. It is a block of its own, so the
    // `no-restricted-imports` rules of the blocks above keep working: the two rule names
    // differ, so neither replaces the other.
    files: ['packages/*/src/**/*.ts'],
    ignores: [
      'packages/*/src/nebulae/**',
      'packages/*/src/render/nebula-pass.ts',
      'packages/*/src/render/nebula-volumes.ts',
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
  {
    // The demo is a package of the workspace and reaches the library by its **package
    // name** alone. A relative path out of the demo's page directories would resolve on
    // the dev server, where the alias table points the name at the library's source, and
    // break for anyone who consumed the built package the same way.
    //
    // The rule covers the four page directories of the package: `src/`, which holds the
    // demo page, `examples/`, which holds the nine samples, `cycles/` and `canonn/`.
    // `e2e/`, `tests/` and the demo's own build scripts reach package source by relative
    // path on purpose, and that stays legal. `../src/` stays legal as well: from `cycles/`
    // and `canonn/` it reaches the demo's own `src/`, which holds the code the two pages
    // share. A sample sits one level deeper, so it cannot reach `src/` with it.
    files: [
      'apps/demo/src/**/*.ts',
      'apps/demo/examples/**/*.ts',
      'apps/demo/cycles/**/*.ts',
      'apps/demo/canonn/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '!../src', '../../*', '../../../*', '**/packages/**'],
              message:
                'The demo imports the map by its package name. A relative reach out ' +
                'of a page directory of apps/demo/ resolves only on the dev server.',
            },
          ],
        },
      ],
      // `no-restricted-imports` reads static imports alone. The demo page loads its data
      // sets with `import()`, and the cycles page and the Canonn page load a manifest the
      // same way. That call takes the same rule: one level up to `../demo-data/` is the demo's own directory
      // and stays legal, two levels up or a path through `packages/` reaches out of the
      // package and does not.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal.source[value=/^\\.\\.\\/\\.\\./]',
          message:
            'The demo imports the map by its package name. A dynamic reach out of ' +
            'a page directory of apps/demo/ resolves only on the dev server.',
        },
        {
          selector: 'ImportExpression > Literal.source[value=/packages\\//]',
          message:
            'The demo imports the map by its package name. A dynamic import through ' +
            'packages/ resolves only on the dev server.',
        },
      ],
    },
  },
  prettier,
);
