// The committed data of the cycles page, read against the manifest beside it.
//
// `tests/cycle-sets.test.ts` reads the passes of the build over fixtures. This file
// reads what the build wrote: the page gives the map one entry per manifest row, so a
// row that names no file, or a file that no row names, is a page entry that draws
// nothing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  OVERWATCH_LICENCE,
  OVERWATCH_SOURCE_URL,
} from '../apps/demo/scripts/build-demo-systems.mjs';
import { cycleFileName } from '../apps/demo/scripts/build-cycle-sets.mjs';
import { MAX_DATASETS } from '../packages/galaxy-map/src/app/datasets';
import { MAX_SYSTEMS } from '../packages/galaxy-map/src/scene-data/real-systems';

/** The committed directory of the page. */
const CYCLES = fileURLToPath(
  new URL('../apps/demo/demo-data/cycles/', import.meta.url),
);

/** The two size ceilings the page holds: 25 MB in all, and 1 MB for one cycle. */
const TOTAL_CEILING = 25_000_000;
const CYCLE_CEILING = 1_000_000;

/** One row of the manifest, as the build writes it. */
interface CycleRow {
  cycle: number;
  week: string;
  label: string;
  group: string;
  description: string;
  count: number;
}

/** One committed cycle set. */
interface CycleSet {
  source: string;
  licence: string;
  categories: readonly { name: string }[];
  systems: readonly { name: string }[];
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(CYCLES, name), 'utf8')) as T;
}

const manifest = readJson<CycleRow[]>('index.json');
const files = readdirSync(CYCLES)
  .filter((name) => name !== 'index.json')
  .sort();

describe('the manifest of the cycles page', () => {
  test('holds one row for each committed cycle', () => {
    expect(manifest.map((row) => cycleFileName(row.cycle)).sort()).toEqual(files);
  });

  test('holds the rows in cycle order', () => {
    const numbers = manifest.map((row) => row.cycle);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  test('gives each row the fields the page reads', () => {
    for (const row of manifest) {
      expect(row.label, `cycle ${row.cycle} has no label`).toContain(String(row.cycle));
      expect(row.label).toContain(row.week);
      expect(row.group, `cycle ${row.cycle} has no year`).toBe(row.week.slice(0, 4));
      expect(
        row.description.length,
        `cycle ${row.cycle} has no description`,
      ).toBeGreaterThan(0);
    }
  });

  test('holds no more rows than the catalog reads', () => {
    expect(manifest.length).toBeLessThanOrEqual(MAX_DATASETS);
  });
});

describe('each committed cycle', () => {
  const sets = manifest.map((row) => ({
    row,
    set: readJson<CycleSet>(cycleFileName(row.cycle)),
  }));

  test('holds the number of records its row states', () => {
    for (const { row, set } of sets) {
      expect(set.systems.length, `cycle ${row.cycle} holds another count`).toBe(
        row.count,
      );
    }
  });

  test('names the archive and its licence line', () => {
    for (const { row, set } of sets) {
      expect(set.source, `cycle ${row.cycle} names no source`).toBe(
        OVERWATCH_SOURCE_URL,
      );
      expect(set.licence, `cycle ${row.cycle} names no licence`).toBe(
        OVERWATCH_LICENCE,
      );
    }
  });

  test('holds at least one category and no more records than the map takes', () => {
    for (const { row, set } of sets) {
      expect(
        set.categories.length,
        `cycle ${row.cycle} holds no category`,
      ).toBeGreaterThan(0);
      expect(
        set.systems.length,
        `cycle ${row.cycle} passes the set bound`,
      ).toBeLessThanOrEqual(MAX_SYSTEMS);
    }
  });
});

describe('the size of the committed data', () => {
  const sizes = readdirSync(CYCLES).map((name) => ({
    name,
    bytes: statSync(join(CYCLES, name)).size,
  }));

  test('stays under 25 MB in all', () => {
    const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
    expect(
      total,
      `${CYCLES} holds ${total} bytes and the ceiling is ${TOTAL_CEILING}`,
    ).toBeLessThan(TOTAL_CEILING);
  });

  test('stays under 1 MB for one cycle', () => {
    for (const file of sizes) {
      if (file.name === 'index.json') continue;
      expect(
        file.bytes,
        `${file.name} holds ${file.bytes} bytes and the ceiling is ${CYCLE_CEILING}`,
      ).toBeLessThan(CYCLE_CEILING);
    }
  });
});
