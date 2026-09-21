// The passes of `apps/demo/scripts/build-cycle-sets.mjs`, read over fixtures.
//
// The conversion itself is `convertOverwatch`, which `tests/demo-systems.test.ts` covers.
// What this file reads is what the cycle build adds around it: the archive listing, the
// manifest row, and the two bounds the build fails on.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  ARCHIVE_CONTENTS_URL,
  convertCycle,
  cycleFileName,
  cycleRow,
  MAX_DATASETS,
  MAX_SYSTEMS,
  readArchiveList,
  readCycleList,
  readCycleName,
} from '../apps/demo/scripts/build-cycle-sets.mjs';
import type { ArchiveAnswer } from '../apps/demo/scripts/build-cycle-sets.mjs';
import { MAX_DATASETS as LIBRARY_MAX_DATASETS } from '../packages/galaxy-map/src/app/datasets';
import { MAX_SYSTEMS as LIBRARY_MAX_SYSTEMS } from '../packages/galaxy-map/src/scene-data/real-systems';

/** One record of an archive cycle file, in the shape the archive writes. */
function record(name: string, state: string): unknown {
  return {
    Name: name,
    X: 1,
    Y: 2,
    Z: 3,
    Population: 100,
    States: [{ State: state, Titan: { Name: 'Taranis' } }],
  };
}

/** A contents listing entry, in the shape the GitHub contents API answers. */
function listed(name: string): unknown {
  return { name, download_url: `https://example.test/${name}` };
}

describe('the bounds the build holds', () => {
  // The build reads both numbers out of the library's source rather than write them
  // again. These two cases are what hold the reader to the declarations.
  test('are the bounds the library declares', () => {
    expect(MAX_SYSTEMS).toBe(LIBRARY_MAX_SYSTEMS);
    expect(MAX_DATASETS).toBe(LIBRARY_MAX_DATASETS);
  });
});

describe('the archive listing', () => {
  test('reads the cycle and the week of a file name', () => {
    expect(readCycleName('12 - 2023-02-16.json')).toEqual({
      cycle: 12,
      week: '2023-02-16',
    });
    expect(readCycleName('README.md')).toBeNull();
  });

  test('gives the cycle files in cycle order, and drops the rest', () => {
    const list = readCycleList([
      listed('12 - 2023-02-16.json'),
      listed('README.md'),
      listed('2 - 2022-12-08.json'),
      listed('109 - 2024-12-26.json'),
    ]);
    expect(list.map((entry) => entry.cycle)).toEqual([2, 12, 109]);
    expect(list[0]?.url).toBe('https://example.test/2 - 2022-12-08.json');
  });

  test('fails where the archive holds more cycles than the catalog reads', () => {
    const many = [];
    for (let cycle = 1; cycle <= MAX_DATASETS + 1; cycle += 1) {
      many.push(listed(`${cycle} - 2023-02-16.json`));
    }
    let message = '';
    try {
      readCycleList(many);
    } catch (reason) {
      message = (reason as Error).message;
    }
    expect(message).toContain(`${MAX_DATASETS + 1} cycle files`);
    expect(message).toContain(`${MAX_DATASETS} entries`);
  });
});

describe('one converted cycle', () => {
  test('carries the archive address and the licence line', () => {
    const set = convertCycle({ cycle: 12 }, [record('Sol', 'Alert')]);
    expect(set?.source).toBe('https://github.com/DarkSession/EDOverwatch.Archive');
    expect(set?.licence).toContain('DCoH Overwatch archive');
  });

  test('is null where the cycle gave no record', () => {
    expect(convertCycle({ cycle: 109 }, [])).toBeNull();
    // A file that holds records of a shape the conversion does not read is the same
    // answer. The build prints the raw count beside the name, because that is the signal
    // that the archive's record shape changed.
    expect(convertCycle({ cycle: 109 }, [{ Name: 'Sol' }])).toBeNull();
  });

  test('fails where the cycle holds more records than a set holds', () => {
    const dump = [
      record('Sol', 'Alert'),
      record('Achenar', 'Alert'),
      record('Maia', 'Alert'),
    ];
    let message = '';
    try {
      convertCycle({ cycle: 12 }, dump, 2);
    } catch (reason) {
      message = (reason as Error).message;
    }
    expect(message).toContain('cycle 12 converts to 3 records');
    expect(message).toContain('a set holds 2');
  });
});

describe('one manifest row', () => {
  test('names the cycle, the week, the group and the count', () => {
    const set = convertCycle({ cycle: 12 }, [
      record('Sol', 'Alert'),
      record('Achenar', 'Controlled'),
    ]);
    const row = cycleRow({ cycle: 12, week: '2023-02-16' }, set!);
    expect(row).toEqual({
      cycle: 12,
      week: '2023-02-16',
      label: 'Cycle 12, 2023-02-16',
      group: '2023',
      description:
        'Cycle 12 of the Thargoid war, the week of 2023-02-16. ' +
        'The week holds 1 Alert and 1 Controlled.',
      count: 2,
    });
  });
});

describe('the file name of a cycle', () => {
  test('is zero-padded, so the file order is the cycle order', () => {
    expect(cycleFileName(2)).toBe('002.json');
    expect(cycleFileName(109)).toBe('109.json');
  });
});

describe('the archive reader', () => {
  test('gives back the list the archive answers', async () => {
    const list = [listed('2 - 2022-12-08.json')];
    const read = async (): Promise<ArchiveAnswer> => ({
      ok: true,
      status: 200,
      json: async () => list,
    });
    expect(await readArchiveList(read)).toEqual(list);
  });

  // The build fetches nothing else before this call, so a failure here leaves the
  // committed sets exactly as they were.
  test('fails and names the address when the list cannot be read', async () => {
    const read = async (): Promise<ArchiveAnswer> => ({
      ok: false,
      status: 503,
      json: async () => null,
    });
    await expect(readArchiveList(read)).rejects.toThrow(ARCHIVE_CONTENTS_URL);
    await expect(readArchiveList(read)).rejects.toThrow('503');
    await expect(readArchiveList(read)).rejects.toThrow(
      'The committed sets are left as they were.',
    );
  });

  // A dropped connection gives no status, so the message carries the reason instead.
  test('fails and names the address when the connection drops', async () => {
    const read = async (): Promise<ArchiveAnswer> => {
      throw new Error('socket hang up');
    };
    await expect(readArchiveList(read)).rejects.toThrow(ARCHIVE_CONTENTS_URL);
    await expect(readArchiveList(read)).rejects.toThrow('socket hang up');
    await expect(readArchiveList(read)).rejects.toThrow(
      'The committed sets are left as they were.',
    );
  });
});

describe('the conversion of one cycle', () => {
  // The sets are committed, so a conversion that gave other bytes from the same input
  // would make the tree dirty at every run.
  test('gives the same bytes from the same input', () => {
    const dump = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('./fixtures/overwatch-extract.json', import.meta.url)),
        'utf8',
      ),
    ) as unknown;
    const first = convertCycle({ cycle: 12 }, dump);
    const second = convertCycle({ cycle: 12 }, dump);
    expect(first).not.toBeNull();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(cycleRow({ cycle: 12, week: '2023-02-16' }, second!))).toBe(
      JSON.stringify(cycleRow({ cycle: 12, week: '2023-02-16' }, first!)),
    );
  });
});
