// The Canonn page: every map of the Canonn ED3D map project as one dataset entry each.
// The page is a host application, so it gives the map a catalog the way any other host
// does. The library bundles no data and fetches none.
//
// `apps/demo/scripts/build-canonn-sets.mjs` writes the manifest and the set files beside
// it. A set file carries keys and no names, because one file serves every map that reads
// the source. The manifest row of an entry names each key and gives it a colour, so two
// entries that read one file show their own map's names and colours.
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';
import type {
  CategoryInput,
  DatasetContent,
  DatasetEntry,
  GalaxyMap,
  SystemRecordInput,
} from '@elite-dangerous-almanac/galaxy-map';
import { filesOfRow } from './canonn-message';
import type {
  CanonnAnswer,
  CanonnFile,
  CanonnPacked,
  CanonnRequest,
} from './canonn-message';

/** One file of one manifest row: the set it reads, and what the map calls each key. */
interface ManifestFile {
  readonly path: string;
  readonly categories: Readonly<
    Record<string, { readonly name: string; readonly color: readonly number[] }>
  >;
}

/** One row of the manifest, which is one entry of the catalog. */
interface ManifestRow {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  /** What the map records, and where the records come from. */
  readonly description: string;
  readonly systemCount: number;
  readonly files: readonly ManifestFile[];
}

/**
 * The manifest the Canonn build writes: one row per entry, in map order. The page reads
 * it with a dynamic import, as the cycles page does, because a static reach out of the
 * page directory resolves only on the dev server.
 */
const manifest = (await import('../demo-data/canonn/index.json'))
  .default as unknown as readonly ManifestRow[];

// A page with no entry has no catalog and no start entry, so it says what is missing
// rather than build a map of nothing.
if (manifest.length === 0) {
  throw new Error('The Canonn page found no set in apps/demo/demo-data/canonn/.');
}

/**
 * The served address of every set file, by the path the manifest names.
 *
 * The page fetches a file and does not import it, so the records stay out of every
 * chunk and the browser downloads one entry at a time. `?url` gives the address Vite
 * publishes the file at, and `build.assetsInlineLimit` is 0 so that a small set stays a
 * file rather than become a data URL inside the chunk.
 */
const ADDRESSES = import.meta.glob('../demo-data/canonn/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>;

/** The address of one set file, or the failure that names the file. */
function addressOf(path: string): string {
  const url = ADDRESSES[`../demo-data/canonn/${path}`];
  if (url === undefined) {
    throw new Error(`The Canonn page found no file ${path} of its manifest.`);
  }
  return url;
}

/** What the last load cost, which the browser suite reads. */
export interface CanonnTiming {
  readonly id: string;
  /** The bytes of the files of the entry. */
  readonly bytes: number;
  /** How long the fetch of every file took, in milliseconds. */
  readonly fetchMs: number;
  /** How long the worker's parse took, in milliseconds. */
  readonly parseMs: number;
  /** How long the hand-back of the packed records to the page took, in milliseconds. */
  readonly handBackMs: number;
  /** How long the page took to build the record objects, in milliseconds. */
  readonly buildMs: number;
  /** How many records the worker gave back. */
  readonly records: number;
}

/** The window members the browser suite reads. The page that writes them types them. */
type CanonnWindow = Window & {
  galaxyMap?: GalaxyMap;
  canonnTiming?: CanonnTiming;
};

/**
 * The categories of one entry: the name and the colour the row gives each key of each of
 * its files. Two files of one entry may name one category, so the first one wins.
 *
 * JSON holds no tuple, so the row types a colour as `number[]` while `CategoryInput`
 * states three numbers. The reader casts the array through `unknown`, as the cycles page
 * does, and the library still checks every field.
 */
function categoriesOf(row: ManifestRow): readonly CategoryInput[] {
  const categories = new Map<string, CategoryInput>();
  for (const file of row.files) {
    for (const named of Object.values(file.categories)) {
      if (categories.has(named.name)) continue;
      categories.set(named.name, {
        name: named.name,
        color: named.color as unknown as readonly [number, number, number],
      });
    }
  }
  return [...categories.values()];
}

/**
 * Waits for the next task, so the browser draws a frame.
 *
 * It posts on a `MessageChannel` and not on a timer: a timer that a timer callback
 * starts is nested, and the browser holds a nested timer for 4 milliseconds.
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

/** How long the record build holds the thread before it gives the browser a turn. */
const BUILD_SLICE_MS = 8;

/**
 * Builds the record objects out of the buffers the worker packed.
 *
 * `addSystems` takes objects, so the page pays for them wherever they are built. It
 * builds them here, in slices it gives the browser a turn between, rather than take
 * them as a structured clone the browser deserialises in one burst.
 */
async function recordsOf(packed: CanonnPacked): Promise<readonly SystemRecordInput[]> {
  const decoder = new TextDecoder();
  const names = packed.count === 0 ? [] : decoder.decode(packed.names).split('\n');
  const descriptions =
    packed.descriptions.byteLength === 0
      ? null
      : decoder.decode(packed.descriptions).split('\u0000');
  const coords = new Float64Array(packed.coords);
  const categories = new Uint16Array(packed.categories);
  const starts = new Uint32Array(packed.categoryStarts);
  const records: SystemRecordInput[] = [];
  let sliceStart = performance.now();
  for (let at = 0; at < packed.count; at += 1) {
    const named: string[] = [];
    for (let index = starts[at]; index < starts[at + 1]; index += 1) {
      named.push(packed.categoryNames[categories[index]] as string);
    }
    const record = {
      name: names[at] as string,
      coords: {
        x: coords[at * 3] as number,
        y: coords[at * 3 + 1] as number,
        z: coords[at * 3 + 2] as number,
      },
      categories: named,
    };
    const description = descriptions === null ? '' : (descriptions[at] as string);
    records.push(description === '' ? record : { ...record, description });
    if ((at & 1023) === 1023 && performance.now() - sliceStart >= BUILD_SLICE_MS) {
      await nextTask();
      sliceStart = performance.now();
    }
  }
  return records;
}

/**
 * Fetches every file of one row and gives the bytes to a worker, which parses them.
 *
 * The fetch stays here, so the request comes from the page and a browser test intercepts
 * it as it intercepts every other request. The bytes then move to the worker, which
 * costs no copy, and the worker moves the packed records back.
 */
async function loadRow(row: ManifestRow): Promise<readonly SystemRecordInput[]> {
  const fetchStart = performance.now();
  // One request per distinct path, so a row that named one path twice is one fetch.
  const files: CanonnFile[] = await Promise.all(
    filesOfRow(row.files).map(async (file): Promise<CanonnFile> => {
      const answer = await fetch(addressOf(file.path));
      if (!answer.ok) {
        throw new Error(`The set ${file.path} did not download: ${answer.status}.`);
      }
      return { bytes: await answer.arrayBuffer(), names: file.names };
    }),
  );
  const fetchMs = performance.now() - fetchStart;
  const bytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);

  // The `new Worker(new URL(...))` stays written out, because the bundler reads the
  // literal to find the worker file.
  const worker = new Worker(new URL('./canonn.worker.ts', import.meta.url), {
    type: 'module',
  });
  const answer = await new Promise<CanonnAnswer>((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<CanonnAnswer>) => {
      worker.terminate();
      resolve(event.data);
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(`The set reader stopped: ${event.message}`));
    });
    const request: CanonnRequest = { files };
    worker.postMessage(
      request,
      files.map((file) => file.bytes),
    );
  });
  // The worker and the page keep their own `performance.now()` origins, so the hand-back
  // is read on the wall clock, which both threads share.
  const handBackMs = Math.max(0, Date.now() - (answer.sentAt ?? Date.now()));
  if (answer.packed === undefined) {
    throw new Error(answer.error ?? 'The set reader gave no answer.');
  }
  const buildStart = performance.now();
  const records = await recordsOf(answer.packed);
  (window as CanonnWindow).canonnTiming = {
    id: row.id,
    bytes,
    fetchMs,
    parseMs: answer.parseMs ?? 0,
    handBackMs,
    buildMs: performance.now() - buildStart,
    records: records.length,
  };
  return records;
}

/**
 * The catalog: one entry per manifest row, in the order the build wrote them, which
 * groups the entries by the part of the project each map belongs to.
 *
 * Each entry names the box of its own records, because one map holds one part of the
 * galaxy. `load()` fetches the files of that entry alone, so the browser downloads one
 * map at a time and not the 38.9 MB of the tree.
 */
const CANONN: readonly DatasetEntry[] = manifest.map((row): DatasetEntry => ({
  id: row.id,
  label: row.label,
  collection: row.group,
  description: row.description,
  systemCount: row.systemCount,
  bounds: { mode: 'auto' },
  view: { fit: 'systems' },
  load: async (): Promise<DatasetContent> => ({
    categories: categoriesOf(row),
    systems: await loadRow(row),
  }),
}));

/**
 * The entry the page opens on. Guardian Ruins holds 212 systems in one 55 KB file, so
 * the page draws its first frame without the download of a large set.
 */
const OPENING = 'GR';

const opening = CANONN.find((entry) => entry.id === OPENING) ?? CANONN[0];

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas, {
  // The HUD holds the dataset library dialog, which is how the user steps from one map
  // to the next.
  hud: true,
  datasets: CANONN,
  dataset: opening.id,
});

// The handle, so the browser suite can read the records and the view of the page. The
// member is typed here, in the page that writes it, and not in the suite that reads it.
(window as CanonnWindow).galaxyMap = map;

await map.ready;
