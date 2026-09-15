// What the demo site build emits, and that the two builds keep out of each other's way.
//
// The test runs `pnpm build` and then `pnpm build:demo-site`, which is the order the
// check job runs them in. `pnpm build` writes the library to `dist/` and the demo site
// build writes to `dist-demo/`, so the second build leaves the first one's output where
// the package names it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Where the repository's GitHub Pages site serves from. */
const BASE_PATH = '/Elite-Dangerous-Galaxy-Map/';

/** The name of the first record of the demo set. */
function firstDemoName(): string {
  const demo = JSON.parse(
    readFileSync(join(root, 'demo-data', 'guardian-ruins.json'), 'utf8'),
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
  expect(existsSync(join(root, 'dist', 'index.js'))).toBe(true);
  expect(existsSync(join(root, 'dist', 'types', 'index.d.ts'))).toBe(true);

  execFileSync('pnpm', ['run', 'build:demo-site'], { cwd: root, stdio: 'pipe' });
  libraryFiles = listFiles(join(root, 'dist'));
  demoFiles = listFiles(join(root, 'dist-demo'));
  page = readFileSync(join(root, 'dist-demo', 'index.html'), 'utf8');
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

  test('does not overwrite the library build', () => {
    expect(statSync(join(root, 'dist', 'index.js')).isFile()).toBe(true);
    expect(statSync(join(root, 'dist', 'types', 'index.d.ts')).isFile()).toBe(true);
    expect(statSync(join(root, 'dist-demo', 'index.html')).isFile()).toBe(true);
    // Neither build writes into the other's directory.
    expect(libraryFiles.some((path) => path.endsWith('index.html'))).toBe(false);
    expect(demoFiles.some((path) => path.endsWith('/dist-demo/index.js'))).toBe(false);
  });

  test('serves the loading picture under its own base path', () => {
    // The demo page names `EDLoader1.svg` through `import.meta.env.BASE_URL`, so the
    // built site must hold the file at the root of the base path.
    expect(existsSync(join(root, 'dist-demo', 'EDLoader1.svg'))).toBe(true);
    // The library package carries no file of `public/`.
    expect(libraryFiles.some((path) => path.endsWith('EDLoader1.svg'))).toBe(false);
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
