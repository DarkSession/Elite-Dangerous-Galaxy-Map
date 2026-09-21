// The passes of `apps/demo/scripts/build-canonn-sets.mjs`, read over fixtures.
//
// The build reads 49 maps of the Canonn source tree. What this file reads is the table,
// the readers that make the keys, the file table and the two splits, each with no network.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  categoriesOf,
  checkAgainstHeld,
  checkCatalog,
  CONTENTS_URL,
  convertSource,
  describeEntry,
  fileNameOf,
  main,
  keysOf,
  MAPS,
  MAX_DATASETS,
  MAX_SET_BYTES,
  MAX_SYSTEMS,
  readMapList,
  setBytes,
  sourcesOf,
  splitEntry,
  splitSource,
  stableColour,
} from '../apps/demo/scripts/build-canonn-sets.mjs';
import type {
  CanonnFileRow,
  CanonnRecord,
  CanonnMap,
  CanonnSource,
  ListingAnswer,
} from '../apps/demo/scripts/build-canonn-sets.mjs';
import { MAX_DATASETS as LIBRARY_MAX_DATASETS } from '../packages/galaxy-map/src/app/datasets';
import { MAX_SYSTEMS as LIBRARY_MAX_SYSTEMS } from '../packages/galaxy-map/src/scene-data/real-systems';

/** The file of one fixture. */
function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)),
    'utf8',
  );
}

/** The listing of the Canonn source tree, which holds one file the table does not name. */
const listing = JSON.parse(fixture('canonn-source-listing.json')) as { name: string }[];

/** The same listing without the unknown file, which is what the tree itself holds. */
const known = listing.filter((entry) => entry.name !== 'MapData-Unknown.js');

/** One source of the table, by the address it reads. */
function sourceOf(path: string): CanonnSource {
  for (const map of MAPS) {
    for (const entry of map.sources) {
      if (entry.path === path) return entry;
    }
  }
  throw new Error(`The table names no source ${path}`);
}

/**
 * The six reasons the spec fixes for a map the build leaves out. The build prints one of
 * them for each map it drops, so a reader can tell a retired endpoint from a broken one.
 */
const DROP_REASONS = new Set([
  'unreachable host',
  '404 gone',
  '410 gone',
  '500 server error',
  'converts to no record',
  'live but larger than the ceiling',
]);

/**
 * A word the map table carries on one address and the build never prints as the reason a
 * map drops. The three maps that hold it drop on the `500 server error` of their first
 * address, which is what the spec's table names them by.
 */
const NOT_A_DROP = new Set(['no coordinates of its own']);

describe('the map table', () => {
  test('holds one row per map file of the Canonn source tree', () => {
    expect(MAPS).toHaveLength(49);
    expect(readMapList(known)).toHaveLength(49);
  });

  test('names a file of the tree in every row', () => {
    const files = new Set(known.map((entry) => entry.name));
    for (const map of MAPS) {
      expect(files.has(`MapData-${map.id}.js`)).toBe(true);
    }
  });

  test('gives every row a label, a group and a source', () => {
    for (const map of MAPS) {
      expect(map.label.length).toBeGreaterThan(0);
      expect(map.group.length).toBeGreaterThan(0);
      expect(map.sources.length).toBeGreaterThan(0);
    }
  });

  test('marks the maps the demo page already converts', () => {
    expect(MAPS.filter((map) => map.demo === true).map((map) => map.id)).toEqual([
      'GR',
      'GS',
      'multifaction',
      'Adamastor',
      'UIA',
    ]);
  });

  test('gives every map it drops a reason from the spec vocabulary', () => {
    for (const map of MAPS) {
      // A map with no reader at all does not ship, so one of its addresses says why.
      if (!map.sources.every((entry) => entry.reader === null)) continue;
      expect(map.sources.some((entry) => entry.why !== undefined)).toBe(true);
      // The reason the build prints is the first address that carries one, or the
      // fallback where every address answered. Both are in the fixed vocabulary.
      const printed =
        map.sources.find((entry) => entry.why !== undefined)?.why ??
        'converts to no record';
      expect(DROP_REASONS.has(printed), `${map.id} says ${printed}`).toBe(true);
    }
  });

  test('gives every dead address a reason the vocabulary or the table names', () => {
    for (const map of MAPS) {
      for (const entry of map.sources) {
        if (entry.reader !== null) continue;
        const why = entry.why ?? '';
        expect(
          DROP_REASONS.has(why) || NOT_A_DROP.has(why),
          `${map.id} says ${why} of ${entry.path}`,
        ).toBe(true);
      }
    }
  });

  test('fails, naming the file, on a map the table does not name', () => {
    expect(() => readMapList(listing)).toThrow(/MapData-Unknown\.js/);
  });

  test('fails, naming the file, on a row the tree no longer holds', () => {
    const gone = known.filter((entry) => entry.name !== 'MapData-GB.js');
    expect(() => readMapList(gone)).toThrow(/MapData-GB\.js/);
  });

  test('fails on a listing it cannot read', () => {
    expect(() => readMapList([])).toThrow(/holds no file/);
  });
});

describe('the listing reader', () => {
  test('fails, naming the address, where the listing answers with an error', async () => {
    const read = async (): Promise<ListingAnswer> => ({
      ok: false,
      status: 403,
      json: async () => [],
    });
    const { listSourceTree } =
      await import('../apps/demo/scripts/build-canonn-sets.mjs');
    await expect(listSourceTree(read)).rejects.toThrow(/403/);
  });
});

describe('the literal reader', () => {
  const adamastor =
    'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/MapData-Adamastor.js';
  const uia =
    'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/MapData-UIA.js';

  test('converts the records a map file holds itself', () => {
    for (const [path, file] of [
      [adamastor, 'adamastor-extract.js'],
      [uia, 'uia-extract.js'],
    ]) {
      const reading = convertSource(sourceOf(path), fixture(file));
      expect(reading.records.length).toBeGreaterThan(0);
      expect(reading.categories).not.toBeNull();
      for (const record of reading.records) {
        expect(Number.isFinite(record.coords.x)).toBe(true);
        expect(record.keys?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test('takes the name and the colour of a key from the map file itself', () => {
    const entry = sourceOf(adamastor);
    const reading = convertSource(entry, fixture('adamastor-extract.js'));
    const keys = keysOf(reading.records);
    const categories = categoriesOf(entry, keys, 'Adamastor', reading.categories);
    for (const key of keys) {
      expect(categories[key].name).toBe(key);
      expect(categories[key].color).toHaveLength(3);
    }
  });
});

describe('the dump reader', () => {
  test('makes one record of the sites one system holds', () => {
    const dump = [
      { 'System Name': 'Synuefe', x: 1, y: 2, z: 3 },
      { 'System Name': 'Synuefe', x: 1, y: 2, z: 3 },
      { 'System Name': 'Col 173', x: 4, y: 5, z: 6 },
    ];
    const reading = convertSource(
      sourceOf('https://storage.googleapis.com/canonn-downloads/guardian_beacons.json'),
      JSON.stringify(dump),
    );
    expect(reading.records).toHaveLength(2);
    expect(reading.records[0].keys).toEqual(['Beacon']);
  });

  test('names a megaship and a generation ship after the ship and its system', () => {
    const dump = [{ 'POI Name': 'The Gnosis', System: 'Varati', X: 1, Y: 2, Z: 3 }];
    for (const path of [
      'https://storage.googleapis.com/canonn-downloads/megaships.json',
      'https://storage.googleapis.com/canonn-downloads/generationships.json',
    ]) {
      const reading = convertSource(sourceOf(path), JSON.stringify(dump));
      expect(reading.records[0].name).toBe('The Gnosis (Varati)');
    }
  });

  test('reads the two Operation Ida dumps', () => {
    const repairs = convertSource(
      sourceOf('https://storage.googleapis.com/canonn-downloads/ida_repairs.json'),
      JSON.stringify([
        { Station: 'Eugene Cernan', System: 'Hind Mine', x: 1, y: 2, z: 3 },
      ]),
    );
    expect(repairs.records[0].keys).toEqual(['Repairs']);
    const colonisation = convertSource(
      sourceOf('https://storage.googleapis.com/canonn-downloads/ida_colonisation.json'),
      JSON.stringify([{ System: 'Hind Mine', x: 1, y: 2, z: 3 }]),
    );
    expect(colonisation.records[0].keys).toEqual(['Colonisation']);
  });

  test('gives the Clouds map 35 keys where the column holds 24 values', () => {
    const rows = JSON.parse(fixture('canonn-clouds.json')) as { category: string }[];
    const reading = convertSource(
      sourceOf('https://storage.googleapis.com/canonn-downloads/clouds.json'),
      JSON.stringify(rows),
    );
    expect(new Set(rows.map((row) => row.category)).size).toBe(24);
    expect(keysOf(reading.records)).toHaveLength(35);
  });

  test('renames a storm cloud to a Lagrange cloud, as the map does', () => {
    const reading = convertSource(
      sourceOf('https://storage.googleapis.com/canonn-downloads/clouds.json'),
      JSON.stringify([
        {
          system: 'A',
          x: 1,
          y: 2,
          z: 3,
          category: 'Storm Cloud',
          description: 'Croceum',
        },
        {
          system: 'B',
          x: 1,
          y: 2,
          z: 3,
          category: 'Metallic Crystals',
          description: 'Shard',
        },
      ]),
    );
    expect(reading.records[0].keys).toEqual(['Croceum']);
    expect(reading.records[1].keys).toEqual(['Metallic Crystals']);
  });
});

describe('the codex reader', () => {
  const codex =
    'https://storage.googleapis.com/canonn-downloads/dumpr/Biology/2100201.csv';
  const thargoid =
    'https://storage.googleapis.com/canonn-downloads/dumpr/Thargoid/2100101.csv';

  test('reads a file of each subject and keeps one record per system', () => {
    for (const path of [codex, thargoid]) {
      const reading = convertSource(
        sourceOf(path),
        'Synuefe,1,2,3\nSynuefe,1,2,3\nCol 173,4,5,6\n',
      );
      expect(reading.records).toHaveLength(2);
    }
  });

  test('gives a codex record no key and no description', () => {
    const reading = convertSource(sourceOf(codex), 'Synuefe,1,2,3\n');
    expect(reading.records[0].keys).toBeUndefined();
    expect(reading.records[0].description).toBeUndefined();
  });

  test('names the source and leaves it out where the columns do not match', () => {
    expect(() => convertSource(sourceOf(codex), 'name;x;y;z\nSynuefe;1;2;3\n')).toThrow(
      /2100201\.csv/,
    );
  });
});

describe('the query reader', () => {
  const nhss =
    'https://us-central1-canonn-api-236217.cloudfunctions.net/query/thargoid/nhss/systems';

  test('keys a system on every threat level it holds and on its bubble', () => {
    const reading = convertSource(
      sourceOf(nhss),
      JSON.stringify([
        {
          systemName: 'Merope',
          x: 1,
          y: 2,
          z: 3,
          threat_3: 2,
          threat_7: 1,
          bubble: 'Pleiades',
        },
      ]),
    );
    expect(reading.records[0].keys).toEqual(['3', '7', 'Pleiades']);
  });

  test('fails, naming the address, where the endpoint answers with an error', async () => {
    const { fetchSource } = await import('../apps/demo/scripts/build-canonn-sets.mjs');
    const read = async (): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
    }> => ({
      ok: false,
      status: 404,
      text: async () => '',
    });
    await expect(
      fetchSource(
        { path: 'https://example.test/none.json', reader: 'beacons', names: {} },
        read,
      ),
    ).rejects.toThrow(/example\.test\/none\.json/);
  });
});

describe('the key rule of a shared source', () => {
  test('gives one file to the maps that read one source', () => {
    const sources = sourcesOf();
    const ruins = sources.get(
      fileNameOf({
        path: 'https://storage.googleapis.com/canonn-downloads/guardian_ruins.json',
      }),
    );
    expect(ruins?.maps).toContain('GR');
    expect(ruins?.maps).toContain('Guardians');
    expect(ruins?.maps).toContain('Aliens');
  });

  test('writes no source to two paths', () => {
    // The address and the filter together, because the build reads the faction dump under
    // two filters and each filter makes its own records.
    const paths = new Map<string, string>();
    for (const entry of sourcesOf().values()) {
      const key = [entry.path, ...(entry.select ?? [])].join(' ');
      const held = paths.get(key);
      if (held !== undefined) expect(held).toBe(entry.file);
      paths.set(key, entry.file);
    }
  });

  test('gives each map its own name and colour for one shared source', () => {
    const path = 'https://storage.googleapis.com/canonn-downloads/guardian_ruins.json';
    const keys = ['Alpha', 'Beta', 'Gamma', 'Unknown'];
    const ruins = categoriesOf(
      MAPS.find((map) => map.id === 'GR')!.sources[0],
      keys,
      'GR',
    );
    const aliens = categoriesOf(
      MAPS.find((map) => map.id === 'Aliens')!.sources.find(
        (one) => one.path === path,
      )!,
      keys,
      'Aliens',
    );
    expect(ruins.Alpha.name).toBe('Alpha');
    expect(aliens.Alpha.name).toBe('Guardian Ruins');
    expect(aliens.Alpha.color).toEqual([68, 136, 255]);
  });

  test('fails, naming both maps and the file, where a second map keys it differently', () => {
    const path = 'https://storage.googleapis.com/canonn-downloads/guardian_ruins.json';
    const maps = [
      {
        id: 'One',
        label: 'One',
        group: 'Test',
        sources: [{ path, reader: 'ruins', names: {} }],
      },
      {
        id: 'Two',
        label: 'Two',
        group: 'Test',
        sources: [{ path, reader: 'beacons', names: {} }],
      },
    ] as unknown as CanonnMap[];
    expect(() => sourcesOf(maps)).toThrow(/One.*Two.*guardian_ruins\.json/s);
  });

  test('adds a file two categories of one map name under both', () => {
    // No map of the table names one file twice any more, so the reading is of a map that
    // does. `MapData-All.js` is the map that did, and the row below corrects it.
    const path =
      'https://storage.googleapis.com/canonn-downloads/dumpr/Biology/2100301.csv';
    const twice = [
      {
        id: 'Twice',
        label: 'Twice',
        group: 'Test',
        sources: [
          { path, reader: 'codex', names: { '': { name: 'One', colour: 'FF0000' } } },
          { path, reader: 'codex', names: { '': { name: 'Two', colour: '00FF00' } } },
        ],
      },
    ] as unknown as CanonnMap[];
    const sources = sourcesOf(twice);
    expect(sources.size).toBe(1);
    expect(
      twice[0].sources.map((entry) => categoriesOf(entry, [''], 'Twice')[''].name),
    ).toEqual(['One', 'Two']);
    expect(fileNameOf(twice[0].sources[0])).toBe(fileNameOf(twice[0].sources[1]));
  });

  test('reads the bark mound dump under the bark mound name of the All Sites map', () => {
    // `MapData-All.js` points its bark mound slot at a Thargoid barnacle file. The table
    // reads the bark mound dump the BM map reads, under the name the All Sites row gives.
    const all = MAPS.find((map) => map.id === 'All')!;
    const named = all.sources.filter(
      (entry) => categoriesOf(entry, [''], 'All')['']?.name === '(BM) Bark Mounds',
    );
    expect(named).toHaveLength(1);
    expect(named[0].path).toBe(
      'https://storage.googleapis.com/canonn-downloads/dumpr/Biology/2100301.csv',
    );
    expect(MAPS.find((map) => map.id === 'BM')!.sources[0].path).toBe(named[0].path);
  });
});

describe('the colours', () => {
  test('gives a key the same colour on a second run', () => {
    expect(stableColour('Cloud:Life Cloud')).toEqual(stableColour('Cloud:Life Cloud'));
    expect(stableColour('Cloud:Life Cloud')).not.toEqual(
      stableColour('Cloud:Life Ring'),
    );
  });

  test('keeps the colour of a key where another key is added beside it', () => {
    const entry = MAPS.find((map) => map.id === 'GR')!.sources[0];
    const first = categoriesOf(entry, ['Alpha', 'Beta'], 'GR');
    const second = categoriesOf(entry, ['Alpha', 'Beta', 'Gamma'], 'GR');
    expect(second.Alpha.color).toEqual(first.Alpha.color);
  });

  test('reads the palette of a map that has one, in source order', () => {
    const entry = MAPS.find((map) => map.id === 'GEC')!.sources[0];
    const categories = categoriesOf(
      entry,
      ['Sights and Scenery', 'Stellar Features'],
      'GEC',
    );
    expect(categories['Sights and Scenery'].color).toEqual([245, 161, 66]);
    expect(categories['Stellar Features'].color).toEqual([66, 176, 245]);
  });
});

describe('the two bounds', () => {
  /** A list of records, each one of the key the caller names. */
  function records(count: number, key: string, fill = ''): CanonnRecord[] {
    return Array.from({ length: count }, (_unused, index) => ({
      name: `${key} ${index}`,
      coords: { x: index, y: index, z: index },
      keys: [key],
      ...(fill.length > 0 ? { description: fill } : {}),
    }));
  }

  test('reads the record bound from the library and not from a number of its own', () => {
    expect(MAX_SYSTEMS).toBe(LIBRARY_MAX_SYSTEMS);
    expect(MAX_DATASETS).toBe(LIBRARY_MAX_DATASETS);
  });

  test('splits a source of three times the record bound and loses no record', () => {
    const whole = [
      ...records(MAX_SYSTEMS + 10, 'Alpha'),
      ...records(MAX_SYSTEMS + 10, 'Beta'),
      ...records(MAX_SYSTEMS + 10, 'Gamma'),
    ];
    const parts = splitSource(whole, 'test');
    const names = new Set(parts.map((part) => part.name));
    expect(names.size).toBe(parts.length);
    expect(parts.reduce((total, part) => total + part.records.length, 0)).toBe(
      whole.length,
    );
    for (const part of parts) {
      expect(part.records.length).toBeLessThanOrEqual(MAX_SYSTEMS);
      expect(setBytes(part.records)).toBeLessThanOrEqual(MAX_SET_BYTES);
    }
  });

  test('splits a source inside the record bound and over the byte ceiling', () => {
    const fill = 'x'.repeat(2000);
    const whole = [...records(6000, 'Alpha', fill), ...records(6000, 'Beta', fill)];
    expect(whole.length).toBeLessThan(MAX_SYSTEMS);
    expect(setBytes(whole)).toBeGreaterThan(MAX_SET_BYTES);
    const parts = splitSource(whole, 'test');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.reduce((total, part) => total + part.records.length, 0)).toBe(
      whole.length,
    );
    for (const part of parts) {
      expect(setBytes(part.records)).toBeLessThanOrEqual(MAX_SET_BYTES);
    }
  });

  test('gives a split entry the map id, the category and the part number', () => {
    const map = {
      id: 'Test',
      label: 'Test map',
      group: 'Test',
    } as unknown as CanonnMap;
    const rows: CanonnFileRow[] = [
      {
        path: 'a.json',
        categories: { a: { name: 'Alpha', color: [1, 2, 3] } },
        count: 40000,
        bytes: 10,
      },
      {
        path: 'b.json',
        categories: { a: { name: 'Alpha', color: [1, 2, 3] } },
        count: 40000,
        bytes: 10,
      },
      {
        path: 'c.json',
        categories: { b: { name: 'Beta', color: [1, 2, 3] } },
        count: 10,
        bytes: 10,
      },
    ];
    const entries = splitEntry(map, rows);
    expect(entries.map((entry) => entry.id)).toEqual([
      'Test-alpha-1',
      'Test-alpha-2',
      'Test-beta',
    ]);
    expect(entries.every((entry) => entry.group === 'Test')).toBe(true);
    expect(entries.reduce((total, entry) => total + entry.count, 0)).toBe(80010);
  });

  test('fails where the splits make more entries than the catalog reads', () => {
    expect(() => checkCatalog(MAX_DATASETS)).not.toThrow();
    expect(() => checkCatalog(MAX_DATASETS + 1)).toThrow(/257/);
  });
});

describe('the guard on the committed tree', () => {
  const map = MAPS.find((one) => one.id === 'GR')!;

  test('fails, naming both counts, where a map gives no record', () => {
    expect(() => checkAgainstHeld(map, 0, new Map([['GR', 212]]))).toThrow(/212/);
  });

  test('fails where a map gives 10 percent fewer records', () => {
    expect(() => checkAgainstHeld(map, 170, new Map([['GR', 212]]))).toThrow(
      /170.*212/s,
    );
  });

  test('passes a map the committed tree does not hold', () => {
    expect(() => checkAgainstHeld(map, 0, new Map())).not.toThrow();
  });
});

describe('the guard on a repeated description', () => {
  const clouds = 'https://storage.googleapis.com/canonn-downloads/clouds.json';

  test('drops a description that repeats one of the record keys', () => {
    const reading = convertSource(
      sourceOf(clouds),
      JSON.stringify([
        {
          system: 'A',
          x: 1,
          y: 2,
          z: 3,
          category: 'FSS Signals',
          description: 'Life Cloud',
        },
      ]),
    );
    // The Clouds reader keys on the description column, so the key and the description
    // are one string. The record keeps the key and carries no description.
    expect(reading.records[0]?.keys).toEqual(['Life Cloud']);
    expect(reading.records[0]?.description).toBeUndefined();
  });

  test('keeps a description the record keys do not hold', () => {
    const reading = convertSource(
      sourceOf(clouds),
      JSON.stringify([
        {
          system: 'A',
          x: 1,
          y: 2,
          z: 3,
          category: 'Metallic Crystals',
          description: 'Shard',
        },
      ]),
    );
    expect(reading.records[0]?.keys).toEqual(['Metallic Crystals']);
    expect(reading.records[0]?.description).toBe('Shard');
  });

  test('drops it in every reader, over the whole fixture', () => {
    const reading = convertSource(sourceOf(clouds), fixture('canonn-clouds.json'));
    const echoed = reading.records.filter((record) =>
      (record.keys ?? []).includes(record.description ?? '\u0000'),
    );
    expect(echoed).toEqual([]);
  });
});

describe('the line each entry carries', () => {
  const entry = {
    id: 'GR',
    label: 'Guardian Ruins',
    group: 'Guardians',
    count: 212,
    rows: [
      {
        path: 'guardian-ruins.json',
        categories: {
          Alpha: { name: 'Alpha', color: [1, 2, 3] },
          Beta: { name: 'Beta', color: [1, 2, 3] },
        },
        count: 212,
        bytes: 10,
      },
    ],
  };

  test('says what the entry holds and where the records come from', () => {
    const line = describeEntry(
      entry,
      () => 'https://storage.googleapis.com/canonn-downloads/guardian_ruins.json',
    );
    expect(line).toContain('Guardian Ruins');
    expect(line).toContain('212 records');
    expect(line).toContain('2 categories');
    expect(line).toContain('storage.googleapis.com');
  });

  test('counts one category in the singular', () => {
    const one = {
      ...entry,
      rows: [
        {
          ...(entry.rows[0] as CanonnFileRow),
          categories: { Alpha: { name: 'Alpha', color: [1, 2, 3] } },
        },
      ],
    };
    expect(describeEntry(one, () => 'https://edastro.com/gec/json/all')).toContain(
      '1 category',
    );
  });
});

describe('the numbered cut of one source', () => {
  test('measures every slice and not the first one alone', () => {
    // The first slice is 50,000 short records, which fits, and the records after it are
    // heavy. A cut that measured the first slice alone would take that count and write
    // the second slice over the byte ceiling.
    const records: CanonnRecord[] = [];
    for (let at = 0; at < MAX_SYSTEMS; at += 1) {
      records.push({ name: `S${at}`, coords: { x: 1, y: 2, z: 3 } });
    }
    for (let at = 0; at < 20000; at += 1) {
      records.push({
        name: `H${at}`,
        coords: { x: 1, y: 2, z: 3 },
        description: 'x'.repeat(1100),
      });
    }
    const parts = splitSource(records, 'heavy');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(
        part.records.length,
        `${part.name} passes the record bound`,
      ).toBeLessThanOrEqual(MAX_SYSTEMS);
      expect(
        setBytes(part.records),
        `${part.name} passes the byte ceiling`,
      ).toBeLessThanOrEqual(MAX_SET_BYTES);
    }
    expect(parts.reduce((total, part) => total + part.records.length, 0)).toBe(
      records.length,
    );
  });
});

describe('the split key of an entry', () => {
  test('fails, naming the file and the map, where a file names no category', () => {
    const map = MAPS.find((one) => one.id === 'GR') as CanonnMap;
    const rows: CanonnFileRow[] = [
      { path: 'a.json', categories: {}, count: MAX_SYSTEMS, bytes: 10 },
      { path: 'b.json', categories: {}, count: MAX_SYSTEMS, bytes: 10 },
    ];
    expect(() => splitEntry(map, rows)).toThrow(/a\.json.*GR/s);
  });
});

describe('the build over a day every source fails', () => {
  /** A listing answer for the contents call, and an error for every source. */
  const readNothing = async (url: string): Promise<ListingAnswer> =>
    url === CONTENTS_URL
      ? { ok: true, status: 200, json: async () => known }
      : { ok: false, status: 503, json: async () => [] };

  test('fails, and writes no tree, where the committed tree holds the map', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'canonn-out-'));
    const cacheDir = mkdtempSync(join(tmpdir(), 'canonn-cache-'));
    const heldIndex = JSON.stringify([
      {
        id: 'GR',
        label: 'Guardian Ruins',
        group: 'Guardians',
        systemCount: 212,
        files: [],
      },
    ]);
    writeFileSync(join(outDir, 'index.json'), heldIndex);

    // Every address answers 503 on a cold cache, so every map converts to no record. The
    // guard on the committed tree runs before the map is left out, so the build stops
    // rather than replace the tree it holds with a short one.
    await expect(main(readNothing, { cacheDir, outDir })).rejects.toThrow(/GR.*212/s);
    expect(readFileSync(join(outDir, 'index.json'), 'utf8')).toBe(heldIndex);
  });
});

// One reader of the Canonn source tree, over a committed extract of the file it reads.
//
// `listeningPosts` is the reader this file covers, of the twelve the source tree shape
// holds. It is the one whose silent break no other guard sees: it expands one row into
// up to four records and gives each of them **its own** coordinate columns, so a swap of
// the column prefixes draws a system at another system's place while every record count
// stays right. The 10 percent guard on the committed tree reads counts alone.
describe('the listening post reader', () => {
  const entry = sourceOf(
    'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/csvCache/Listening_Posts.csv',
  );
  const records = convertSource(entry, fixture('canonn-listening-posts.csv')).records;

  test('expands each row into the systems that row names', () => {
    // Three rows: one hint with a target, one hint with two links and a target, and one
    // hint with neither. An empty column is no record and not a record with no name.
    expect(records.map((record) => record.name)).toEqual([
      '42 N Persei',
      'HIP 21478',
      '5 Chi Lupi',
      'Ruka',
      'Scorpii Sector IR-W c1-35',
      'HR 5991',
      'Achenar',
    ]);
  });

  test('gives the hint systems and the target system their own keys', () => {
    const keyOf = (name: string): readonly string[] | undefined =>
      records.find((record) => record.name === name)?.keys;
    expect(keyOf('42 N Persei')).toEqual(['Hint']);
    expect(keyOf('Ruka')).toEqual(['Hint']);
    expect(keyOf('Scorpii Sector IR-W c1-35')).toEqual(['Hint']);
    expect(keyOf('HIP 21478')).toEqual(['Discovery']);
    expect(keyOf('HR 5991')).toEqual(['Discovery']);
  });

  test('reads each record from its own coordinate columns', () => {
    // The fault the record count cannot show: a system drawn at another system's place.
    // The four systems of the `5 Chi Lupi` row read `link0`, `link1`, `link2` and
    // `target`, and the four positions differ.
    const coordsOfName = (
      name: string,
    ): { x: number; y: number; z: number } | undefined =>
      records.find((record) => record.name === name)?.coords;
    expect(coordsOfName('5 Chi Lupi')).toEqual({ x: 61.3125, y: 51.40625, z: 178 });
    expect(coordsOfName('Ruka')).toEqual({ x: 30.71875, y: 42.03125, z: 163.375 });
    expect(coordsOfName('Scorpii Sector IR-W c1-35')).toEqual({
      x: 61.15625,
      y: 13.34375,
      z: 155.84375,
    });
    expect(coordsOfName('HR 5991')).toEqual({ x: 56.09375, y: 33.21875, z: 166.375 });
    expect(coordsOfName('42 N Persei')).toEqual({
      x: -83.5625,
      y: -73.40625,
      z: -244.34375,
    });
    expect(coordsOfName('HIP 21478')).toEqual({ x: -35.4375, y: -63.625, z: -280.125 });
  });

  test('gives every system of one row the discovery of that row', () => {
    for (const name of ['5 Chi Lupi', 'Ruka', 'Scorpii Sector IR-W c1-35', 'HR 5991']) {
      expect(
        records.find((record) => record.name === name)?.description,
        `${name} carries another discovery`,
      ).toBe('Research Facility 5592');
    }
    expect(records.find((record) => record.name === 'Achenar')?.description).toBe(
      "Pilots' Memorial: Achenar",
    );
  });
});
