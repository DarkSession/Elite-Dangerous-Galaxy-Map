// What the demo site build emits, and what each build carries.
//
// The test runs `pnpm build` and then `pnpm build:demo-site`, which is the order the
// check job runs them in. Each build now writes **inside its own package**:
// `packages/galaxy-map/dist/` and `apps/demo/dist/`. Neither can land where the other is
// looked for, which is why `dist-demo/` is gone.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
/** Where each build writes. Each one is inside its own package. */
const libraryDist = join(root, 'packages', 'galaxy-map', 'dist');
const demoDist = join(root, 'apps', 'demo', 'dist');

/** Where the repository's GitHub Pages site serves from. */
const BASE_PATH = '/Galaxy-Map/';

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
  test('carries the base path in every built asset URL', () => {
    const pattern = /(?:src|href)="([^"]+)"/g;
    const urls: string[] = [];
    let match = pattern.exec(page);
    while (match !== null) {
      urls.push(match[1] as string);
      match = pattern.exec(page);
    }
    console.log('the URLs of the built page', urls);
    // The favicon is a data URL and not a built asset.
    const built = urls.filter((url) => !url.startsWith('data:'));
    expect(built.length).toBeGreaterThan(0);
    for (const url of built) expect(url.startsWith(BASE_PATH)).toBe(true);
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
