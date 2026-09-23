// The dataset catalog and the load state.
//
// The catalog is the host's: each entry carries a `load()` the host wrote, and the
// library calls it and reads what comes back. The library fetches nothing, parses
// nothing and caches nothing on the host's behalf.
//
// The state machine lives here and not in the HUD, so a host that builds its own chrome
// drives the same calls the HUD does: `getDatasets`, `getLoadedDataset`, `loadDataset`
// and `onDatasetChange`.
import { readBounds } from '../camera/view';
import { readViewInput } from './view-input';
import type { ViewInput } from './view-input';
import type { BrowseBounds } from '../camera/view';
import type {
  AddReport,
  CategoryInput,
  CategoryReport,
  SystemRecordInput,
} from '../scene-data/real-systems';

/** The most entries the catalog holds. It is the bound the category table carries. */
export const MAX_DATASETS = 256;

/** What a `load()` gives back: the two arrays the map's readers take. */
export interface DatasetContent {
  readonly categories: readonly CategoryInput[];
  readonly systems: readonly SystemRecordInput[];
}

/**
 * Where the camera opens on a load. It carries the fields of `StartView` and one more,
 * `fit`, which frames the set the load wrote. A field the entry names beside `fit` wins
 * over what `fit` worked out.
 *
 * **A camera that already shows the new set keeps its place.** A `loadDataset` that is
 * not the start load leaves the view alone when all five of these hold:
 *
 * 1. the entry names `bounds`;
 * 2. those bounds resolve to a restricted space, and the new set holds a system;
 * 3. the `view` names `fit: 'systems'` and no other field;
 * 4. the cursor is inside those bounds and the distance is at or under their far zoom
 *    limit;
 * 5. the distance is at or above the distance `fit: 'systems'` writes for the new set.
 *
 * A catalog of one region therefore keeps the angle and the zoom the user set up. A host
 * that wants every load to frame its set names a field beside `fit`, such as the pitch
 * the camera holds, or drops `bounds` from the entry.
 *
 * The fields are those of `ViewInput`, which the start view option reads as well. The
 * name stays, because hosts write it.
 */
export type DatasetView = ViewInput;

/** One entry of the catalog, as the host writes it. */
export interface DatasetEntry {
  /** The identity of the entry. `loadDataset` takes it. */
  readonly id: string;
  /** The name the HUD shows. */
  readonly label: string;
  /** The group the dialog lists the entry under. */
  readonly collection?: string;
  /** Where in the galaxy the set holds records. */
  readonly region?: string;
  /** What the set holds, as a paragraph. */
  readonly description?: string;
  /** How many systems the set holds. */
  readonly systemCount?: number;
  /** Where the set lives. An entry that names none restores the map's own option. */
  readonly bounds?: BrowseBounds;
  /**
   * Where the camera opens on a load of this entry. An entry that names `bounds` and a
   * `view` of `fit: 'systems'` alone holds the camera where the user put it, whenever
   * the camera already shows the new set. `DatasetView` states the five conditions and
   * the two ways to keep the frame on every load.
   */
  readonly view?: DatasetView;
  /**
   * Reads the set. The library calls it and adds what comes back.
   *
   * The map aborts `signal` when a later load starts and when the map is disposed while
   * this load is in flight. A load that fetches passes the signal to `fetch`, so a
   * download that nobody reads stops. A load that declares no parameter still fits.
   */
  load(signal: AbortSignal): DatasetContent | Promise<DatasetContent>;
}

/** One entry as a reader of the handle sees it. It carries no `load`. */
export interface DatasetInfo {
  readonly id: string;
  readonly label: string;
  readonly collection?: string;
  readonly region?: string;
  readonly description?: string;
  readonly systemCount?: number;
  readonly bounds?: BrowseBounds;
  readonly view?: DatasetView;
}

/** Why the reader dropped an entry. */
export type DatasetRejectReason =
  'no-id' | 'no-label' | 'no-load' | 'duplicate-id' | 'over-capacity';

/** One entry the reader dropped. */
export interface DatasetReject {
  /** Where the entry sat in the option. */
  readonly index: number;
  readonly reason: DatasetRejectReason;
}

/** What the catalog reader gives back. */
export interface CatalogReport {
  /** The entries the reader kept, in the order the option gave them. */
  readonly entries: readonly DatasetEntry[];
  /** The entries the reader dropped, with an index and a reason. */
  readonly rejected: readonly DatasetReject[];
}

/** The message a load that a later load replaced rejects with. */
export const CANCELLED_MESSAGE = 'The dataset load was cancelled by a later one.';

/** A text field of an entry, or undefined when the entry names none. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** A finite count of 0 or above, or undefined when the entry names none. */
function countOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Reads the `datasets` option into the catalog. It drops an entry with no `id`, no
 * `label` or no `load`, an entry whose `id` repeats one already read, and every entry
 * past the 256th. Each drop is reported with its index and its reason, the way
 * `addCategories` reports one.
 */
export function readDatasets(datasets: unknown): CatalogReport {
  const entries: DatasetEntry[] = [];
  const rejected: DatasetReject[] = [];
  const ids = new Set<string>();
  const list = Array.isArray(datasets) ? datasets : [];
  const drop = (index: number, reason: DatasetRejectReason): void => {
    rejected.push({ index, reason });
  };

  for (let index = 0; index < list.length; index += 1) {
    const raw = list[index] as Partial<DatasetEntry> | null | undefined;
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    if (id.length === 0) {
      drop(index, 'no-id');
      continue;
    }
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    if (label.length === 0) {
      drop(index, 'no-label');
      continue;
    }
    if (typeof raw?.load !== 'function') {
      drop(index, 'no-load');
      continue;
    }
    if (ids.has(id)) {
      drop(index, 'duplicate-id');
      continue;
    }
    if (entries.length >= MAX_DATASETS) {
      drop(index, 'over-capacity');
      continue;
    }
    ids.add(id);
    const collection = textOf(raw.collection);
    const region = textOf(raw.region);
    const description = textOf(raw.description);
    const systemCount = countOf(raw.systemCount);
    // An unreadable `bounds` or `view` does not drop the entry: the set still loads, and
    // the entry then acts as one that named neither field.
    const bounds = raw.bounds === undefined ? null : readBounds(raw.bounds);
    const view = raw.view === undefined ? null : readViewInput(raw.view);
    entries.push({
      id,
      label,
      ...(collection === undefined ? {} : { collection }),
      ...(region === undefined ? {} : { region }),
      ...(description === undefined ? {} : { description }),
      ...(systemCount === undefined ? {} : { systemCount }),
      ...(bounds === null ? {} : { bounds }),
      ...(view === null ? {} : { view }),
      load: raw.load.bind(raw),
    });
  }

  return { entries, rejected };
}

/**
 * One entry without its `load`, which is what a reader of the handle gets. The reader
 * wrote every other field of the entry, so the rest of it is the reading.
 */
export function datasetInfo(entry: DatasetEntry): DatasetInfo {
  // The name `load` takes the function out of the reading. The rest is the reading.
  const { load, ...info } = entry;
  void load;
  return info;
}

/** What `loadDataset` gives back: the two reports of the map's readers. */
export interface DatasetLoadResult {
  readonly categories: CategoryReport;
  readonly systems: AddReport;
}

/** What the state machine needs of the map to write a set. */
export interface DatasetWriter {
  /**
   * Empties the set and the table, reads the content in, and clears the selection and
   * the name filter. The state machine calls it after `load()` settles, so a failed
   * load leaves the map with the set it already had.
   */
  write(content: DatasetContent): DatasetLoadResult;
  /**
   * Writes the browsable bounds of the entry that loaded. `null` restores the bounds the
   * map's own option named, so one restricted set does not restrict the next.
   */
  setBounds(bounds: BrowseBounds | null): void;
  /**
   * Opens the camera where the entry asks. The state machine calls it only for an entry
   * that names a `view`, so an entry that names none leaves the camera where it is.
   */
  applyView(view: DatasetView): void;
  /**
   * Whether the camera stands inside `bounds` if they are applied now. `null` reads the
   * bounds the options named, which is what `setBounds(null)` restores.
   *
   * It resolves `bounds` against the system box of the set now on the map and applies
   * nothing: the caller reads it **before** `setBounds`, because applying a bound clamps
   * the camera into it and every later reading is true.
   *
   * It is false where the bounds resolve to unrestricted, because every camera is inside
   * an unrestricted space and a reading of true would stop a jump the user needs.
   *
   * `runLoad` calls it only for an entry that names `bounds`.
   */
  viewInsideBounds(bounds: BrowseBounds): boolean;
}

/**
 * Whether a `view` asks for the frame of the set and nothing else.
 *
 * The rule that holds the camera reads `fit: 'systems'` alone. A field beside `fit` names
 * where to look, and a held camera would then give a view the host never asked for. The
 * helper counts the keys, so a field added to `DatasetView` later fails it rather than
 * slipping through as a `fit`-only view.
 */
function fitOnly(view: DatasetView): boolean {
  return view.fit === 'systems' && Object.keys(view).length === 1;
}

/** What the options give the state machine. */
export interface DatasetStateOptions extends DatasetWriter {
  /** The `datasets` option, as the host gave it. */
  readonly datasets?: unknown;
  /** The `dataset` option: the id of the entry to load at start. */
  readonly dataset?: unknown;
  /**
   * Whether the options named a `startView`. On the start load an entry's `view` applies
   * only where they did not, so a deep link the host passed as `startView` wins.
   */
  readonly hasStartView?: boolean;
}

/** The dataset state of one map. */
export interface DatasetState {
  /** What the catalog reader dropped. */
  readonly rejected: readonly DatasetReject[];
  /** The catalog, without the `load` functions. */
  getDatasets(): DatasetInfo[];
  /** The entry now on the map, or null. */
  getLoadedDataset(): DatasetInfo | null;
  /** Loads one entry and returns a promise of its report. */
  loadDataset(id: string): Promise<DatasetLoadResult>;
  /** Calls `listener` after the loaded dataset changes. Returns an unsubscribe. */
  onDatasetChange(listener: (entry: DatasetInfo | null) => void): () => void;
  /**
   * Loads the entry the options named, or the first one. It settles whether or not the
   * load succeeded, and it gives null when the catalog is empty.
   */
  startLoad(): Promise<void> | null;
  /**
   * Drops every listener and aborts the load in flight. A load that settles later writes
   * nothing and rejects as cancelled. `dispose` calls it.
   */
  clear(): void;
}

/** Builds the dataset state of one map. */
export function createDatasetState(options: DatasetStateOptions): DatasetState {
  const catalog = readDatasets(options.datasets);
  const listeners = new Set<(entry: DatasetInfo | null) => void>();
  let loaded: DatasetEntry | null = null;
  // Each load takes the next number. A load writes the map only while its number is
  // still the newest, so a later call wins and an earlier one rejects as cancelled.
  let counter = 0;
  // The controller of the newest load while it is in flight, and null after it settles.
  let active: AbortController | null = null;

  const announce = (): void => {
    const entry = loaded === null ? null : datasetInfo(loaded);
    for (const listener of listeners) listener(entry);
  };

  const runLoad = async (id: string, atStart: boolean): Promise<DatasetLoadResult> => {
    const entry = catalog.entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      throw new Error(`The catalog holds no dataset with the id "${id}".`);
    }
    counter += 1;
    const ticket = counter;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    let content: DatasetContent;
    try {
      content = await entry.load(controller.signal);
    } catch (error) {
      // A load that passes the signal to `fetch` rejects on the abort. The abort is the
      // later load or the dispose, so the promise rejects as cancelled, as a replaced
      // load that resolved does.
      if (ticket !== counter) throw new Error(CANCELLED_MESSAGE, { cause: error });
      throw error;
    } finally {
      if (active === controller) active = null;
    }
    if (ticket !== counter) throw new Error(CANCELLED_MESSAGE);
    const report = options.write(content);
    // A camera that already shows the new set keeps its place. The reading comes after
    // the write, because an `auto` bound resolves against the records that write put in,
    // and before `setBounds`, because applying a bound clamps the camera into it and
    // every later reading is true. The three conditions the entry carries are read first,
    // so a load that cannot be held does no geometry at all.
    const held =
      !atStart &&
      entry.bounds !== undefined &&
      entry.view !== undefined &&
      fitOnly(entry.view) &&
      options.viewInsideBounds(entry.bounds);
    // The bounds and the view are written before the announce, so a listener that adds
    // the shapes of the entry reads the bounds the entry asked for.
    options.setBounds(entry.bounds ?? null);
    // A deep link wins at start: the start load holds the entry's view where the options
    // named a `startView`, because the load settles after the page has already drawn.
    if (
      entry.view !== undefined &&
      !held &&
      !(atStart && options.hasStartView === true)
    ) {
      options.applyView(entry.view);
    }
    loaded = entry;
    announce();
    return report;
  };

  const loadDataset = (id: string): Promise<DatasetLoadResult> => runLoad(id, false);

  /** The entry the start load reads: the one `dataset` names, or the first one. */
  const startEntry = (): DatasetEntry | null => {
    if (catalog.entries.length === 0) return null;
    const id = typeof options.dataset === 'string' ? options.dataset : '';
    const named = catalog.entries.find((entry) => entry.id === id);
    return named ?? (catalog.entries[0] as DatasetEntry);
  };

  return {
    rejected: catalog.rejected,
    getDatasets(): DatasetInfo[] {
      return catalog.entries.map(datasetInfo);
    },
    getLoadedDataset(): DatasetInfo | null {
      return loaded === null ? null : datasetInfo(loaded);
    },
    loadDataset,
    onDatasetChange(listener: (entry: DatasetInfo | null) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startLoad(): Promise<void> | null {
      const entry = startEntry();
      if (entry === null) return null;
      // `ready` waits for this promise, and it settles whether or not the load
      // succeeded, so a failed dataset still leaves a drawing map.
      return runLoad(entry.id, true).then(
        () => undefined,
        () => undefined,
      );
    },
    clear(): void {
      listeners.clear();
      // The raise fails the ticket check of the load in flight, so it writes nothing.
      counter += 1;
      active?.abort();
      active = null;
    },
  };
}
