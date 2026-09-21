// The committed data of the Canonn page, read against the manifest beside it.
//
// `tests/canonn-sets.test.ts` reads the passes of the build over fixtures. This file
// reads what the build wrote: the page gives the map one entry per manifest row, so a
// row that names a file the tree does not hold, or a file that no row names, is a page
// entry that draws nothing.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { filesOfRow } from '../apps/demo/canonn/canonn-message';
import {
  LICENCE,
  MAX_SET_BYTES,
  MAX_TREE_BYTES,
  SOURCE_URL,
} from '../apps/demo/scripts/build-canonn-sets.mjs';
import { MAX_DATASETS } from '../packages/galaxy-map/src/app/datasets';
import { MAX_SYSTEMS } from '../packages/galaxy-map/src/scene-data/real-systems';

/** The notices of the demo site, which name every address the build reads. */
const NOTICES = readFileSync(
  fileURLToPath(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url)),
  'utf8',
);

/** The committed directory of the page. */
const CANONN = fileURLToPath(
  new URL('../apps/demo/demo-data/canonn/', import.meta.url),
);

/** One file of one manifest row: the set it reads, and what the map calls each key. */
interface ManifestFile {
  path: string;
  categories: Record<string, { name: string; color: number[] }>;
}

/** One row of the manifest, which is one entry of the catalog. */
interface ManifestRow {
  id: string;
  label: string;
  group: string;
  description: string;
  systemCount: number;
  files: ManifestFile[];
}

/** One committed set. */
interface CanonnSet {
  source: string;
  licence: string;
  records: {
    name: string;
    coords: { x: number; y: number; z: number };
    keys?: string[];
    description?: string;
  }[];
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(CANONN, name), 'utf8')) as T;
}

const manifest = readJson<ManifestRow[]>('index.json');
const files = readdirSync(CANONN)
  .filter((name) => name !== 'index.json')
  .sort();
const sets = new Map(files.map((name) => [name, readJson<CanonnSet>(name)]));

describe('the manifest of the Canonn page', () => {
  test('names a file the tree holds, in every row', () => {
    for (const row of manifest) {
      expect(row.files.length, `${row.id} names no file`).toBeGreaterThan(0);
      for (const file of row.files) {
        expect(files, `${row.id} names ${file.path}, which is not committed`).toContain(
          file.path,
        );
      }
    }
  });

  test('names every file the tree holds', () => {
    const named = new Set(manifest.flatMap((row) => row.files.map((f) => f.path)));
    for (const name of files) {
      expect(named.has(name), `no entry reads ${name}`).toBe(true);
    }
  });

  test('gives each entry the fields the page reads', () => {
    const ids = new Set<string>();
    for (const row of manifest) {
      expect(ids.has(row.id), `${row.id} is the id of two entries`).toBe(false);
      ids.add(row.id);
      expect(row.label.length, `${row.id} has no label`).toBeGreaterThan(0);
      expect(row.group.length, `${row.id} has no group`).toBeGreaterThan(0);
    }
  });

  // The dataset dialog shows the line and hides the paragraph where it is empty, so an
  // entry with no description opens on a blank detail panel.
  test('says what each entry records and where the records come from', () => {
    for (const row of manifest) {
      expect(row.description, `${row.id} has no description`).toBeTruthy();
      expect(row.description, `${row.id} does not name what it holds`).toContain(
        `${row.systemCount} records`,
      );
      // A split part says which part it is, which its label carries.
      expect(row.description, `${row.id} does not name itself`).toContain(row.label);
      // And where the records come from, which is the host of each address it read.
      expect(row.description, `${row.id} names no source`).toMatch(/ from \S/);
      expect(row.description.endsWith('.'), `${row.id} has no full stop`).toBe(true);
    }
  });

  test('gives each key of each file a name and a colour', () => {
    for (const row of manifest) {
      for (const file of row.files) {
        const named = Object.values(file.categories);
        expect(
          named.length,
          `${row.id} names no category of ${file.path}`,
        ).toBeGreaterThan(0);
        for (const category of named) {
          expect(
            category.name.length,
            `${row.id} holds a category with no name`,
          ).toBeGreaterThan(0);
          expect(
            category.color,
            `${category.name} of ${row.id} has no colour`,
          ).toHaveLength(3);
          for (const part of category.color) {
            expect(
              part,
              `${category.name} of ${row.id} holds ${part}`,
            ).toBeGreaterThanOrEqual(0);
            expect(part).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });

  test('holds no more rows than the catalog reads', () => {
    expect(manifest.length).toBeLessThanOrEqual(MAX_DATASETS);
  });
});

describe('each entry of the Canonn page', () => {
  test('counts the records of the files it names', () => {
    for (const row of manifest) {
      const count = row.files.reduce(
        (total, file) => total + (sets.get(file.path)?.records.length ?? 0),
        0,
      );
      expect(row.systemCount, `${row.id} states another count`).toBe(count);
    }
  });

  test('holds no more records than the map takes', () => {
    for (const row of manifest) {
      expect(row.systemCount, `${row.id} passes the set bound`).toBeLessThanOrEqual(
        MAX_SYSTEMS,
      );
    }
  });
});

describe('each committed set', () => {
  test('names its source and its licence line', () => {
    for (const [name, set] of sets) {
      expect(set.source.length, `${name} names no source`).toBeGreaterThan(0);
      expect(set.licence.length, `${name} names no licence`).toBeGreaterThan(0);
      if (set.source === SOURCE_URL) expect(set.licence, `${name}`).toBe(LICENCE);
    }
  });

  // The notices say where the records come from and under which terms. A set that names
  // an address no section holds is data the repository redistributes with no notice.
  test('names an address the notices hold', () => {
    for (const [name, set] of sets) {
      expect(NOTICES, `${name} names ${set.source}, which no notice holds`).toContain(
        set.source,
      );
    }
  });

  // The spec: a record does not repeat one of its own keys as its description. The build
  // drops the repeat at the one exit every reader routes through.
  test('repeats no key of a record as the description of that record', () => {
    for (const [name, set] of sets) {
      const echoed = set.records.filter(
        (record) =>
          record.description !== undefined &&
          (record.keys ?? []).includes(record.description),
      );
      expect(
        echoed.map((record) => record.name),
        `${name} repeats a key as a description`,
      ).toEqual([]);
    }
  });

  test('holds records the page can draw', () => {
    for (const [name, set] of sets) {
      expect(set.records.length, `${name} holds no record`).toBeGreaterThan(0);
      expect(set.records.length, `${name} passes the set bound`).toBeLessThanOrEqual(
        MAX_SYSTEMS,
      );
      const first = set.records[0] as CanonnSet['records'][number];
      expect(first.name.length, `${name} holds a record with no name`).toBeGreaterThan(
        0,
      );
      for (const part of [first.coords.x, first.coords.y, first.coords.z]) {
        expect(Number.isFinite(part), `${name} holds a record with no coordinate`).toBe(
          true,
        );
      }
    }
  });

  // One file serves every map that reads the source, and a map that reads a source a
  // second time reads the file that is already there. Two files of one content would
  // therefore be one source the build committed twice.
  test('is committed once', () => {
    const held = new Map<string, string>();
    for (const name of files) {
      const digest = createHash('sha256')
        .update(readFileSync(join(CANONN, name)))
        .digest('hex');
      const first = held.get(digest);
      expect(first, `${name} holds what ${String(first)} holds`).toBeUndefined();
      held.set(digest, name);
    }
  });
});

describe('the split of a map into entries', () => {
  // The worker drops a key the row does not name, and drops a record that keeps no name,
  // so a record whose keys the row names none of never reaches the map. The `partKeys`
  // filter of the build is what holds the two together, and nothing else reads it.
  test('names a category of every record of every file it reads', () => {
    let rows = 0;
    for (const row of manifest) {
      for (const file of row.files) {
        rows += 1;
        const dropped = (sets.get(file.path)?.records ?? []).filter(
          (record) =>
            !(record.keys ?? ['']).some((key) => file.categories[key] !== undefined),
        );
        expect(
          dropped.map((record) => record.name),
          `${row.id} reads ${file.path} and names no category of these records`,
        ).toEqual([]);
      }
    }
    // Every file of every entry was read, and not an empty list of them.
    expect(rows).toBeGreaterThan(manifest.length);
  });

  // The scenario "A file of several categories keeps them all". The Clouds map draws 35
  // keys from a column of 24 values, and the entry passes the set bound, so the build
  // cuts it into parts by first key. The cut is over the files and the entries together,
  // so the keys survive the split only if every part carries its own.
  test('keeps every key of the Clouds map over the parts it splits into', () => {
    const cloud = manifest.filter((row) => row.id.split('-')[0] === 'Cloud');
    const keys = new Set<string>();
    const names = new Set<string>();
    for (const row of cloud) {
      for (const file of row.files) {
        for (const [key, category] of Object.entries(file.categories)) {
          keys.add(key);
          names.add(category.name);
        }
      }
    }
    expect(cloud).toHaveLength(25);
    expect(keys.size, 'the Clouds parts hold another number of keys').toBe(35);
    // One name per key, so no two keys collapsed into one category on the page.
    expect(names.size, 'two keys of the Clouds map share a name').toBe(35);
  });
});

describe('the fetch list of one entry', () => {
  test('names each file of a row once', () => {
    const twice = [
      { path: 'a.json', categories: { x: { name: 'Ex', color: [1, 2, 3] } } },
      { path: 'b.json', categories: { y: { name: 'Why', color: [1, 2, 3] } } },
      { path: 'a.json', categories: { z: { name: 'Zed', color: [1, 2, 3] } } },
    ];
    const files = filesOfRow(twice);
    // Two requests and not three, and the repeated path keeps the names of both rows.
    expect(files.map((file) => file.path)).toEqual(['a.json', 'b.json']);
    expect(files[0]?.names).toEqual({ x: 'Ex', z: 'Zed' });
    expect(files[1]?.names).toEqual({ y: 'Why' });
  });

  test('gives one entry per file of every committed row', () => {
    for (const row of manifest) {
      const files = filesOfRow(row.files);
      expect(
        files.map((file) => file.path),
        `${row.id} names one path twice`,
      ).toEqual(row.files.map((file) => file.path));
      for (const [at, file] of files.entries()) {
        const named = row.files[at]?.categories ?? {};
        expect(Object.keys(file.names).sort()).toEqual(Object.keys(named).sort());
      }
    }
  });
});

describe('the size of the committed data', () => {
  const sizes = readdirSync(CANONN).map((name) => ({
    name,
    bytes: statSync(join(CANONN, name)).size,
  }));

  test('stays under the tree ceiling', () => {
    const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
    expect(
      total,
      `${CANONN} holds ${total} bytes and the ceiling is ${MAX_TREE_BYTES}`,
    ).toBeLessThan(MAX_TREE_BYTES);
  });

  test('stays under the set ceiling for one file', () => {
    for (const file of sizes) {
      if (file.name === 'index.json') continue;
      expect(
        file.bytes,
        `${file.name} holds ${file.bytes} bytes and the ceiling is ${MAX_SET_BYTES}`,
      ).toBeLessThanOrEqual(MAX_SET_BYTES);
    }
  });
});
