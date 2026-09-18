// The records of the sixth demo data set, which the page fetches when the user loads the
// entry. The library fetches nothing: this module belongs to the demo host, as the five
// committed files do, and `src/index.ts` does not import it.
//
// The source is the Spansh factions dump, which the Canonn `MapData-multifaction.js` map
// reads. The file is 16.9 MB of gzip and 101 MB of JSON, in one line for the opening
// bracket, one line per faction and one line for the closing bracket. The reader below
// therefore reads the bytes as a stream, holds one line at a time, reads the faction name
// from the head of each line, and parses the whole line only where the name is one it
// wants. It cancels the stream once it has every faction it wants.
//
// The page keeps the fetch and moves the body to `multifaction.worker.ts`, which inflates
// it and runs the reader. Chromium inflates a body the browser already holds in one
// burst, which costs the map about 70 milliseconds of frames on a 62 MB dump.
import type { CategoryInput, SystemRecordInput } from '../scene-data/real-systems';
import type { MultifactionAnswer, MultifactionRequest } from './multifaction-message';

/** Where the records come from. The map of the Canonn Research Group reads the same file. */
export const MULTIFACTION_DUMP_URL = 'https://downloads.spansh.co.uk/factions.json.gz';

/**
 * The factions the entry names, in the order it names them. There is no faction picker:
 * the entry is a demonstration of a host that fetches its own records.
 */
export const MULTIFACTION_FACTIONS: readonly string[] = [
  'Canonn',
  'Canonn Deep Space Research',
];

/**
 * The colour of each faction, as the pair the source's own `factionColorPairs` gives it:
 * the first colour for a system the faction controls and the second for one it is present
 * in. These are the first two pairs of that list.
 */
const FACTION_COLOURS: readonly (readonly [
  readonly [number, number, number],
  readonly [number, number, number],
])[] = [
  [
    [255, 36, 0],
    [255, 157, 128],
  ],
  [
    [21, 105, 199],
    [126, 200, 227],
  ],
];

/** The name of the category a faction gives a system it controls. */
export function controlledCategory(faction: string): string {
  return `${faction} Controlled`;
}

/** The name of the category a faction gives a system it is present in. */
export function presentCategory(faction: string): string {
  return `${faction} Present`;
}

/**
 * The four record categories of the set. The two sphere categories come from the
 * committed sphere file, which the build script writes.
 */
export const MULTIFACTION_CATEGORIES: readonly CategoryInput[] =
  MULTIFACTION_FACTIONS.flatMap((faction, index) => {
    const pair = FACTION_COLOURS[index] ?? FACTION_COLOURS[0];
    return [
      {
        name: controlledCategory(faction),
        color: pair[0],
        description: `A system ${faction} controls.`,
      },
      {
        name: presentCategory(faction),
        color: pair[1],
        description: `A system ${faction} is present in, and does not control.`,
      },
    ];
  });

/** One system of one faction, as the dump writes it. */
export interface DumpSystem {
  readonly systemName?: unknown;
  readonly systemId64?: unknown;
  readonly isControllingFaction?: unknown;
  readonly coords?: {
    readonly x?: unknown;
    readonly y?: unknown;
    readonly z?: unknown;
  };
}

/** One faction of the dump, with the systems it names. */
export interface DumpFaction {
  readonly name: string;
  readonly systems: readonly DumpSystem[];
}

/** What the line reader gives back. */
export interface FactionRead {
  /** The factions it found, in the order it was asked for them. */
  readonly factions: readonly DumpFaction[];
  /** How many faction lines it read before it stopped. */
  readonly lines: number;
}

/**
 * The name at the head of a faction line, with its quotes. The dump writes the name first
 * in every faction object, so the reader reads it without parsing the rest of the line.
 */
const NAME_AT_HEAD = /^\s*\{"name":("(?:[^"\\]|\\.)*")/;

/**
 * How long the reader holds its thread before it gives the event loop a turn, in
 * milliseconds.
 *
 * A fetch whose bytes are already in the browser answers each `read()` from a queue, and
 * a queued answer is a microtask. The loop below would then read the whole file in one
 * task. The reader therefore counts its own time and waits for the next task when the
 * count passes this number.
 *
 * The worker holds the read, so this guards the other path: a browser that does not move
 * a stream to a worker reads the dump on the thread that draws the map.
 */
const READ_SLICE_MS = 8;

/**
 * Waits for the next task, so the browser can draw a frame.
 *
 * It posts on a `MessageChannel` and not on a timer: a timer that a timer callback starts
 * is nested, and the browser holds a nested timer for 4 milliseconds. That wait would add
 * itself to every turn of the read.
 */
function nextTask(): Promise<void> {
  return new Promise((done) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      done();
    };
    channel.port2.postMessage(0);
  });
}

/** Reads one faction line. A line that does not parse is a line the reader does not want. */
function parseFaction(line: string): DumpFaction | null {
  const text = line.trim().replace(/,$/, '');
  let held: unknown;
  try {
    held = JSON.parse(text);
  } catch {
    return null;
  }
  if (held === null || typeof held !== 'object') return null;
  const name = (held as { name?: unknown }).name;
  const systems = (held as { systems?: unknown }).systems;
  if (typeof name !== 'string' || !Array.isArray(systems)) return null;
  return { name, systems: systems as readonly DumpSystem[] };
}

/** The byte of a line break, which is the byte the reader cuts lines on. */
const LINE_BREAK = 10;

/** No bytes, which is what a read gives when it is done. */
const NO_BYTES = new Uint8Array(0);

/**
 * How many bytes of a line the reader decodes to read the name at its head.
 *
 * The reader decodes the head of every line and the whole of a line it wants. A window
 * that is shorter than a wanted name would read that faction as one it does not want, so
 * the window covers the longest wanted name, its quotes and the `{"name":` before it.
 */
function headWindow(wanted: readonly string[]): number {
  const encoder = new TextEncoder();
  const longest = wanted.reduce(
    (most, name) => Math.max(most, encoder.encode(JSON.stringify(name)).length),
    0,
  );
  return longest + 32;
}

/**
 * Reads the wanted factions out of a stream of the dump's text bytes.
 *
 * The reader holds one line at a time. The longest line of the dump read on 2026-09-17 is
 * 2.33 MB, and a reader that parsed the whole array would hold 101 MB of text and several
 * hundred megabytes of objects for two factions of 77,675. A chunk may end inside a line,
 * so the reader keeps the rest of the chunk and reads it with the next one.
 *
 * **The reader works on the bytes and not on text.** It finds the line break by its byte,
 * which no other byte of UTF-8 carries, and it decodes only the head of each line and the
 * whole of a line it wants. A reader that decoded the file and cut the text cost 884
 * milliseconds of main thread time over a 62 MB dump, because it held a growing string
 * and searched it again for every chunk. This one costs 13.
 *
 * The reader stops at the last faction it wants and cancels the stream, which stops the
 * download. The order of the dump is not stated anywhere, so a run that finds the two at
 * the end reads the whole file and still works.
 *
 * The reader gives the event loop a turn every `sliceMs`, so the map keeps drawing while
 * it works. A slice of 0 gives the loop a turn after every chunk.
 */
export async function readFactionLines(
  stream: ReadableStream<Uint8Array>,
  wanted: readonly string[],
  sliceMs: number = READ_SLICE_MS,
): Promise<FactionRead> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const left = new Set(wanted);
  const held = new Map<string, DumpFaction>();
  /** The first bytes of the line the reader is inside, which carry its name. */
  const head = new Uint8Array(headWindow(wanted));
  /** How many bytes of the head the reader has. */
  let headBytes = 0;
  /** True once the reader has read the name of the line it is inside. */
  let read = false;
  /** The name of the line the reader is inside, where it is a name the reader wants. */
  let want: string | null = null;
  /** The bytes of a line the reader wants. A line it does not want keeps no bytes. */
  let parts: Uint8Array[] = [];
  /** How many bytes those parts hold. */
  let bytes = 0;
  let lines = 0;

  /**
   * Reads the name at the head of the line and answers whether the reader wants the line.
   *
   * The reader calls this as soon as it has the head, and it keeps the bytes of the line
   * only from here on. A line it does not want therefore holds 58 bytes and not its
   * 2.33 MB, which keeps the chunks of the stream collectable.
   */
  const readName = (): void => {
    read = true;
    // A cut multi-byte character decodes as a replacement character, which sits after the
    // name and does not change the match.
    const match = NAME_AT_HEAD.exec(decoder.decode(head.subarray(0, headBytes)));
    if (match === null || match[1] === undefined) return;
    lines += 1;
    let name: unknown;
    try {
      name = JSON.parse(match[1]);
    } catch {
      return;
    }
    if (typeof name !== 'string' || !left.has(name)) return;
    want = name;
    parts = [head.slice(0, headBytes)];
    bytes = headBytes;
  };

  /** Takes the bytes of one part of the line the reader is inside. */
  const add = (piece: Uint8Array): void => {
    let rest = piece;
    if (!read) {
      const room = Math.min(head.length - headBytes, rest.length);
      head.set(rest.subarray(0, room), headBytes);
      headBytes += room;
      rest = rest.subarray(room);
      if (headBytes === head.length) readName();
    }
    if (want !== null && rest.length > 0) {
      parts.push(rest);
      bytes += rest.length;
    }
  };

  /** Ends the line. Answers true where it held the last faction the reader wants. */
  const end = (): boolean => {
    if (!read) readName();
    let last = false;
    if (want !== null) {
      const whole = new Uint8Array(bytes);
      let at = 0;
      for (const part of parts) {
        whole.set(part, at);
        at += part.length;
      }
      const faction = parseFaction(decoder.decode(whole));
      if (faction !== null) {
        held.set(want, faction);
        left.delete(want);
        last = left.size === 0;
      }
    }
    read = false;
    want = null;
    parts = [];
    bytes = 0;
    headBytes = 0;
    return last;
  };

  /** The factions the reader found, in the order it was asked for them. */
  const answer = (): FactionRead => ({
    factions: wanted
      .map((name) => held.get(name))
      .filter((faction): faction is DumpFaction => faction !== undefined),
    lines,
  });

  try {
    let sliceStart = performance.now();
    for (;;) {
      const step = await reader.read();
      let piece = step.value ?? NO_BYTES;
      for (;;) {
        const cut = piece.indexOf(LINE_BREAK);
        if (cut < 0) break;
        add(piece.subarray(0, cut));
        const last = end();
        piece = piece.subarray(cut + 1);
        if (last) return answer();
      }
      add(piece);
      if (step.done) {
        // The last line of a file may carry no line break of its own.
        if (headBytes > 0) end();
        return answer();
      }
      if (performance.now() - sliceStart >= sliceMs) {
        await nextTask();
        sliceStart = performance.now();
      }
    }
  } finally {
    // A cancel stops the download. A stream that is already read to its end takes the
    // call and does nothing.
    try {
      await reader.cancel();
    } catch {
      // The stream is already gone, which is the state the cancel asks for.
    }
  }
}

/** One record while the reducer builds it. */
interface Building {
  readonly record: {
    name: string;
    coords: { x: number; y: number; z: number };
    id64: number;
    primaryCategory: string;
    secondaryCategories: string[];
  };
}

/** The number a field holds, or null where the field is not a finite number. */
function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Turns the factions the reader found into the records the map takes.
 *
 * A faction lists a system once for each of its states, and two factions may name one
 * system, so the reducer holds one record per `systemId64`. Within one faction a row that
 * controls wins over a row that does not, so one faction gives one system one category.
 * The first faction of the entry's order that names a system gives the record its primary
 * category and every other category it earns is a secondary one.
 *
 * `JSON.parse` reads `systemId64` as a number, which loses the digits above 2^53. Two
 * systems whose ids differ above that limit would read as one record.
 */
export function multifactionRecords(
  factions: readonly DumpFaction[],
  order: readonly string[],
): readonly SystemRecordInput[] {
  const held = new Map<string, Building>();
  const records: Building[] = [];
  const byName = new Map<string, DumpFaction>();
  for (const faction of factions) byName.set(faction.name, faction);

  for (const name of order) {
    const faction = byName.get(name);
    if (faction === undefined) continue;
    // One entry per system of this faction, which holds the strongest state the faction
    // has in it.
    const state = new Map<string, { system: DumpSystem; controls: boolean }>();
    for (const system of faction.systems) {
      const id = system?.systemId64;
      if (typeof id !== 'number' || !Number.isFinite(id)) continue;
      const key = String(id);
      const controls = system.isControllingFaction === true;
      const first = state.get(key);
      if (first === undefined) {
        state.set(key, { system, controls });
        continue;
      }
      if (controls) state.set(key, { system, controls });
    }

    for (const [key, entry] of state) {
      const category = entry.controls
        ? controlledCategory(name)
        : presentCategory(name);
      const first = held.get(key);
      if (first !== undefined) {
        if (
          first.record.primaryCategory !== category &&
          !first.record.secondaryCategories.includes(category)
        ) {
          first.record.secondaryCategories.push(category);
        }
        continue;
      }
      const systemName = entry.system.systemName;
      const coords = entry.system.coords;
      const x = numberOf(coords?.x);
      const y = numberOf(coords?.y);
      const z = numberOf(coords?.z);
      if (typeof systemName !== 'string' || x === null || y === null || z === null) {
        continue;
      }
      const building: Building = {
        record: {
          name: systemName,
          coords: { x, y, z },
          id64: Number(key),
          primaryCategory: category,
          secondaryCategories: [],
        },
      };
      held.set(key, building);
      records.push(building);
    }
  }

  return records.map((building) => building.record);
}

/**
 * Puts the gzip body of the dump through the browser's inflater.
 *
 * The DOM types read the writable side of a `DecompressionStream` as a `BufferSource`
 * sink, which does not match a `Uint8Array` stream, so the call names the pair.
 */
export function inflateDump(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const gzip = new DecompressionStream('gzip') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  return body.pipeThrough(gzip);
}

/**
 * Reads the wanted factions out of the inflated text and reduces them to records.
 *
 * The worker and the main thread both call it, so the two paths reject with the same
 * message and build the same records.
 */
export async function readDumpRecords(
  stream: ReadableStream<Uint8Array>,
  wanted: readonly string[],
): Promise<readonly SystemRecordInput[]> {
  const read = await readFactionLines(stream, wanted);
  if (read.factions.length === 0) {
    throw new Error(
      `The factions dump names none of ${wanted.join(', ')}. ` +
        'The reader reads one faction per line, so a dump that writes every faction ' +
        'on one line reads as none.',
    );
  }
  return multifactionRecords(read.factions, wanted);
}

/**
 * Answers whether the browser moves a stream to a worker.
 *
 * The probe moves a stream to a `MessagePort` and not to a worker, because a port and a
 * worker take the same transfer list and a port costs no worker start. A browser that
 * moves no stream gives a `DataCloneError`, which the probe catches. Node gives no
 * `Worker` at all, so a unit test reads the dump on the thread it runs on.
 */
function movesStreams(): boolean {
  if (typeof Worker === 'undefined' || typeof MessageChannel === 'undefined')
    return false;
  const channel = new MessageChannel();
  try {
    const probe = new ReadableStream();
    channel.port1.postMessage(probe, [probe as unknown as Transferable]);
    return true;
  } catch {
    return false;
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}

/** Reads the body in a worker, which keeps the inflate off the main thread. */
function readInWorker(
  body: ReadableStream<Uint8Array>,
): Promise<readonly SystemRecordInput[]> {
  // The `new Worker(new URL(...))` stays written out, because the bundler reads the
  // literal to find the worker file.
  const worker = new Worker(new URL('./multifaction.worker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise<readonly SystemRecordInput[]>((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<MultifactionAnswer>) => {
      worker.terminate();
      const answer = event.data;
      if (answer.records === undefined) {
        reject(new Error(answer.error ?? 'The dump reader gave no answer.'));
        return;
      }
      resolve(answer.records);
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(`The dump reader stopped: ${event.message}`));
    });
    const request: MultifactionRequest = { body, wanted: MULTIFACTION_FACTIONS };
    worker.postMessage(request, [body as unknown as Transferable]);
  });
}

/** Reads the body on the thread that asked for it, where no worker takes the stream. */
function readHere(
  body: ReadableStream<Uint8Array>,
): Promise<readonly SystemRecordInput[]> {
  return readDumpRecords(inflateDump(body), MULTIFACTION_FACTIONS);
}

/**
 * Fetches the dump and reads the records of the two factions the entry names.
 *
 * The fetch stays on the thread that calls this, so the request comes from the page and a
 * browser test intercepts it as it intercepts every other request. The body then moves to
 * a worker, which inflates it and reads it: Chromium inflates a body it already holds in
 * one burst, and that burst costs the map about 70 milliseconds of frames.
 *
 * It rejects where the browser gives no `DecompressionStream`, where the fetch fails, and
 * where the dump names neither faction. `loadDataset` then rejects, and the map keeps the
 * set it had.
 */
export async function fetchMultifactionRecords(
  url: string = MULTIFACTION_DUMP_URL,
): Promise<readonly SystemRecordInput[]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser gives no DecompressionStream, so the dump cannot open.',
    );
  }
  const answer = await fetch(url);
  if (!answer.ok) {
    // Nothing reads the body of a failed answer, so cancel it and let the socket close.
    await answer.body?.cancel();
    throw new Error(`The factions dump did not download: ${answer.status}.`);
  }
  if (answer.body === null) {
    throw new Error('The factions dump carries no body.');
  }
  return movesStreams() ? readInWorker(answer.body) : readHere(answer.body);
}
