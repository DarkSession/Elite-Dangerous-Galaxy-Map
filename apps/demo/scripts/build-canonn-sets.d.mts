// The types of what the Canonn build exports. The script itself is JavaScript, because
// node runs it directly with no build step. `tests/canonn-sets.test.ts` imports the
// passes, so it reads these.

/** One record of a committed Canonn set. */
export interface CanonnRecord {
  readonly name: string;
  readonly coords: { readonly x: number; readonly y: number; readonly z: number };
  readonly keys?: readonly string[];
  readonly description?: string;
}

/** The name and the colour one map gives one key. */
export interface CanonnCategory {
  readonly name: string;
  readonly color: readonly number[];
}

/** One source of one map: an address, a reader and the naming that map gives its keys. */
export interface CanonnSource {
  readonly path: string;
  readonly reader: string | null;
  readonly names:
    | Record<string, { name: string; colour: string | null }>
    | ((
        keys: readonly string[],
      ) => Record<string, { name: string; colour: string | null }>);
  readonly select?: readonly string[];
  /** Why the address does not answer, where it does not. */
  readonly why?: string;
  /** What the reason was measured from, where the reason is a size. */
  readonly basis?: string;
}

/** One row of the map table: one `MapData-*.js` file of the Canonn source tree. */
export interface CanonnMap {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly demo?: boolean;
  readonly sources: readonly CanonnSource[];
}

/** One source of the table, with the maps that read it. */
export interface CanonnSourceEntry extends CanonnSource {
  readonly file: string;
  readonly maps: readonly string[];
}

/** What one source converts to: its records, and the naming a literal file carries. */
export interface CanonnReading {
  readonly records: readonly CanonnRecord[];
  readonly categories: Record<string, CanonnCategory> | null;
}

/** One file of an entry: the path it reads and the naming that entry gives its keys. */
export interface CanonnFileRow {
  readonly path: string;
  readonly categories: Record<string, CanonnCategory>;
  readonly count: number;
  readonly bytes: number;
}

/** One catalog entry, as the manifest holds it. */
export interface CanonnEntry {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly rows: readonly CanonnFileRow[];
  readonly count: number;
}

export declare const BUCKET: string;
export declare const RAW: string;
export declare const QUERY: string;
export declare const CONTENTS_URL: string;
export declare const SOURCE_URL: string;
export declare const LICENCE: string;
export declare const MAX_SYSTEMS: number;
export declare const MAX_DATASETS: number;
export declare const MAX_SET_BYTES: number;
export declare const MAX_TREE_BYTES: number;
export declare const CLOUD_PALETTE: readonly string[];
export declare const GEC_PALETTE: readonly string[];
export declare const MAPS: readonly CanonnMap[];
export declare const READERS: Record<string, unknown>;

export declare function rgbOf(hex: string): number[];
export declare function stableColour(seed: string): number[];
export declare function codexRows(text: string): string[][];
export declare function fileNameOf(entry: {
  path: string;
  select?: readonly string[];
}): string;
export declare function sourcesOf(
  maps?: readonly CanonnMap[],
): Map<string, CanonnSourceEntry>;
export declare function readMapList(
  entries: unknown,
  maps?: readonly CanonnMap[],
): string[];

/** The answer the listing reader takes, which is the part of `Response` it reads. */
export interface ListingAnswer {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export declare function listSourceTree(
  read?: (url: string, init?: unknown) => Promise<ListingAnswer>,
): Promise<unknown>;
export declare function convertSource(entry: CanonnSource, body: string): CanonnReading;

/** The answer the source reader takes, which is the part of `Response` it reads. */
export interface SourceAnswer {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export declare function fetchSource(
  entry: CanonnSource,
  read?: (url: string, init?: unknown) => Promise<SourceAnswer>,
  cacheDir?: string,
): Promise<string>;
export declare function keysOf(records: readonly CanonnRecord[]): string[];
export declare function categoriesOf(
  entry: CanonnSource,
  keys: readonly string[],
  mapId: string,
  own?: Record<string, CanonnCategory> | null,
): Record<string, CanonnCategory>;
export declare function setBytes(records: readonly CanonnRecord[]): number;
export declare function setOf(
  records: readonly CanonnRecord[],
  path?: string,
): { source: string; licence: string; records: readonly CanonnRecord[] };
export declare function slugOf(text: string): string;
export declare function splitSource(
  records: readonly CanonnRecord[],
  name: string,
): { name: string; records: readonly CanonnRecord[] }[];
export declare function splitEntry(
  map: CanonnMap,
  rows: readonly CanonnFileRow[],
): CanonnEntry[];
export declare function checkCatalog(count: number): void;
export declare function checkAgainstHeld(
  map: CanonnMap,
  count: number,
  held: Map<string, number>,
): void;
export declare function hostOf(path: string): string;
export declare function withoutEchoes(read: CanonnReading): CanonnReading;
export declare function describeEntry(
  entry: CanonnEntry,
  addressOf: (path: string) => string,
): string;
export declare function main(
  read?: (url: string, init?: unknown) => Promise<ListingAnswer | SourceAnswer>,
  options?: { cacheDir?: string; outDir?: string },
): Promise<void>;
