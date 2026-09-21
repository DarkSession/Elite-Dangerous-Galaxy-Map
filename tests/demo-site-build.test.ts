// What the demo site build emits, and what each build carries.
//
// The test runs `pnpm build` and then `pnpm build:demo-site`, which is the order the
// check job runs them in. Each build now writes **inside its own package**:
// `packages/galaxy-map/dist/` and `apps/demo/dist/`. Neither can land where the other is
// looked for, which is why `dist-demo/` is gone.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
/** Where each build writes. Each one is inside its own package. */
const libraryDist = join(root, 'packages', 'galaxy-map', 'dist');
const demoDist = join(root, 'apps', 'demo', 'dist');

/** Where the repository's GitHub Pages site serves from. */
const BASE_PATH = '/Galaxy-Map/';

/** The demo package, which holds one directory per page beside the demo page itself. */
const demoPackage = join(root, 'apps', 'demo');

/**
 * Every page the demo package holds, as the path the build writes it at: the demo page at
 * the root, one page per sample of `examples/`, the cycles page and the Canonn page.
 *
 * The list is read from the source rather than written out, so a new sample is covered by
 * the readings below with no edit here. `apps/demo/vite.config.ts` builds its input list
 * the same way, and the reading is that the two agree.
 */
function sourcePages(): string[] {
  const found = ['index.html'];
  const examples = join(demoPackage, 'examples');
  for (const name of readdirSync(examples).sort()) {
    if (existsSync(join(examples, name, 'index.html'))) {
      found.push(['examples', name, 'index.html'].join('/'));
    }
  }
  for (const name of ['cycles', 'canonn']) {
    if (existsSync(join(demoPackage, name, 'index.html'))) {
      found.push([name, 'index.html'].join('/'));
    }
  }
  return found;
}

/** The name of the first record of the demo set. */
function firstDemoName(): string {
  const demo = JSON.parse(
    readFileSync(
      join(root, 'apps', 'demo', 'demo-data', 'guardian-ruins.json'),
      'utf8',
    ),
  ) as { systems: { name: string }[] };
  return demo.systems[0]?.name as string;
}

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

/** What the library build wrote, read after the demo site build ran. */
let libraryFiles: string[] = [];
let demoFiles: string[] = [];
let page = '';

beforeAll(() => {
  execFileSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'pipe' });
  // The library build must be whole before the demo site build runs, so a failure here
  // reads as the library build's and not as the demo site's.
  expect(existsSync(join(libraryDist, 'index.js'))).toBe(true);
  expect(existsSync(join(libraryDist, 'types', 'index.d.ts'))).toBe(true);

  execFileSync('pnpm', ['run', 'build:demo-site'], { cwd: root, stdio: 'pipe' });
  libraryFiles = listFiles(libraryDist);
  demoFiles = listFiles(demoDist);
  page = readFileSync(join(demoDist, 'index.html'), 'utf8');
}, 600000);

describe('the demo site build', () => {
  // The build takes many inputs now: the demo page, the nine samples, the cycles page
  // and the Canonn page.
  // The reading is of the whole set, so a page the configuration drops is named here.
  test('writes every page of the demo package', () => {
    const built = demoFiles
      .filter((path) => path.endsWith('.html'))
      .map((path) => relative(demoDist, path).split(sep).join('/'))
      .sort();
    console.log('the pages of the built site', built);
    expect(built).toEqual([...sourcePages()].sort());
    // The nine samples, each one under its own identifier.
    expect(built.filter((path) => path.startsWith('examples/')).length).toBe(9);
  });

  test('carries the base path in every built asset URL', () => {
    const built: string[] = [];
    for (const path of demoFiles.filter((name) => name.endsWith('.html'))) {
      // Every address the page holds, whatever tag carries it. The build rewrites the
      // address of a script, a stylesheet and a picture, and it leaves the address a
      // page writes itself, so a link that opens with `/` is caught here too. The
      // reading covers every built page, so a page the configuration adds is read as
      // well.
      const pattern = /(?:src|href)="([^"]+)"/g;
      const text = readFileSync(path, 'utf8');
      let match = pattern.exec(text);
      while (match !== null) {
        // The favicon is a data URL and not a built asset.
        const url = match[1] as string;
        if (!url.startsWith('data:')) built.push(url);
        match = pattern.exec(text);
      }
    }
    console.log('the asset URLs of the built pages', built);
    expect(built.length).toBeGreaterThan(0);
    for (const url of built) expect(url.startsWith(BASE_PATH)).toBe(true);
  });

  // A link to the demo site reaches the same page after this change as before it.
  test('keeps the demo page at the root of the output', () => {
    expect(statSync(join(demoDist, 'index.html')).isFile()).toBe(true);
    expect(page).toContain('<canvas id="map"></canvas>');
  });

  // The two outputs sit inside their own packages and cannot collide, so the old
  // "does not overwrite" reading guarded nothing once the restructure landed: a path
  // under `apps/demo/dist/` could never end in `/dist-demo/index.js`. What still carries
  // weight is **what each build emits**, which is a fault a shared configuration or a
  // wrong `publicDir` would cause. So the reading is of the contents.
  test('each build emits its own kind of file and no other', () => {
    expect(statSync(join(libraryDist, 'index.js')).isFile()).toBe(true);
    expect(statSync(join(libraryDist, 'types', 'index.d.ts')).isFile()).toBe(true);
    expect(statSync(join(demoDist, 'index.html')).isFile()).toBe(true);

    // The library emits no page. The demo site is the only build with an HTML file.
    expect(libraryFiles.some((path) => path.endsWith('.html'))).toBe(false);
    expect(demoFiles.filter((path) => path.endsWith('.html')).length).toBeGreaterThan(
      0,
    );
    // The demo site emits no type declaration: it is a site, not a package.
    expect(demoFiles.some((path) => path.endsWith('.d.ts'))).toBe(false);
    // There is no reading here that the two outputs do not overlap. `listFiles` walks
    // each directory, so a comparison of the walked paths holds by construction, and a
    // comparison of the two constants holds whatever the builds wrote. What a shared
    // configuration or a wrong `publicDir` breaks is the file kinds above.
  });

  test('serves the loading picture under its own base path', () => {
    // The demo page names `EDLoader1.svg` through `import.meta.env.BASE_URL`, so the
    // built site must hold the file at the root of the base path.
    expect(existsSync(join(demoDist, 'EDLoader1.svg'))).toBe(true);
    // The library package carries no file of `public/`.
    expect(libraryFiles.some((path) => path.endsWith('EDLoader1.svg'))).toBe(false);
  });

  // The catalog holds seven entries. Six import a committed file and one fetches its
  // records, so the built site names the dump URL as well as the six files.
  test('carries the seven catalog entries', () => {
    const text = demoFiles
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    for (const id of [
      'guardian-ruins',
      'guardian-structures',
      'notable-systems',
      'uia',
      'adamastor',
      'multifaction',
      'thargoid-war',
    ]) {
      expect(text).toContain(id);
    }
    expect(text).toContain('Canonn Factions');
    expect(text).toContain('https://downloads.spansh.co.uk/factions.json.gz');
    // The spheres of the Canonn Factions entry are a committed file, as the other six
    // sets are.
    expect(text).toContain('Permit Unlocked Sector');
  });

  // `assetsInlineLimit` is 0 in `apps/demo/vite.config.ts`, so every Canonn set stays a
  // file. Vite otherwise writes an asset under 4,096 bytes into the chunk that names it,
  // as a data URL, and the Canonn page fetches its sets: an inlined one is a request the
  // browser cannot make, and every "one fetch per pick" reading would measure nothing.
  test('keeps the smallest Canonn set a file of its own', () => {
    const canonn = join(root, 'apps', 'demo', 'demo-data', 'canonn');
    const smallest = readdirSync(canonn)
      .filter((name) => name !== 'index.json')
      .map((name) => ({ name, bytes: statSync(join(canonn, name)).size }))
      .sort((a, b) => a.bytes - b.bytes)[0] as { name: string; bytes: number };
    const stem = smallest.name.replace(/\.json$/, '');
    const built = demoFiles
      .map((path) => relative(demoDist, path).split(sep).join('/'))
      .filter((path) => new RegExp(`(^|/)${stem}-[A-Za-z0-9_-]+\\.json$`).test(path));
    console.log('the smallest Canonn set', { ...smallest, built });

    // The set is small enough that the build would inline it with the setting removed.
    expect(smallest.bytes).toBeLessThan(4096);
    expect(built, `${smallest.name} is not a file of the built site`).toHaveLength(1);

    // And no chunk of the site holds its records.
    const first = (
      JSON.parse(readFileSync(join(canonn, smallest.name), 'utf8')) as {
        records: { name: string }[];
      }
    ).records[0]?.name as string;
    for (const path of demoFiles.filter((one) => one.endsWith('.js'))) {
      expect(
        readFileSync(path, 'utf8'),
        `${path} holds the records of ${smallest.name}`,
      ).not.toContain(first);
    }
  });

  test('holds the demo data, which the library build does not', () => {
    const name = firstDemoName();
    const demoCarriers = demoFiles.filter(
      (path) => path.endsWith('.js') && readFileSync(path, 'utf8').includes(name),
    );
    console.log('the demo site chunks that hold a demo record', demoCarriers);
    expect(demoCarriers.length).toBeGreaterThan(0);

    const libraryCarriers = libraryFiles.filter(
      (path) => path.endsWith('.js') && readFileSync(path, 'utf8').includes(name),
    );
    expect(libraryCarriers).toEqual([]);
  });
});
