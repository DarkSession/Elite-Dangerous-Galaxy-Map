// Holds the reader of the Spansh factions dump: the line reader that streams it and the
// reducer that turns the factions it finds into records. The tests build their own dump,
// so they reach no network.
import { afterEach, describe, expect, test } from 'vitest';
import {
  fetchMultifactionRecords,
  multifactionRecords,
  readFactionLines,
  MULTIFACTION_CATEGORIES,
  MULTIFACTION_FACTIONS,
} from './multifaction';
import type { DumpFaction } from './multifaction';

/** One system of a faction line, in the shape the dump writes. */
function system(name: string, id: number, controls: boolean): Record<string, unknown> {
  return {
    systemName: name,
    systemId64: id,
    ...(controls ? { isControllingFaction: true } : {}),
    coords: { x: id, y: 0, z: -id },
  };
}

/** One faction line of the dump, with its leading tab and its trailing comma. */
function factionLine(
  name: string,
  systems: readonly Record<string, unknown>[],
): string {
  return `\t${JSON.stringify({ name, allegiance: 'Independent', systems })},`;
}

/**
 * A dump of six factions, in the shape of the file: one line for the opening bracket, one
 * line per faction and one line for the closing bracket. The two the reader wants are the
 * second and the third faction.
 */
const SIX_FACTIONS = [
  '[',
  factionLine('First Faction', [system('Alpha', 1, true)]),
  factionLine('Canonn', [system('Beta', 2, true), system('Beta', 2, false)]),
  factionLine('Canonn Deep Space Research', [system('Beta', 2, false)]),
  factionLine('Fourth Faction', [system('Delta', 4, true)]),
  factionLine('Fifth Faction', [system('Epsilon', 5, true)]),
  factionLine('Sixth Faction', [system('Zeta', 6, true)]),
  ']',
].join('\n');

/** A dump of three factions, none of which the entry names. */
const THREE_OTHERS = [
  '[',
  factionLine('First Faction', [system('Alpha', 1, true)]),
  factionLine('Second Faction', [system('Beta', 2, true)]),
  factionLine('Third Faction', [system('Gamma', 3, true)]),
  ']',
].join('\n');

/** A stream of the text, in chunks of `size` bytes, that reports its own cancel. */
function streamOf(
  text: string,
  size = Number.MAX_SAFE_INTEGER,
): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(at + size, bytes.length);
      controller.enqueue(bytes.slice(at, end));
      at = end;
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
}

/** The text as gzip, which is how the dump comes over the network. */
async function gzipOf(text: string): Promise<Uint8Array> {
  // The DOM types read the writable side of a `CompressionStream` as a `BufferSource`
  // sink, which does not match the `Uint8Array` stream above, so the test names the pair.
  const gzip = new CompressionStream('gzip') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  const stream = streamOf(text).stream.pipeThrough(gzip);
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    if (step.value !== undefined) parts.push(step.value);
  }
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('the line reader of the factions dump', () => {
  test('stops at the last faction it wants and cancels the stream', async () => {
    const source = streamOf(SIX_FACTIONS);
    const read = await readFactionLines(source.stream, MULTIFACTION_FACTIONS);

    expect(read.factions.map((faction) => faction.name)).toEqual([
      'Canonn',
      'Canonn Deep Space Research',
    ]);
    // The opening bracket is no faction line, so the reader read the first three faction
    // lines and stopped. The three lines after them never reached it.
    expect(read.lines).toBe(3);
    expect(source.cancelled()).toBe(true);
  });

  test('reads a line that crosses two chunks', async () => {
    const source = streamOf(SIX_FACTIONS, 7);
    const read = await readFactionLines(source.stream, MULTIFACTION_FACTIONS);

    expect(read.factions.map((faction) => faction.name)).toEqual([
      'Canonn',
      'Canonn Deep Space Research',
    ]);
    expect(read.lines).toBe(3);
    // The records are the same as the ones the whole-file read gives.
    const whole = await readFactionLines(
      streamOf(SIX_FACTIONS).stream,
      MULTIFACTION_FACTIONS,
    );
    expect(read.factions).toEqual(whole.factions);
  });

  /**
   * Counts the tasks the event loop runs until the caller stops it. A reader that holds
   * the main thread for the whole file leaves the count at zero.
   */
  const countTasks = (): { stop: () => number } => {
    let count = 0;
    let running = true;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      count += 1;
      if (running) channel.port2.postMessage(0);
      else channel.port1.close();
    };
    channel.port2.postMessage(0);
    return {
      stop: () => {
        running = false;
        return count;
      },
    };
  };

  // Every chunk of the stream is ready before the read starts, so each read answers from
  // a queue, and a queued answer is a microtask. A reader that only awaits its chunks
  // therefore reads the whole file in one task. The slice here is 0, which asks for a
  // turn after every chunk; the frame budget test of `e2e/frame-budget.spec.ts` measures
  // the default slice over a 62 MB dump.
  test('gives the event loop a turn while it reads', async () => {
    const tasks = countTasks();
    const read = await readFactionLines(
      streamOf(SIX_FACTIONS, 7).stream,
      MULTIFACTION_FACTIONS,
      0,
    );
    const turns = tasks.stop();

    expect(read.factions).toHaveLength(2);
    expect(turns).toBeGreaterThan(0);
  });

  // The reader decodes only the head of a line to read its name, so a name that is longer
  // than that window reads as a name it does not want. The window covers every wanted
  // name, so no wanted faction is lost this way.
  test('reads past a faction whose name is longer than the head window', async () => {
    const text = [
      '[',
      factionLine('A'.repeat(4000), [system('Far', 9, true)]),
      factionLine('Canonn', [system('Alpha', 1, true)]),
      factionLine('Canonn Deep Space Research', [system('Beta', 2, true)]),
      ']',
    ].join('\n');
    const read = await readFactionLines(
      streamOf(text, 7).stream,
      MULTIFACTION_FACTIONS,
    );
    expect(read.factions.map((faction) => faction.name)).toEqual([
      ...MULTIFACTION_FACTIONS,
    ]);
  });

  // The reader cuts lines on the byte of the line break, which no other byte of UTF-8
  // carries, and the head window counts bytes and not characters.
  test('reads a faction whose name carries a multi-byte character', async () => {
    const text = [
      '[',
      factionLine('Ca\u00f1\u00f3n \u03a9', [system('Alpha', 1, true)]),
      ']',
    ].join('\n');
    const read = await readFactionLines(streamOf(text, 7).stream, [
      'Ca\u00f1\u00f3n \u03a9',
    ]);
    expect(read.factions.map((faction) => faction.name)).toEqual([
      'Ca\u00f1\u00f3n \u03a9',
    ]);
    expect(read.factions[0]?.systems).toHaveLength(1);
  });

  test('gives the factions in the order it was asked for them', async () => {
    const reversed = [...MULTIFACTION_FACTIONS].reverse();
    const read = await readFactionLines(streamOf(SIX_FACTIONS).stream, reversed);
    expect(read.factions.map((faction) => faction.name)).toEqual(reversed);
  });

  test('reads no faction from a dump that names none it wants', async () => {
    const read = await readFactionLines(
      streamOf(THREE_OTHERS).stream,
      MULTIFACTION_FACTIONS,
    );
    expect(read.factions).toEqual([]);
    // It read every faction line of the file, because it never found the two it wanted.
    expect(read.lines).toBe(3);
  });

  // The dump writes one faction per line, which is a property of the file and not of
  // JSON. A file that writes the whole array on one line therefore reads as no faction.
  test('reads no faction from a dump that writes one line', async () => {
    const one = `[${factionLine('Canonn', [system('Beta', 2, true)])}]`;
    const read = await readFactionLines(streamOf(one).stream, MULTIFACTION_FACTIONS);
    expect(read.factions).toEqual([]);
  });
});

describe('the record reducer', () => {
  // Three factions name one system between them, and the first of the order that names it
  // gives the record its primary category.
  const SHARED: readonly DumpFaction[] = [
    {
      name: 'Canonn',
      systems: [
        system('Shared', 10, false),
        system('Shared', 10, true),
        system('Canonn Only', 11, false),
      ] as never,
    },
    { name: 'Second Faction', systems: [system('Shared', 10, false)] as never },
    { name: 'Third Faction', systems: [system('Shared', 10, true)] as never },
  ];

  test('holds one record per system and gives it every category it earns', () => {
    const records = multifactionRecords(SHARED, [
      'Canonn',
      'Second Faction',
      'Third Faction',
    ]);

    expect(records.map((record) => record.name)).toEqual(['Shared', 'Canonn Only']);
    const shared = records[0];
    // A row that controls wins over a row that does not, inside one faction.
    expect(shared?.primaryCategory).toBe('Canonn Controlled');
    expect(shared?.secondaryCategories).toEqual([
      'Second Faction Present',
      'Third Faction Controlled',
    ]);
    expect(records[1]?.primaryCategory).toBe('Canonn Present');
    expect(records[1]?.secondaryCategories).toEqual([]);
  });

  test('takes the primary category from the first faction of the order', () => {
    const records = multifactionRecords(SHARED, [
      'Third Faction',
      'Second Faction',
      'Canonn',
    ]);
    expect(records[0]?.primaryCategory).toBe('Third Faction Controlled');
    expect(records[0]?.secondaryCategories).toEqual([
      'Second Faction Present',
      'Canonn Controlled',
    ]);
  });

  test('carries the name, the position and the id of a system', () => {
    const records = multifactionRecords(SHARED, ['Canonn']);
    expect(records[0]).toEqual({
      name: 'Shared',
      coords: { x: 10, y: 0, z: -10 },
      id64: 10,
      primaryCategory: 'Canonn Controlled',
      secondaryCategories: [],
    });
  });

  test('drops a system that carries no position', () => {
    const records = multifactionRecords(
      [
        {
          name: 'Canonn',
          systems: [
            { systemName: 'No Position', systemId64: 7 },
            system('With Position', 8, false),
          ] as never,
        },
      ],
      ['Canonn'],
    );
    expect(records.map((record) => record.name)).toEqual(['With Position']);
  });
});

describe('the four record categories', () => {
  test('name the two factions and carry the colours of the source', () => {
    expect(MULTIFACTION_CATEGORIES.map((category) => category.name)).toEqual([
      'Canonn Controlled',
      'Canonn Present',
      'Canonn Deep Space Research Controlled',
      'Canonn Deep Space Research Present',
    ]);
    expect(MULTIFACTION_CATEGORIES.map((category) => category.color)).toEqual([
      [255, 36, 0],
      [255, 157, 128],
      [21, 105, 199],
      [126, 200, 227],
    ]);
  });
});

describe('the fetch of the dump', () => {
  test('reads the records of the two factions', async () => {
    const body = await gzipOf(SIX_FACTIONS);
    globalThis.fetch = (async () =>
      new Response(body.buffer as ArrayBuffer)) as typeof fetch;

    const records = await fetchMultifactionRecords('https://example.invalid/dump.gz');
    expect(records).toHaveLength(1);
    expect(records[0]?.name).toBe('Beta');
    expect(records[0]?.primaryCategory).toBe('Canonn Controlled');
    expect(records[0]?.secondaryCategories).toEqual([
      'Canonn Deep Space Research Present',
    ]);
  });

  test('rejects a dump that names neither faction', async () => {
    const body = await gzipOf(THREE_OTHERS);
    globalThis.fetch = (async () =>
      new Response(body.buffer as ArrayBuffer)) as typeof fetch;

    await expect(
      fetchMultifactionRecords('https://example.invalid/dump.gz'),
    ).rejects.toThrow('names none of');
  });

  test('rejects a fetch that fails', async () => {
    globalThis.fetch = (async () =>
      new Response('no', { status: 500 })) as typeof fetch;

    await expect(
      fetchMultifactionRecords('https://example.invalid/dump.gz'),
    ).rejects.toThrow('500');
  });
});
