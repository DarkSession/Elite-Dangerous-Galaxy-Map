// What the library build emits. The test runs the build into a directory of its own, so
// every reading comes from a fresh build and not from the `dist/` left in the tree.
//
// It checks four things:
//
// 1. The output holds the entry chunk, the three worker chunks, the HUD chunk and the
//    three font files, and it holds no page, no demo data and no file of `public/`.
// 2. The region cell lookup stays out of the load-time chunks. `astro/codex-region-lookup`
//    is about 199 KiB of run-length region cells. The label sweep reads regions on the main
//    thread, so the reader of the coarse grid lives in `src/scene-data/regions.ts` and
//    imports nothing from that lookup. `regionNameAtExact` reads the lookup, and it loads
//    the lookup on its first call. If either one ever imports the table at load, the table
//    joins the entry chunk or a chunk beside it, and this test fails.
// 3. Every worker chunk bundles what it imports. A worker starts with no import map, so
//    a bare specifier in a worker chunk does not resolve in the browser.
// 4. `package.json` names paths the build emits, and the declaration names the public
//    surface.
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * How large the library's entry chunk may be, in bytes. The guard is for the 199 KiB
 * region cell lookup: a chunk that pulled that table in reads over 370,000 bytes. The
 * bound is that guard and not a budget, so it keeps room for the code the library grows.
 *
 * The page chunk measured 108,194 bytes when this test was written, 124,530 bytes after
 * the phase 3 change, 131,090 after the deep zoom change and 152,848 after the flight,
 * markers and grid change. The library entry chunk measured **162,593 bytes** on the
 * first library build, **198,764 bytes** with the cursor marker, the plane overlay and
 * the exact region lookup in, **199,705 bytes** before the band, grid, number and marker
 * tuning, and **200,821 bytes** after it. The next change that touches the entry chunk
 * must read the bound again. It is larger than the page chunk although it carries no page
 * and externalises `gl-matrix` and `@elite-dangerous-almanac/core`, because Vite
 * compresses and mangles a library build but keeps its whitespace: a host's own bundler
 * minifies it.
 *
 * The bound rose from 200,000 to 210,000 with the reading of 200,821. The guard still
 * holds: a chunk that pulled the region cell table in reads over 370,000 bytes, which is
 * far above either figure.
 */
const ENTRY_CHUNK_LIMIT = 210_000;

/**
 * How large the HUD chunk may be, in bytes. It measured **31,201 bytes** on the first
 * library build and **47,360 bytes** after the dataset field, the dataset library dialog
 * and their style rules joined it. The bound is a guard against the HUD pulling in a data
 * layer, not a budget: the HUD reaches the map through the public handle alone.
 */
const HUD_CHUNK_LIMIT = 56_000;

/**
 * Text that only the region cell lookup holds. Both are keys of the cell data object,
 * and a minifier keeps the keys of an object literal.
 */
const LOOKUP_TERMS = ['scaleNumerator', 'minPz'];

/** The files of `public/`, which the library build must not copy. */
const PUBLIC_FILES = ['EDLoader1.svg', 'ruins-site.svg', 'structure-site.svg'];

/** The types the entry point exports, which `library-package` lists. */
const PUBLIC_TYPES = [
  'GalaxyMapOptions',
  'GalaxyMap',
  'MapView',
  'Category',
  'RealSystem',
  'SystemImage',
  'RegionMode',
  'CategoryInput',
  'SystemRecordInput',
  'HudOptions',
  'HudAction',
  'HudHandle',
  'AddReport',
  'CategoryReport',
  'Reject',
  'CategoryReject',
  'DatasetEntry',
  'DatasetContent',
  'DatasetInfo',
  'DatasetLoadResult',
];

/** Every file under a directory, with its path. */
function listFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(path));
    else found.push(path);
  }
  return found;
}

/** The name of a file, without its directory. */
function nameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Every module specifier an emitted chunk imports, static and dynamic. */
function importsOf(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push(match[1] as string);
    match = pattern.exec(text);
  }
  return found;
}

/**
 * Every module specifier a chunk imports **at load**. A dynamic import reads as
 * `import("...")` with the bracket, and the browser fetches it only when the call runs, so
 * the bracket tells a load-time import from a lazy one.
 */
function staticImportsOf(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom|\bimport)\s*(\(\s*)?["']([^"']+)["']/g;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match[1] === undefined) found.push(match[2] as string);
    match = pattern.exec(text);
  }
  return found;
}

/**
 * Every chunk the browser fetches to run one chunk: the chunk itself, the chunks it
 * imports at load, and so on down. A relative specifier of an emitted chunk names a file
 * beside it, so the walk reads the name alone.
 */
function chunksAtLoad(start: string): string[] {
  const byName = new Map(scripts.map((path) => [nameOf(path), path]));
  const reached: string[] = [];
  const queue = [start];
  while (queue.length > 0) {
    const path = queue.pop() as string;
    if (reached.includes(path)) continue;
    reached.push(path);
    for (const specifier of staticImportsOf(readFileSync(path, 'utf8'))) {
      const next = byName.get(nameOf(specifier));
      if (next !== undefined) queue.push(next);
    }
  }
  return reached;
}

let outDir = '';
let files: string[] = [];
let scripts: string[] = [];

beforeAll(() => {
  // The directory sits in the repository and not in the system temporary directory,
  // because one test imports the built module and node resolves `gl-matrix` and
  // `@elite-dangerous-almanac/core` by walking up to `node_modules/`.
  outDir = mkdtempSync(join(root, '.library-build-'));
  // This repository uses pnpm. `npx` is npm tooling and would fetch from the registry
  // outside the 7-day release hold if the local binary were ever missing.
  execFileSync(
    'pnpm',
    [
      'exec',
      'vite',
      'build',
      '--config',
      'vite.config.lib.ts',
      '--outDir',
      outDir,
      '--emptyOutDir',
    ],
    { cwd: root, stdio: 'pipe' },
  );
  execFileSync(
    'pnpm',
    ['exec', 'tsc', '-p', 'tsconfig.build.json', '--outDir', join(outDir, 'types')],
    { cwd: root, stdio: 'pipe' },
  );
  files = listFiles(outDir);
  scripts = files.filter((path) => path.endsWith('.js'));
}, 300000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('the library build', () => {
  test('emits the entry chunk, the workers, the HUD chunk and the three faces', () => {
    const names = files.map(nameOf);
    console.log('the library build emitted', names);

    expect(names).toContain('index.js');
    for (const worker of [
      'point-cloud.worker',
      'volume.worker',
      'region-lines.worker',
    ]) {
      expect(names.filter((name) => name.startsWith(`${worker}-`))).toHaveLength(1);
    }
    expect(names.filter((name) => name.startsWith('hud-'))).toHaveLength(1);
    expect(names.filter((name) => name.endsWith('.woff2'))).toHaveLength(3);
    expect(names.filter((name) => name.endsWith('.png'))).toHaveLength(1);
  });

  test('carries no page, no demo data and no file of public', () => {
    const demo: { systems: { name: string }[] } = JSON.parse(
      readFileSync(join(root, 'demo-data', 'guardian-ruins.json'), 'utf8'),
    ) as { systems: { name: string }[] };
    const demoName = demo.systems[0]?.name as string;
    expect(demoName.length).toBeGreaterThan(0);

    for (const path of files) {
      const name = nameOf(path);
      expect(name.endsWith('.html'), `${name} is a page`).toBe(false);
      expect(PUBLIC_FILES, `${name} comes from public/`).not.toContain(name);
    }
    for (const path of scripts) {
      const text = readFileSync(path, 'utf8');
      expect(text.includes(demoName), `${nameOf(path)} holds a demo record`).toBe(
        false,
      );
      expect(
        text.includes('galaxy-map-ready'),
        `${nameOf(path)} holds the page event`,
      ).toBe(false);
    }
  });

  test('keeps the region cell lookup out of the chunks that load with the map', () => {
    const carriers: string[] = [];
    for (const path of scripts) {
      const text = readFileSync(path, 'utf8');
      if (LOOKUP_TERMS.every((term) => text.includes(term)))
        carriers.push(nameOf(path));
    }
    console.log('the chunks that carry the region cell lookup', carriers);

    // The entry chunk is `index.js`, the file `package.json` names. A worker chunk is an
    // entry of its own, but the browser starts a worker by its URL and not by an import,
    // so a table in a worker chunk costs a host that never starts that worker nothing.
    const entry = scripts.find((path) => nameOf(path) === 'index.js') as string;
    const atLoad = chunksAtLoad(entry).map(nameOf);
    console.log('the chunks the entry chunk loads with', atLoad);

    // How many chunks carry the table follows the build, so this test asserts no count.
    // `vite.config.lib.ts` keeps `@elite-dangerous-almanac/core` external, so the library
    // build leaves the specifier bare and the worker chunk is the only carrier. A build
    // that bundles the package instead carries it in the worker chunk and in one lazily
    // loaded chunk. Both shapes hold the two rules below, which are what the bound is for.
    for (const name of carriers) {
      expect(name, `${name} is the entry chunk`).not.toBe('index.js');
      expect(atLoad, `${name} loads with the entry chunk`).not.toContain(name);
    }
  });

  test('keeps the entry chunk and the HUD chunk small', () => {
    const entry = scripts.find((path) => nameOf(path) === 'index.js') as string;
    const hud = scripts.find((path) => nameOf(path).startsWith('hud-')) as string;
    const entryBytes = statSync(entry).size;
    const hudBytes = statSync(hud).size;
    console.log('the entry chunk holds', entryBytes, 'bytes');
    console.log('the HUD chunk holds', hudBytes, 'bytes');

    expect(
      entryBytes,
      'The entry chunk grew. A main-thread import of `region-lines.ts` pulls the ' +
        '199 KiB region cell lookup into it.',
    ).toBeLessThan(ENTRY_CHUNK_LIMIT);
    expect(hudBytes).toBeLessThan(HUD_CHUNK_LIMIT);
    // The HUD is a chunk of its own, so a host that does not ask for the HUD downloads
    // none of it. The style element id is text the HUD chunk alone holds.
    expect(readFileSync(hud, 'utf8')).toContain('gm-hud-styles');
    expect(readFileSync(entry, 'utf8')).not.toContain('gm-hud-styles');
  });

  test('bundles what each worker imports', () => {
    const workers = scripts.filter((path) => nameOf(path).includes('.worker-'));
    expect(workers).toHaveLength(3);
    for (const path of workers) {
      const bare = importsOf(readFileSync(path, 'utf8')).filter(
        (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'),
      );
      console.log('the bare imports of', nameOf(path), bare);
      expect(bare, `${nameOf(path)} carries a bare import`).toEqual([]);
    }
  });

  test('package.json names paths the build emits', () => {
    const manifest: {
      private?: boolean;
      types?: string;
      files?: string[];
      exports?: Record<string, Record<string, string>>;
    } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as never;

    expect(manifest.private).toBeUndefined();
    expect(manifest.files).toEqual(['dist']);
    const named = [
      manifest.types as string,
      manifest.exports?.['.']?.['types'] as string,
      manifest.exports?.['.']?.['import'] as string,
    ];
    for (const path of named) {
      expect(path.startsWith('./dist/')).toBe(true);
      // The build wrote to a directory of its own, so the reading drops the `dist/`
      // the package names and reads the same file under it.
      const inside = join(outDir, path.slice('./dist/'.length));
      expect(statSync(inside).isFile(), `${path} is not in the build output`).toBe(
        true,
      );
    }
  });

  test('the built module loads and creates a map', async () => {
    const entry = scripts.find((path) => nameOf(path) === 'index.js') as string;
    const library: Record<string, unknown> = (await import(
      pathToFileURL(entry).href
    )) as Record<string, unknown>;
    expect(typeof library['createGalaxyMap']).toBe('function');
    // The barrel exports one value and the rest are types, which carry no run-time name.
    expect(Object.keys(library).sort()).toEqual(['createGalaxyMap']);
  });

  test('the declaration names the public surface', () => {
    const declaration = join(outDir, 'types', 'index.d.ts');
    const text = readFileSync(declaration, 'utf8');
    for (const name of PUBLIC_TYPES) expect(text).toContain(name);
    expect(text).not.toContain('GalaxyMapDebug');

    const good = join(outDir, 'reads-the-surface.ts');
    const bad = join(outDir, 'reads-the-debug-hook.ts');
    const uses = PUBLIC_TYPES.map(
      (name, index) => `declare const value${index}: ${name};\nvoid value${index};`,
    ).join('\n');
    writeFileSync(
      good,
      `import type { ${PUBLIC_TYPES.join(', ')} } from './types/index';\n${uses}\n`,
      'utf8',
    );
    writeFileSync(
      bad,
      "import type { GalaxyMapDebug } from './types/index';\n" +
        'declare const hook: GalaxyMapDebug;\nvoid hook;\n',
      'utf8',
    );

    expect(typeCheck(good)).toBe('');
    expect(typeCheck(bad)).not.toBe('');
  });
});

/** Compiles one file against the built declaration and gives back what `tsc` said. */
function typeCheck(path: string): string {
  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'tsc',
        // The repository's own `tsconfig.json` is not the one to read here: the file
        // under test sits outside it and names the built declaration.
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'bundler',
        '--lib',
        'ES2022,DOM,DOM.Iterable,WebWorker',
        path,
      ],
      { cwd: root, stdio: 'pipe' },
    );
    return '';
  } catch (error) {
    const reading = error as { stdout?: Buffer };
    return (reading.stdout?.toString() ?? 'the compile failed').trim();
  }
}
