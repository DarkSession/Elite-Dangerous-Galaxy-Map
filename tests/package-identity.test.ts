// The two manifests of the workspace, read as the published identity and as the demo's
// dependency on it.
//
// The third scenario of the same delta, "The entry point exports the fragment writer",
// is not a manifest reading: it compiles a host module against the **built** declaration,
// so it sits in `tests/main-bundle.test.ts` beside the other generated compiles.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly description?: string;
  readonly author?: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: { readonly url?: string };
  readonly bugs?: { readonly url?: string };
  readonly keywords?: readonly string[];
  readonly publishConfig?: { readonly access?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

function read(path: string): Manifest {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as Manifest;
}

const library = read('packages/galaxy-map/package.json');
const demo = read('apps/demo/package.json');

describe('the library package', () => {
  test('names its published identity', () => {
    expect(library.name).toBe('@elite-dangerous-almanac/galaxy-map');
    expect(library.private).toBeUndefined();
    expect(library.publishConfig?.access).toBe('public');

    // Each one present and not empty. A field that held an empty string would read as
    // present to a `toBeDefined`, and npm would publish it.
    expect(library.description?.length).toBeGreaterThan(0);
    expect(library.author?.length).toBeGreaterThan(0);
    expect(library.license?.length).toBeGreaterThan(0);
    expect(library.homepage?.length).toBeGreaterThan(0);
    expect(library.repository?.url).toContain('Galaxy-Map');
    expect(library.bugs?.url?.length).toBeGreaterThan(0);
    expect(library.keywords?.length).toBeGreaterThan(0);
  });

  // The library build marks these two external, so they are what a host installs. The
  // two `@fontsource` packages are read at build time and emitted as font files, so a
  // host pulls two packages and not four.
  test('a host installs two packages', () => {
    expect(Object.keys(library.dependencies ?? {}).sort()).toEqual([
      '@elite-dangerous-almanac/core',
      'gl-matrix',
    ]);
    for (const name of ['@fontsource/chakra-petch', '@fontsource/ibm-plex-mono']) {
      expect(Object.keys(library.devDependencies ?? {})).toContain(name);
      expect(Object.keys(library.dependencies ?? {})).not.toContain(name);
    }
  });

  // 0.2.16 is the first version whose `exports` map names `./assets/*`, which is what
  // makes a marker vector reachable. The hold is a measure against a hijacked
  // third-party maintainer account, and the almanac is the project's own package, so it
  // is the one name the exclude list carries.
  test('pins the almanac version and leaves the release hold alone', () => {
    expect(library.dependencies?.['@elite-dangerous-almanac/core']).toBe('0.2.16');

    const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/^minimumReleaseAge: 10080$/m);
    const exclude = /^minimumReleaseAgeExclude:\n((?:\s+- .+\n)+)/m.exec(workspace);
    expect(exclude, 'the workspace holds an exclude list').not.toBeNull();
    const names = (exclude?.[1] ?? '')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => line.trim().replace(/^- /, '').replace(/'/g, ''));
    expect(names).toEqual(['@elite-dangerous-almanac/core']);
  });

  test('names its version', () => {
    expect(library.version).toBe('0.6.0');
  });
});

describe('the demo app', () => {
  test('depends on the library through the workspace', () => {
    expect(demo.private).toBe(true);
    expect(demo.name).toBe('@elite-dangerous-almanac/galaxy-map-demo');
    expect(demo.dependencies?.['@elite-dangerous-almanac/galaxy-map']).toBe(
      'workspace:*',
    );
  });
});
