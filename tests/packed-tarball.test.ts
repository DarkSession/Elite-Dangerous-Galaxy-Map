// What `npm pack` would ship, read before anything is published.
//
// A published version is permanent, so the file list is checked on every push and not at
// publish time alone. `npm pack --dry-run --json` reports the list without writing a
// tarball, so the check costs no publish.
//
// **The test packs a copy of the package, not the package itself.** It copies the package
// into a temporary directory, builds the library into that copy, and runs the pack there.
// Two reasons:
//
// 1. `pnpm test` runs before `pnpm build`, both for a developer and in the check job, so
//    `packages/galaxy-map/dist/` may not exist. A test that skipped on a missing build
//    would be silently green on the tree that matters most.
// 2. `tests/demo-site-build.test.ts` runs `pnpm build` in a worker of its own, which
//    empties and rewrites that same directory. A pack that read it could read a build in
//    progress.
//
// The temporary directory is a **copy of the whole package** less `node_modules/`, the
// build output and an earlier temporary directory. It has to be a copy and not the
// manifest alone: `files` is a list of what to include, so a widened entry ships the
// files it names, and a directory that holds no `src/` would pack no source however wide
// the list grew. Task 7.3's mutation check is what reads that, and it only reads it here.
//
// The directory sits directly under `packages/`, at the depth the library package sits
// at, because the manifest's `prepack` copies `../../LICENSE.md`. That path reaches the
// repository root from `packages/<anything>/` alone. The name starts with
// `.library-build-`, which `.gitignore`, `.prettierignore` and the ESLint ignores all
// match at any depth.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BUILT_IN_ICONS } from '../packages/galaxy-map/src/scene-data/marker-icons';
import { MAX_SYSTEMS } from '../packages/galaxy-map/src/scene-data/real-systems';

const root = fileURLToPath(new URL('..', import.meta.url));
const libraryRoot = join(root, 'packages', 'galaxy-map');

/** The published name, which the README and the manifest must agree on. */
const PACKAGE_NAME = '@elite-dangerous-almanac/galaxy-map';

/** The files the tarball carries beside the build output. */
const TEXT_FILES = ['README.md', 'LICENSE.md', 'THIRD_PARTY_NOTICES.md'];

/** What `npm pack --dry-run --json` reports about one packed file. */
interface PackedFile {
  readonly path: string;
}

/** The manifest of the library package. */
const manifest = JSON.parse(
  readFileSync(join(libraryRoot, 'package.json'), 'utf8'),
) as {
  license: string;
  files: string[];
};

let packDir = '';
let packed: string[] = [];

beforeAll(() => {
  const started = Date.now();
  packDir = mkdtempSync(join(root, 'packages', '.library-build-pack-'));
  // Three things stay behind. `node_modules/` is large and is never packed. `dist/` is
  // the build output, which the build below writes fresh. A `.library-build-*` directory
  // is another run's copy.
  cpSync(libraryRoot, packDir, {
    recursive: true,
    filter: (source) => {
      const name = source.slice(libraryRoot.length + 1);
      return (
        name !== 'node_modules' &&
        name !== 'dist' &&
        !name.startsWith('.library-build-')
      );
    },
  });
  // The copy leaves `node_modules/` behind, so a link stands in for it. The built module
  // imports `gl-matrix` by its bare name, and the case below loads that module.
  symlinkSync(join(libraryRoot, 'node_modules'), join(packDir, 'node_modules'), 'dir');
  execFileSync(
    'pnpm',
    [
      'exec',
      'vite',
      'build',
      '--config',
      'vite.config.ts',
      '--outDir',
      join(packDir, 'dist'),
      '--emptyOutDir',
    ],
    { cwd: libraryRoot, stdio: 'pipe' },
  );
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '-p',
      'tsconfig.build.json',
      '--outDir',
      join(packDir, 'dist', 'types'),
    ],
    { cwd: libraryRoot, stdio: 'pipe' },
  );
  // `npm` and not `pnpm pack`: `npm pack --dry-run --json` is the one machine-readable
  // file list. It runs `prepack`, which is what puts `LICENSE.md` in the tarball.
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const report = JSON.parse(output) as { files: PackedFile[] }[];
  packed = (report[0] as { files: PackedFile[] }).files.map((file) => file.path);
  console.log('the tarball carries', packed.length, 'files');
  console.log('the pack took', Date.now() - started, 'ms');
}, 300000);

afterAll(() => {
  if (packDir !== '') rmSync(packDir, { recursive: true, force: true });
});

describe('the packed tarball', () => {
  test('carries the terms, the notices and the README', () => {
    for (const name of [...TEXT_FILES, 'package.json']) {
      expect(packed, `the tarball carries no ${name}`).toContain(name);
    }
  });

  test('carries the built code', () => {
    // The negative readings below are all conditional on "every other entry", so a
    // tarball of four text files and no code would pass them. This is what fails it.
    expect(packed).toContain('dist/index.js');
    expect(packed).toContain('dist/types/index.d.ts');
    expect(packed).toContain('dist/nebulae.js');
    expect(packed).toContain('dist/testing.js');
  });

  // The one exported value that is not a function. A host reads the bound to split a
  // larger source before it calls `addSystems`, so the number has to reach the host
  // through the built package and not through the source alone.
  test('gives the record bound as a number', async () => {
    const built = (await import(
      pathToFileURL(join(packDir, 'dist', 'index.js')).href
    )) as Record<string, unknown>;
    expect(typeof built['MAX_SYSTEMS']).toBe('number');
    expect(built['MAX_SYSTEMS']).toBe(MAX_SYSTEMS);
  });

  // The 16 built-in marker vectors. They are files of the build and not chunk text, so
  // a `files` list or a build that dropped them would ship a library whose icons 404.
  test('carries the marker vectors', () => {
    const symbols = [...BUILT_IN_ICONS.keys()];
    expect(symbols.length).toBeGreaterThan(0);
    const vectors = packed.filter((path) => path.endsWith('.svg'));
    console.log('the tarball carries the vectors', vectors);

    expect(vectors).toHaveLength(symbols.length);
    for (const symbol of symbols) {
      const found = vectors.filter((path) =>
        new RegExp(`^dist/assets/${symbol}-[\\w-]+\\.svg$`).test(path),
      );
      expect(found, `the tarball carries no ${symbol} vector`).toHaveLength(1);
    }
  });

  test('carries no source, no test and no artifact', () => {
    const allowed = [...TEXT_FILES, 'package.json'];
    for (const path of packed) {
      if (allowed.includes(path)) continue;
      expect(path, `${path} is a source file`).not.toMatch(/^src\//);
      expect(path, `${path} is a test`).not.toMatch(/\.test\.ts$/);
      expect(path, `${path} is an OpenSpec artifact`).not.toMatch(/^openspec\//);
      expect(path, `${path} is demo data`).not.toMatch(/^demo-data\//);
      expect(path, `${path} is outside the build output`).toMatch(/^dist\//);
    }
  });

  test('names the terms and states them', () => {
    expect(manifest.license.length).toBeGreaterThan(0);
    // `LICENSE.md` at the repository root is the one committed source. `prepack` copies
    // it into the package, which is why the packed list holds it and the checkout does
    // not.
    const terms = readFileSync(join(root, 'LICENSE.md'), 'utf8');
    expect(terms).toContain('PolyForm Noncommercial License 1.0.0');
    expect(terms).toContain('Any noncommercial purpose is a permitted purpose.');
    // `license` refers to the file rather than naming the SPDX identifier. The identifier
    // would say the terms are the published PolyForm text alone, and the file also states
    // what those terms do not cover. npm accepts this form and prints no warning.
    expect(manifest.license).toBe('SEE LICENSE IN LICENSE.md');
    expect(packed).toContain(manifest.license.replace('SEE LICENSE IN ', ''));
    // The terms are this project's own work. The map also carries data and art of other
    // holders, which this project cannot license, so the file names the notices and the
    // holder of the game data. A reader of the licence alone must not read it as terms
    // over the art.
    expect(terms).toContain('THIRD_PARTY_NOTICES.md');
    expect(terms).toContain('Frontier Developments');
    expect(packed).toContain('LICENSE.md');
    expect(readFileSync(join(packDir, 'LICENSE.md'), 'utf8')).toBe(terms);
  });

  test('carries a README of its own', () => {
    const readme = readFileSync(join(packDir, 'README.md'), 'utf8');
    expect(readme).toContain(PACKAGE_NAME);
    expect(readme).toContain(`from '${PACKAGE_NAME}'`);
    expect(readme).toContain('https://github.com/Elite-Dangerous-Almanac/Galaxy-Map');
    // It is the package's README and not the repository's. The repository's opens with
    // the repository name and describes the demo site, the dev container and the suites.
    const repositoryReadme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).not.toBe(repositoryReadme);
    expect(readme.split('\n')[0]).toBe(`# ${PACKAGE_NAME}`);
  });

  test('ships what the manifest says it ships', () => {
    expect(manifest.files).toEqual([
      'dist',
      'README.md',
      'LICENSE.md',
      'THIRD_PARTY_NOTICES.md',
    ]);
  });
});
