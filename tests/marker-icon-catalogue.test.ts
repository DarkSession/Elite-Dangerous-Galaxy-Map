// The built-in icon catalogue against the dependency it comes from. The library reads
// the colours from `@elite-dangerous-almanac/core/galaxy-map/markers` and the vectors
// from `assets/galaxy-map/` of the same package, so two values of one dependency have to
// agree: the glyph draws in the vector's own `color` attribute and the arrow under the
// stack draws in the catalogue record's `color`.
//
// The test reads the catalogue in a node process whose working directory is the library
// package. pnpm's isolated linker puts the dependency at
// `packages/galaxy-map/node_modules/`, so a bare specifier in this file, which sits at the
// root, resolves to nothing. The child process resolves each vector with
// `import.meta.resolve`, which is what fails where the exports map does not name the
// subpath.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { BUILT_IN_ICONS } from '../packages/galaxy-map/src/scene-data/marker-icons';

const libraryRoot = fileURLToPath(new URL('../packages/galaxy-map', import.meta.url));

/** What the child process prints: one row per catalogue record. */
interface CatalogueRow {
  readonly symbol: string;
  readonly color: string;
  readonly vector: string;
}

const READ_CATALOGUE = `
import { GALAXY_MAP_MARKERS } from '@elite-dangerous-almanac/core/galaxy-map/markers';
const rows = GALAXY_MAP_MARKERS.map((marker) => ({
  symbol: marker.symbol,
  color: marker.color,
  vector: import.meta.resolve(
    '@elite-dangerous-almanac/core/assets/galaxy-map/' + marker.symbol + '.svg',
  ),
}));
process.stdout.write(JSON.stringify(rows));
`;

const catalogue: CatalogueRow[] = JSON.parse(
  execFileSync('node', ['--input-type=module', '--eval', READ_CATALOGUE], {
    cwd: libraryRoot,
    encoding: 'utf8',
  }),
) as CatalogueRow[];

/** The `color` attribute of the root element of a vector. */
function rootColorOf(markup: string): string | null {
  const root = markup.slice(markup.indexOf('<svg'), markup.indexOf('>') + 1);
  return /\scolor="([^"]+)"/.exec(root)?.[1] ?? null;
}

describe('the built-in icon catalogue', () => {
  test('holds the symbols of the dependency and no other', () => {
    const symbols = catalogue.map((row) => row.symbol).sort();
    const table = [...BUILT_IN_ICONS.keys()].sort();
    console.log('the catalogue holds', symbols);

    expect(symbols.length).toBeGreaterThan(0);
    expect(
      table,
      'The catalogue and the library table disagree. A symbol the catalogue grew ' +
        'needs its own import in `src/scene-data/marker-icons.ts`.',
    ).toEqual(symbols);
  });

  test('draws each glyph in the colour its record reports', () => {
    for (const row of catalogue) {
      const markup = readFileSync(fileURLToPath(row.vector), 'utf8');
      const vectorColor = rootColorOf(markup);
      expect(vectorColor, `${row.symbol} carries no root color`).not.toBeNull();
      expect(
        (vectorColor as string).toLowerCase(),
        `${row.symbol} draws its glyph and its arrow in two colours`,
      ).toBe(row.color.toLowerCase());
    }
  });
});
