// The demo resolves the map to the library's **source**, at all three entry points.
//
// This is the reading that proves the alias table is complete. Without it an alias table
// missing one of the three passes every other test of the change: the missing specifier
// falls through to node resolution and lands in the package's `dist/`, which works on a
// tree that has been built and fails on a fresh checkout.
//
// It does **not** delete `packages/galaxy-map/dist/` to force the case. Vitest runs test
// files in parallel workers, and `tests/demo-site-build.test.ts` builds into that same
// directory and reads it. The reading below asserts the same guarantee without removing
// anything.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const librarySrc = join(root, 'packages', 'galaxy-map', 'src');
const libraryDist = join(root, 'packages', 'galaxy-map', 'dist');

const PACKAGE = '@elite-dangerous-almanac/galaxy-map';

/** The three specifiers the demo imports, and the source file each one must reach. */
const ENTRY_POINTS = [
  { specifier: PACKAGE, file: join(librarySrc, 'index.ts') },
  { specifier: `${PACKAGE}/nebulae`, file: join(librarySrc, 'nebulae', 'index.ts') },
  { specifier: `${PACKAGE}/testing`, file: join(librarySrc, 'testing.ts') },
] as const;

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer({
    configFile: join(root, 'apps', 'demo', 'vite.config.ts'),
    root: join(root, 'apps', 'demo'),
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe('the demo dev server', () => {
  test('resolves all three entry points to the library source', async () => {
    const importer = join(root, 'apps', 'demo', 'src', 'main.ts');
    const reached: Record<string, string | undefined> = {};

    for (const entry of ENTRY_POINTS) {
      const resolved = await server.pluginContainer.resolveId(
        entry.specifier,
        importer,
      );
      reached[entry.specifier] = resolved?.id;
    }
    console.log('the demo resolves', reached);

    for (const entry of ENTRY_POINTS) {
      const id = reached[entry.specifier];
      expect(id, `${entry.specifier} does not resolve`).toBeDefined();
      // The query a Vite resolution can carry is no part of the file.
      const path = (id as string).split('?')[0] as string;
      expect(path, `${entry.specifier} is not the source file`).toBe(entry.file);
      expect(
        path.startsWith(libraryDist),
        `${entry.specifier} resolves into the build output`,
      ).toBe(false);
    }
  }, 120_000);
});

describe('the demo page', () => {
  // The scenario says the demo imports the map by its package name at all three entry
  // points. The resolution above proves the alias table carries all three; this proves
  // the page asks for all three. A page that drops one leaves an alias nothing reads.
  test('imports all three entry points by the package name', () => {
    const source = readFileSync(join(root, 'apps', 'demo', 'src', 'main.ts'), 'utf8');
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map(
      (match) => match[1] as string,
    );
    console.log('the specifiers of the demo page', specifiers);

    for (const entry of ENTRY_POINTS) {
      expect(specifiers, `${entry.specifier} is not imported`).toContain(
        entry.specifier,
      );
    }
  });
});
