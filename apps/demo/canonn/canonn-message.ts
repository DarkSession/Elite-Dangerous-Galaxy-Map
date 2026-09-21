// The two messages the Canonn worker takes and gives, the shape of a committed set, and
// the one pass that makes the fetch list of an entry. They sit in a module of their own,
// so the page reads them without importing the worker, and a test reads them without
// starting the page.

/** One record of a committed set. The key carries no name and no colour. */
export interface CanonnRecord {
  readonly name: string;
  readonly coords: { readonly x: number; readonly y: number; readonly z: number };
  /** The keys of the record. A record that names none holds the empty key. */
  readonly keys?: readonly string[];
  readonly description?: string;
}

/** One committed set, as `apps/demo/scripts/build-canonn-sets.mjs` writes it. */
export interface CanonnSet {
  readonly source: string;
  readonly licence: string;
  readonly records: readonly CanonnRecord[];
}

/** One file of the entry: its bytes, and the name this map gives each key of it. */
export interface CanonnFile {
  /** The bytes of the file. The page moves them and does not read them. */
  readonly bytes: ArrayBuffer;
  /** The category name of each key, from the manifest row of this entry. */
  readonly names: Readonly<Record<string, string>>;
}

/** What the page sends: every file of the entry the user picked. */
export interface CanonnRequest {
  readonly files: readonly CanonnFile[];
}

/**
 * The records of one entry, packed into buffers the worker moves rather than copies.
 *
 * `addSystems` takes record objects, and a structured clone of 47,331 of them costs the
 * page 38 to 48 milliseconds in one burst, against 22 to 23 milliseconds of parse in the
 * worker. The clone is therefore the larger of the two, so the worker packs the fields
 * and the page builds the objects in slices, which it can stop between.
 *
 * A name holds no line break and a description holds no `NUL`, so the two blobs are
 * joined text. The worker fails the read where a record breaks that, rather than hand
 * back records that have slipped by one.
 */
export interface CanonnPacked {
  /** How many records the pack holds. */
  readonly count: number;
  /** The x, y and z of every record, in record order. A `Float64Array`. */
  readonly coords: ArrayBuffer;
  /** The names of every record, joined by line breaks, as UTF-8. */
  readonly names: ArrayBuffer;
  /**
   * The description of every record, joined by `NUL`, as UTF-8. It holds no byte where
   * no record of the entry carries a description.
   */
  readonly descriptions: ArrayBuffer;
  /** The distinct category names, which the indices below read. */
  readonly categoryNames: readonly string[];
  /** The categories of every record, as indices of `categoryNames`. A `Uint16Array`. */
  readonly categories: ArrayBuffer;
  /**
   * Where the categories of each record start. A `Uint32Array` of `count + 1` numbers:
   * the first is 0 and the last is the length of `categories`, which is the number of
   * keys of every record together and not the record count. The categories of record
   * `at` are the indices from `categoryStarts[at]` up to `categoryStarts[at + 1]`.
   */
  readonly categoryStarts: ArrayBuffer;
}

/** What the worker gives back: the packed records, or the message of the failure. */
export interface CanonnAnswer {
  /** The records it read, where the read worked. */
  readonly packed?: CanonnPacked;
  /** Why the read failed, where it failed. */
  readonly error?: string;
  /** How long the parse and the pack took, in milliseconds. */
  readonly parseMs?: number;
  /** When the worker posted the answer, on the wall clock both threads read. */
  readonly sentAt?: number;
}

/**
 * The files one manifest row fetches: one entry per **distinct** path, with the name each
 * key of that path carries.
 *
 * The catalog states that an entry fetches the files it names, each one once. A row that
 * named one path twice would otherwise be two requests for one set, so the two name
 * tables merge here and the first name of a key wins, as the category list of the page
 * does. No row of the committed manifest repeats a path today, so the pass is what keeps
 * a later one from costing a second request.
 */
export function filesOfRow(
  files: readonly {
    readonly path: string;
    readonly categories: Readonly<Record<string, { readonly name: string }>>;
  }[],
): { path: string; names: Record<string, string> }[] {
  const once = new Map<string, Record<string, string>>();
  for (const file of files) {
    const names = once.get(file.path) ?? {};
    for (const [key, named] of Object.entries(file.categories)) {
      if (names[key] === undefined) names[key] = named.name;
    }
    once.set(file.path, names);
  }
  return [...once].map(([path, names]) => ({ path, names }));
}
