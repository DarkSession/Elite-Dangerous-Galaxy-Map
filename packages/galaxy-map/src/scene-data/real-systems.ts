// The category table, the record reader and the set of real star systems the host
// gives the map. This module owns the shape of an EDSM or a Spansh dump record:
// nothing else reads a raw record. Nothing here knows about WebGL.
import { readColor, readName } from './read-field';
import { readIcons } from './marker-icons';
import type { ResolvedIcon, SystemIconInput } from './marker-icons';
import { loadGalaxyModel } from '../galaxy-model/load';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import type { Range } from '../galaxy-model/types';
import type { SystemBox } from '../camera/view';

/**
 * The largest number of systems the set holds. The set allocates no record buffer for the
 * bound: it grows the buffers with the records, so a host pays for the records it gives.
 */
export const MAX_SYSTEMS = 50000;

/**
 * How many records the first block of each record buffer holds. The set allocates no
 * record buffer before the first record and doubles the block when the next record does
 * not fit, so a host pays for the records it holds and not for the bound.
 */
export const FIRST_RECORD_BLOCK = 64;

/** The largest number of categories the table holds. */
export const MAX_CATEGORIES = 256;

/**
 * How close an invented star comes to a real system before the field drops it, in
 * light years. It is about half the mean spacing of systems at Sol, so an invented
 * star that close stands for the same system the record names.
 */
export const SUPPRESSION_RADIUS_LY = 3;

/**
 * The bounds of the galaxy model, in game coordinates. The reader takes them from the
 * parameter document alone, so it never loads the 1024 by 1024 detail grid.
 */
export const MODEL_BOUNDS: Range = loadGalaxyModel(parameters).bounds;

/** The two shapes a marker draws in. */
export type MarkerStyle = 'glow' | 'disc';

/** The style a category takes when it names none. */
export const DEFAULT_MARKER_STYLE: MarkerStyle = 'glow';

/**
 * The draw range a category takes when it names none, in light years. It is the far zoom
 * limit, so a marker at the cursor draws at every zoom the map reaches. It still cuts a
 * marker far from the cursor at a far view: at a zoom of 120,000 light years the camera
 * sits about 146,600 light years from the cursor, and the far rim of the disc lies about
 * 126,800 light years further, so the default removes the markers of the outer band the
 * frame still draws.
 */
export const DEFAULT_MAX_DRAW_RANGE_LY = 120000;

/**
 * The colour a marker draws in when its system names no category, as red, green and
 * blue from 0 to 255. It is the neutral blue-white of an unclassified star.
 *
 * A category names its own colour, so this is the one look value no category default
 * states. It is a stated constant and not a host option: a host that wants another
 * colour uses categories.
 */
export const DEFAULT_MARKER_COLOR: readonly [number, number, number] = [150, 170, 200];

/**
 * The table index an uncategorised system points at. The set holds one internal row at
 * it, carrying the three defaults above, and that row is not in the table:
 * `categoryCount` reads 0 and the handle's `getCategory` reads null.
 *
 * The row is what lets the marker pass, the pick sweep and the marker overlay read one
 * colour, one style and one draw range for every system, with no branch for a set that
 * names no category.
 */
const UNCATEGORISED_INDEX = 0;

/** The internal row an uncategorised system draws through. */
const UNCATEGORISED_CATEGORY: Category = {
  name: '',
  color: DEFAULT_MARKER_COLOR,
  markerStyle: DEFAULT_MARKER_STYLE,
  maxDrawRange: DEFAULT_MAX_DRAW_RANGE_LY,
};

/** One group the host sorts its systems into. */
export interface Category {
  /** The identity of the category. */
  readonly name: string;
  /** Red, green and blue, each from 0 to 255. */
  readonly color: readonly [number, number, number];
  /** What the phase 4 HUD shows about the category. */
  readonly description?: string;
  /** The shape the markers of the category draw in. */
  readonly markerStyle: MarkerStyle;
  /** How far the camera comes from a system before its marker stops, in light years. */
  readonly maxDrawRange: number;
}

/**
 * What a host passes to `addCategories`. The type states the contract and the reader
 * holds it: every field is still checked at run time, because the data comes from a
 * file or a network call the compiler does not see.
 *
 * The index signature lets a record carry fields the reader drops, so a caller does not
 * have to strip a dump record first.
 */
export interface CategoryInput {
  /** The identity of the category. */
  readonly name: string;
  /** Red, green and blue, each from 0 to 255. */
  readonly color: readonly [number, number, number];
  /** What the HUD shows about the category. */
  readonly description?: string;
  /** The shape the markers of the category draw in. The default is `glow`. */
  readonly markerStyle?: MarkerStyle;
  /** How far the camera comes from a system before its marker stops, in light years. */
  readonly maxDrawRange?: number;
  /** A field the reader drops. */
  readonly [field: string]: unknown;
}

/** Why the reader rejected a category. */
export type CategoryRejectReason =
  | 'no-name'
  | 'bad-color'
  | 'bad-style'
  | 'bad-range'
  | 'over-capacity'
  // What a call takes while the set holds a system that names no category. A set is
  // categorised or it is not, and never half of each.
  | 'set-is-uncategorised';

/** One category the reader rejected. */
export interface CategoryReject {
  /** Where the category sat in the call. */
  readonly index: number;
  readonly reason: CategoryRejectReason;
}

/** What `addCategories` gives back. */
export interface CategoryReport {
  readonly added: number;
  readonly replaced: number;
  readonly rejected: CategoryReject[];
}

/** Why the reader rejected a record. */
export type RejectReason =
  | 'no-name'
  | 'no-coords'
  | 'no-category'
  | 'unknown-category'
  | 'out-of-bounds'
  | 'over-capacity'
  // The last two the reader tests, so a record that is faulty in an earlier field
  // reports that earlier reason.
  | 'bad-icon'
  | 'unknown-icon';

/** One record the reader rejected. */
export interface Reject {
  /** Where the record sat in the call. */
  readonly index: number;
  readonly reason: RejectReason;
}

/** What `addSystems` gives back. */
export interface AddReport {
  readonly added: number;
  readonly replaced: number;
  readonly rejected: Reject[];
}

/** The largest number of images one record holds. */
export const MAX_IMAGES = 8;

/** One picture of a system, which the HUD shows as a thumbnail. */
export interface SystemImage {
  /** Where the browser loads the picture from. The library never fetches it. */
  readonly url: string;
  /** What the picture shows. */
  readonly caption?: string;
}

/** One real system the set holds. */
export interface RealSystem {
  readonly name: string;
  /** The position in game coordinates, in light years. */
  readonly position: readonly [number, number, number];
  /**
   * The categories the record names, in its own order and without a repeat. The first
   * one gives the marker its colour, its style and its draw range. It is empty where the
   * record names none, which an uncategorised set holds.
   */
  readonly categories: readonly string[];
  /** The 64-bit system id as a decimal string. */
  readonly id64?: string;
  readonly allegiance?: string;
  readonly government?: string;
  readonly primaryEconomy?: string;
  readonly security?: string;
  readonly population?: number;
  readonly bodyCount?: number;
  /** A paragraph about the system, which the HUD shows. */
  readonly description?: string;
  /** The class of the primary star, for example `K5 V`. */
  readonly primaryStar?: string;
  /** Up to 8 pictures, which the HUD shows as thumbnails. */
  readonly images?: readonly SystemImage[];
  /** Up to 4 icons, which the map stacks over the marker, lowest first. */
  readonly icons?: readonly ResolvedIcon[];
}

/**
 * What a host passes to `addSystems`. It is the shape of an EDSM or a Spansh dump
 * record. The type states the contract and the reader holds it: every field is still
 * checked at run time, because the data comes from a file or a network call the
 * compiler does not see.
 *
 * The index signature lets a record carry fields the reader drops, so a caller does not
 * have to strip a dump record first.
 */
export interface SystemRecordInput {
  readonly name: string;
  /** The position in game coordinates, in light years. */
  readonly coords: { readonly x: number; readonly y: number; readonly z: number };
  /**
   * The names of categories the table holds, in the order the marker reads them. The
   * first one gives the colour, the style and the draw range. A record may name none,
   * which the reader takes while the category table is empty.
   */
  readonly categories?: readonly string[];
  /**
   * The two names `categories` replaces. Each one is `never`, so a record that carries
   * it fails the compile.
   *
   * The ban has to sit in the type. The index signature below turns off TypeScript's
   * excess-property check, so a record naming `primaryCategory` beside `categories`
   * would compile clean and the reader would drop it with no word to the caller.
   */
  readonly primaryCategory?: never;
  readonly secondaryCategories?: never;
  /**
   * The 64-bit system id. `JSON.parse` loses digits above 2^53, so a host that needs
   * every digit passes a string or a `bigint`.
   */
  readonly id64?: number | string | bigint;
  readonly allegiance?: string;
  readonly government?: string;
  readonly primaryEconomy?: string;
  readonly security?: string;
  readonly population?: number;
  readonly bodyCount?: number;
  /** A paragraph about the system, which the HUD shows. */
  readonly description?: string;
  /** The class of the primary star, for example `K5 V`. */
  readonly primaryStar?: string;
  /** Up to 8 pictures, which the HUD shows as thumbnails. */
  readonly images?: readonly SystemImage[];
  /**
   * Up to 4 icons over the marker, lowest first. An entry is the symbol of a built-in
   * icon or an object with the host's own `url` and the `color` of its arrow. It is the
   * one optional field a bad value rejects the record for, rather than drops.
   */
  readonly icons?: readonly SystemIconInput[];
  /** A field the reader drops. */
  readonly [field: string]: unknown;
}

/** The category table and the system set, which the host fills through the handle. */
export interface RealSystemSet {
  /** Reads categories into the table and reports what it did. */
  addCategories(categories: readonly CategoryInput[]): CategoryReport;
  /** Reads records into the set and reports what it did. */
  addSystems(records: readonly SystemRecordInput[]): AddReport;
  /** Empties the set. */
  clearSystems(): void;
  /** Empties the set and the category table together. */
  clearSystemsAndCategories(): void;
  /** How many systems the set holds. */
  readonly count: number;
  /**
   * How many systems of the set named at least one icon, which is how many indices
   * `iconIndices` holds. The icon pass skips its whole placement while this reads 0,
   * because the icon switch is on by default and a set that names no icon must pay no
   * per-frame work for it.
   *
   * The count may be high and never low. A record that replaces one with icons by one
   * without leaves its index where it is, because a correction would need a sweep of the
   * set. A high count costs one read of that record per frame and every icon still
   * draws; a low one would hide icons on the map with no report.
   */
  readonly iconSystemCount: number;
  /**
   * The index of each system whose record named at least one icon, in the order the
   * records were added. The icon pass walks this list and not the set, so the per-frame
   * placement cost follows the records that carry icons.
   *
   * It follows the rule `iconSystemCount` states: an index goes in and comes out only
   * where the set is emptied. A reader takes `system(index)?.icons` per entry, so an
   * index whose record lost its icons costs one read and draws nothing.
   */
  readonly iconIndices: Int32Array;
  /** How many indices the list above holds. */
  readonly iconIndexCount: number;
  /**
   * Where the icons of each record start in `iconVectors`, in the same order as the
   * records. The entry of a record that names none is not read: `iconCounts` reads 0.
   */
  readonly iconStarts: Int32Array;
  /** How many icons each record names, in the same order, and 0 where it names none. */
  readonly iconCounts: Uint8Array;
  /**
   * The icons of every record, in one flat run per record. The icon pass reads the three
   * views and builds no record for a candidate: a record object and a category object
   * per candidate was a third of the sweep's time at 50,000 systems.
   */
  readonly iconVectors: readonly ResolvedIcon[];
  /** How many categories the table holds. */
  readonly categoryCount: number;
  /** Rises on every change to the set. */
  readonly version: number;
  /** Rises on every change to the category table, and on a change of a visibility. */
  readonly categoryVersion: number;
  /**
   * Rises only where the table itself changes: a category added, a category replaced, or
   * the table emptied. A visibility switch and a name filter leave it where it is, so the
   * shape set, which reads the names and the colours alone, sweeps no shape on a switch
   * of the markers.
   */
  readonly categoryTableVersion: number;
  /** Three game coordinates per system, in the order the records were added. */
  readonly positions: Float64Array;
  /**
   * The table index of the category each system draws through, in the same order. It is
   * the first category the record names that is on, in the record's own order. A system
   * whose categories are all off draws no marker, and its entry holds the index of the
   * first category it names.
   *
   * A system that names no category holds the index of the set's internal row, which
   * carries the library defaults and is not in the table.
   */
  readonly categoryIndices: Uint16Array;
  /**
   * One byte per system, in the same order: 1 when its marker draws and 0 when the
   * category switch or the name filter cuts it. The marker pass and the pick sweep both
   * read it, so the two never disagree about what is on the screen. It is rebuilt when
   * the set or the category table changes, which is once per change and not once per
   * frame.
   */
  readonly markerFlags: Uint8Array;
  /**
   * The draw range of the category each system draws through, in light years, in the
   * same order. It is 0 where the marker does not draw. The pick reads it instead of
   * the category row of every system, so the sweep costs one typed array read per
   * system and no table lookup.
   */
  readonly drawRanges: Float32Array;
  /**
   * How long the last rebuild of the flags took, in milliseconds. A browser test reads
   * it through the handle to hold the sweep to its budget.
   */
  readonly lastSweepMs: number;
  /**
   * How many category rows the flat store holds. A unit case reads it to hold the store
   * to the records, because a replacement must write over the run of the record and not
   * append a second one.
   */
  readonly categoryRowCount: number;
  /**
   * The smallest axis-aligned box that holds every system the set has been given, in game
   * coordinates. The `auto` browsable bound reads it.
   *
   * It is kept as records arrive and nothing sweeps the set for it: `addSystems` widens
   * six numbers as it writes each record, and the two clears reset them. A record that
   * **replaces** another widens the box and never shrinks it, because a shrink would need
   * the sweep this rule exists to avoid. `empty` is true until the first record lands.
   */
  readonly systemBox: SystemBox;
  /** True when the marker of one system draws. False outside the set. */
  drawsMarker(index: number): boolean;
  /** Turns the markers of a category on or off. An unknown name changes nothing. */
  setCategoryVisible(name: string, visible: boolean): void;
  /** True when the markers of a category draw. False for a name the table lacks. */
  isCategoryVisible(name: string): boolean;
  /** Keeps the markers whose name holds the text, compared without case. */
  setNameFilter(text: string): void;
  /** Reads the filter text. */
  getNameFilter(): string;
  /** One system, or null outside the set. */
  system(index: number): RealSystem | null;
  /** One category of the table, or null outside it. */
  category(index: number): Category | null;
  /** The table index of a category name, or -1 when the table does not hold it. */
  categoryIndex(name: string): number;
  /**
   * The index of the system with an identity, or -1. The identity is the `id64` when the
   * record carries one, and the name when it does not.
   */
  indexOfIdentity(identity: string): number;
}

/** A finite number, or null. */
function readFinite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * The marker style of a category record. It gives the default when the field is absent
 * and `null` on any other value, because a style the reader does not know rejects the
 * category. A host that misspells a style would otherwise get the default and no report.
 */
function readMarkerStyle(value: unknown): MarkerStyle | null {
  if (value === undefined) return DEFAULT_MARKER_STYLE;
  if (value === 'glow' || value === 'disc') return value;
  return null;
}

/**
 * The draw range of a category record, in light years. It gives the default when the
 * field is absent and `null` on a value that is not a finite number above 0.
 */
function readDrawRange(value: unknown): number | null {
  if (value === undefined) return DEFAULT_MAX_DRAW_RANGE_LY;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

/**
 * The `id64` as a decimal string. A Spansh `id64` is a 64-bit integer and `JSON.parse`
 * loses digits above 2^53, so a host that needs every digit passes a string or a
 * `bigint`.
 */
function readId64(value: unknown): string | null {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

/**
 * True when a URL names a scheme the library may put in an image element. A URL with no
 * scheme is a relative URL and passes. The rule is a safety rule and not a formatting
 * one: a `javascript:` or a `data:` URL from an untrusted dump would run or embed
 * content the host did not mean to serve. The record images and the loading image of
 * the entry point both read it, so one rule covers every picture the library shows.
 */
export function safeImageUrl(url: string): boolean {
  // The test reads the string the browser reads. The URL standard removes every tab,
  // carriage return and line feed from the whole string, and strips the C0 control
  // characters and the spaces at each end, before it reads the scheme. A guard on the
  // raw string therefore lets `\tjavascript:` through, and the browser still runs it.
  const joined = url.replace(/[\t\n\r]/g, '');
  let start = 0;
  let end = joined.length;
  // Every C0 control character and the space, which is code point 32 and below.
  while (start < end && joined.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && joined.charCodeAt(end - 1) <= 0x20) end -= 1;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(joined.slice(start, end));
  if (scheme === null) return true;
  const name = scheme[0].slice(0, -1).toLowerCase();
  return name === 'http' || name === 'https';
}

/**
 * The images of a record, at most 8, in the order the record gave them. An entry that
 * is not an object, whose `url` is not a string, or whose `url` names another scheme is
 * dropped. A bad entry does not reject the record, because an image is decoration and
 * the rest of the record still draws and still reads.
 */
function readImages(value: unknown): SystemImage[] | null {
  if (!Array.isArray(value)) return null;
  const images: SystemImage[] = [];
  for (const entry of value) {
    if (images.length >= MAX_IMAGES) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const source = entry as Record<string, unknown>;
    const url = source['url'];
    if (typeof url !== 'string' || url.length === 0) continue;
    if (!safeImageUrl(url)) continue;
    const caption = source['caption'];
    images.push(typeof caption === 'string' ? { url, caption } : { url });
  }
  return images.length === 0 ? null : images;
}

/** True when a position lies inside the model bounds. */
function insideBounds(x: number, y: number, z: number): boolean {
  const bounds = MODEL_BOUNDS;
  return (
    x >= bounds.x[0] &&
    x <= bounds.x[1] &&
    y >= bounds.y[0] &&
    y <= bounds.y[1] &&
    z >= bounds.z[0] &&
    z <= bounds.z[1]
  );
}

/** The record fields the reader keeps as strings, beside the name. */
const TEXT_FIELDS = [
  'allegiance',
  'government',
  'primaryEconomy',
  'security',
  'description',
  'primaryStar',
] as const;

/** The record fields the reader keeps as finite numbers. */
const NUMBER_FIELDS = ['population', 'bodyCount'] as const;

/** A system while the reader builds it. */
interface MutableSystem {
  name: string;
  position: [number, number, number];
  categories: string[];
  id64?: string;
  allegiance?: string;
  government?: string;
  primaryEconomy?: string;
  security?: string;
  population?: number;
  bodyCount?: number;
  description?: string;
  primaryStar?: string;
  images?: SystemImage[];
  icons?: ResolvedIcon[];
}

/** Creates an empty category table and an empty system set. */
export function createSystemSet(): RealSystemSet {
  const categories: Category[] = [];
  const categoryOf = new Map<string, number>();
  // What the user chose to look at, by category name. A category is on when the table
  // takes it, and a replacement under the same name keeps the choice, because the
  // replacement changes the table entry and not what the user asked to see.
  const categoryVisible = new Map<string, boolean>();
  let categoryVersion = 0;
  let categoryTableVersion = 0;

  // The record buffers. Each one starts empty and grows when the next record does not
  // fit, so a map that holds no record holds no record buffer. A reader must not hold
  // one over a growth: the public getters cut the store the set holds now, and `version`
  // rises where the set grows.
  let capacity = 0;
  let positions = new Float64Array(0);
  let categoryIndices = new Uint16Array(0);
  const systems: RealSystem[] = [];
  // The name of each system folded to lower case, written once when the record is added.
  // The name filter reads it, so a change of the filter text folds no name again.
  const foldedNames: string[] = [];
  // The running box of every system the set has been given. `boxEmpty` is the flag, so a
  // reader never meets the numbers the box holds before the first record.
  let boxEmpty = true;
  const boxMin: [number, number, number] = [0, 0, 0];
  const boxMax: [number, number, number] = [0, 0, 0];
  // The identity of each system, so a call of 50,000 records costs 50,000 map lookups
  // rather than a scan of the set for each record.
  const slotOf = new Map<string, number>();
  let version = 0;
  // The slots whose record named at least one icon, and a flag per slot so a
  // replacement writes no second entry. The renderer walks this list and not the set,
  // so the per-frame stack work follows the records that carry icons and not the 50,000
  // the set can hold.
  //
  // The list rises with a record that carries an icon and empties only where the set
  // does, so it reads high and never low. A record that replaces one with icons by one
  // without leaves its index in the list: the reader takes the icons of each entry, so
  // a stale entry costs one read and draws nothing.
  let iconIndices = new Int32Array(0);
  let iconFlags = new Uint8Array(0);
  let iconIndexCount = 0;
  // The icons of each record, in one flat run per record, as the categories are. The
  // icon pass reads these and never builds a record. A record names at most 4 icons, so
  // the run of a record is short; a replacement writes over the run while its count
  // fits, by the rule the category rows follow.
  let iconStart = new Int32Array(0);
  let iconCount = new Uint8Array(0);
  let iconRoom = new Uint8Array(0);
  const iconVectors: ResolvedIcon[] = [];
  let iconVectorCount = 0;

  /** Puts a slot in the icon list, once. */
  const noteIconSystem = (slot: number): void => {
    if (iconFlags[slot] === 1) return;
    iconFlags[slot] = 1;
    iconIndices[iconIndexCount] = slot;
    iconIndexCount += 1;
  };
  // How many records name no category. It follows the same rule as the icon count: a
  // record raises it and only a clear resets it, so a replacement needs no sweep.
  // `addCategories` rejects every category while it is above 0.
  let uncategorisedSystems = 0;

  // The filter text, and the same text folded to lower case once. The comparison folds
  // both sides to lower case, so it reads the same in every browser.
  let nameFilter = '';
  let nameFilterFold = '';

  // One byte per system: 1 when its marker draws. The flags follow the set, the
  // category table and the filter, and the visibility and the filter both raise
  // `categoryVersion`, so one pair of version numbers says when to build them again.
  let markerFlags = new Uint8Array(0);
  // The draw range of the drawn category of each system, and 0 where no marker draws.
  // The pick reads it rather than the category row of every system.
  let drawRanges = new Float32Array(0);
  // The categories each record names, as table rows, in one flat run per record. The
  // sweep reads the rows of a record out of typed arrays: a name lookup per category
  // per record is what the sweep cost before, and it is what the bound could not hold.
  //
  // A record's names resolve to rows when the record arrives, and a row never moves: a
  // replacement under the same name keeps its index, and only the paired clear empties
  // the table. So the rows of a record hold until the record is written again.
  let catStart = new Int32Array(0);
  let catCount = new Uint16Array(0);
  let catRows = new Uint16Array(0);
  // How many rows the run of each record holds, which is the largest count the record
  // has carried. A replacement writes over the run while its count fits, so a record
  // that is written again and again adds no row to the flat store.
  let catRoom = new Uint16Array(0);
  let catRowCount = 0;
  // One entry per table row: 1 while the row is on, and the row's draw range. The sweep
  // reads both by row, so it makes no lookup by name. Row 0 carries the library defaults
  // while the table is empty, which is the row an uncategorised set draws through.
  const rowVisible = new Uint8Array(MAX_CATEGORIES);
  const rowRange = new Float64Array(MAX_CATEGORIES);
  rowVisible.fill(1);
  rowRange.fill(DEFAULT_MAX_DRAW_RANGE_LY);
  let flagsVersion = -1;
  let flagsCategoryVersion = -1;
  // How long the last rebuild of the flags took. The sweep runs on a change and not on
  // a frame, and the spec holds it under 2 milliseconds for 50,000 systems.
  let lastSweepMs = 0;

  /**
   * Makes room for `needed` records. It allocates the first block on the first record
   * and doubles the block after that, so the copies are logarithmic in the record count.
   * Growth replaces every record buffer, so `version` rises here: a reader that caches by
   * version then sees that the store behind the members moved.
   */
  const grow = (needed: number): void => {
    if (needed <= capacity) return;
    let next = capacity === 0 ? FIRST_RECORD_BLOCK : capacity;
    while (next < needed) next *= 2;
    if (next > MAX_SYSTEMS) next = MAX_SYSTEMS;

    const nextPositions = new Float64Array(next * 3);
    nextPositions.set(positions);
    positions = nextPositions;
    const nextCategoryIndices = new Uint16Array(next);
    nextCategoryIndices.set(categoryIndices);
    categoryIndices = nextCategoryIndices;
    const nextIconIndices = new Int32Array(next);
    nextIconIndices.set(iconIndices);
    iconIndices = nextIconIndices;
    const nextIconFlags = new Uint8Array(next);
    nextIconFlags.set(iconFlags);
    iconFlags = nextIconFlags;
    const nextIconStart = new Int32Array(next);
    nextIconStart.set(iconStart);
    iconStart = nextIconStart;
    const nextIconCount = new Uint8Array(next);
    nextIconCount.set(iconCount);
    iconCount = nextIconCount;
    const nextIconRoom = new Uint8Array(next);
    nextIconRoom.set(iconRoom);
    iconRoom = nextIconRoom;
    const nextMarkerFlags = new Uint8Array(next);
    nextMarkerFlags.set(markerFlags);
    markerFlags = nextMarkerFlags;
    const nextDrawRanges = new Float32Array(next);
    nextDrawRanges.set(drawRanges);
    drawRanges = nextDrawRanges;
    const nextCatStart = new Int32Array(next);
    nextCatStart.set(catStart);
    catStart = nextCatStart;
    const nextCatCount = new Uint16Array(next);
    nextCatCount.set(catCount);
    catCount = nextCatCount;
    const nextCatRoom = new Uint16Array(next);
    nextCatRoom.set(catRoom);
    catRoom = nextCatRoom;

    capacity = next;
    version += 1;
  };

  /** Makes room for `needed` category rows in the flat run, by the same block rule. */
  const growRows = (needed: number): void => {
    if (needed <= catRows.length) return;
    let next = catRows.length === 0 ? FIRST_RECORD_BLOCK : catRows.length;
    while (next < needed) next *= 2;
    const nextRows = new Uint16Array(next);
    nextRows.set(catRows);
    catRows = nextRows;
  };

  /**
   * The table index of the first category a record names. A record that names none takes
   * the internal row, which every reader of `categoryIndices` can read.
   */
  const indexOfFirst = (names: readonly string[]): number => {
    const first = names[0];
    if (first === undefined) return UNCATEGORISED_INDEX;
    return categoryOf.get(first) ?? UNCATEGORISED_INDEX;
  };

  /**
   * The table index of the first category the system names that is on, or -1 when every
   * one of them is off. The order is the record's own order.
   *
   * The marker draws while any category it belongs to is on, and it takes its colour, its
   * style and its draw range from this one. A row the user left on therefore keeps the
   * system on the map and gives it the colour of that row.
   *
   * A system that names no category always draws, and it takes the internal row: no
   * switch reaches it.
   */
  const firstCategoryOn = (slot: number): number => {
    const count = catCount[slot] as number;
    if (count === 0) return UNCATEGORISED_INDEX;
    const start = catStart[slot] as number;
    for (let step = 0; step < count; step += 1) {
      const row = catRows[start + step] as number;
      if (rowVisible[row] === 1) return row;
    }
    return -1;
  };

  // One sweep writes the three arrays. The drawn category comes out of the same read of
  // the system's rows that says whether the marker draws at all, so the sweep costs one
  // walk and the readings never disagree.
  //
  // The walk reads typed arrays alone: the rows of the record, the visibility of a row
  // and the range of a row. The folded name is read only under a filter.
  const refreshFlags = (): void => {
    if (flagsVersion === version && flagsCategoryVersion === categoryVersion) return;
    const startMs = performance.now();
    const filtering = nameFilterFold.length > 0;
    for (let index = 0; index < systems.length; index += 1) {
      const drawn = firstCategoryOn(index);
      const kept =
        !filtering || (foldedNames[index] as string).includes(nameFilterFold);
      const draws = drawn >= 0 && kept;
      markerFlags[index] = draws ? 1 : 0;
      // A system with every category off draws no marker, so the index it holds never
      // reaches the frame. It keeps the index of the first category it names, which is
      // always a row of the table, so no reader of the array meets an unreadable index.
      const row =
        drawn >= 0
          ? drawn
          : ((catRows[catStart[index] as number] as number) ?? UNCATEGORISED_INDEX);
      categoryIndices[index] = row;
      drawRanges[index] = draws ? (rowRange[row] as number) : 0;
    }
    flagsVersion = version;
    flagsCategoryVersion = categoryVersion;
    lastSweepMs = performance.now() - startMs;
  };

  /** Widens the running box to hold one position. */
  const widenBox = (position: readonly [number, number, number]): void => {
    if (boxEmpty) {
      boxMin[0] = position[0];
      boxMin[1] = position[1];
      boxMin[2] = position[2];
      boxMax[0] = position[0];
      boxMax[1] = position[1];
      boxMax[2] = position[2];
      boxEmpty = false;
      return;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position[axis] as number;
      if (value < (boxMin[axis] as number)) boxMin[axis] = value;
      if (value > (boxMax[axis] as number)) boxMax[axis] = value;
    }
  };

  const writeSystem = (slot: number, system: RealSystem): void => {
    grow(slot + 1);
    systems[slot] = system;
    foldedNames[slot] = system.name.toLowerCase();
    // The record's categories go in as table rows, once. A replacement writes over the
    // run it had while the run is long enough, so a call that replaces the whole set
    // adds no row to the flat run. The run of a record grows to the largest count the
    // record has carried and stops there, which is at most `MAX_CATEGORIES`.
    const names = system.categories;
    if (names.length > (catRoom[slot] as number)) {
      growRows(catRowCount + names.length);
      catStart[slot] = catRowCount;
      catRowCount += names.length;
      catRoom[slot] = names.length;
    }
    catCount[slot] = names.length;
    const start = catStart[slot] as number;
    for (let step = 0; step < names.length; step += 1) {
      catRows[start + step] =
        categoryOf.get(names[step] as string) ?? UNCATEGORISED_INDEX;
    }
    // The icons go in as one flat run, by the same rule the category rows follow.
    const icons = system.icons ?? [];
    if (icons.length > (iconRoom[slot] as number)) {
      iconStart[slot] = iconVectorCount;
      iconVectorCount += icons.length;
      iconRoom[slot] = icons.length;
    }
    iconCount[slot] = icons.length;
    const iconAt = iconStart[slot] as number;
    for (let step = 0; step < icons.length; step += 1) {
      iconVectors[iconAt + step] = icons[step] as ResolvedIcon;
    }
    widenBox(system.position);
    positions[slot * 3] = system.position[0];
    positions[slot * 3 + 1] = system.position[1];
    positions[slot * 3 + 2] = system.position[2];
    categoryIndices[slot] = indexOfFirst(system.categories);
  };

  return {
    addCategories(input: readonly CategoryInput[]): CategoryReport {
      const rejected: CategoryReject[] = [];
      let added = 0;
      let replaced = 0;

      // A set is categorised or it is not. While it holds a system that names no
      // category the whole call is refused, so the map never draws a set where only
      // some systems carry a row.
      if (uncategorisedSystems > 0) {
        for (let index = 0; index < input.length; index += 1) {
          rejected.push({ index, reason: 'set-is-uncategorised' });
        }
        return { added, replaced, rejected };
      }

      for (let index = 0; index < input.length; index += 1) {
        const source = input[index];
        if (typeof source !== 'object' || source === null) {
          rejected.push({ index, reason: 'no-name' });
          continue;
        }
        const record = source as Record<string, unknown>;
        const name = readName(record['name']);
        if (name === null) {
          rejected.push({ index, reason: 'no-name' });
          continue;
        }
        const color = readColor(record['color']);
        if (color === null) {
          rejected.push({ index, reason: 'bad-color' });
          continue;
        }
        const markerStyle = readMarkerStyle(record['markerStyle']);
        if (markerStyle === null) {
          rejected.push({ index, reason: 'bad-style' });
          continue;
        }
        const maxDrawRange = readDrawRange(record['maxDrawRange']);
        if (maxDrawRange === null) {
          rejected.push({ index, reason: 'bad-range' });
          continue;
        }
        const existing = categoryOf.get(name);
        // A replacement adds no category, so the capacity bound never rejects one.
        if (existing === undefined && categories.length >= MAX_CATEGORIES) {
          rejected.push({ index, reason: 'over-capacity' });
          continue;
        }

        // A replace replaces the whole category, so the style and the range of the old
        // one are gone and the default takes the place of a field the new one drops.
        const description = record['description'];
        const category: Category =
          typeof description === 'string'
            ? { name, color, description, markerStyle, maxDrawRange }
            : { name, color, markerStyle, maxDrawRange };

        if (existing === undefined) {
          // The row tables the sweep reads follow the table itself. A row is on unless
          // the user already turned that name off, which a replacement keeps.
          rowVisible[categories.length] = categoryVisible.get(name) === false ? 0 : 1;
          rowRange[categories.length] = maxDrawRange;
          categoryOf.set(name, categories.length);
          categories.push(category);
          added += 1;
        } else {
          // A category replaced under the same name keeps its row and may name another
          // range, which changes the range of every record that names it.
          rowRange[existing] = maxDrawRange;
          // The replacement keeps the index, because the set holds one category index
          // per system and an index that moved would recolour another category.
          categories[existing] = category;
          replaced += 1;
        }
      }

      if (added > 0 || replaced > 0) {
        categoryVersion += 1;
        categoryTableVersion += 1;
      }
      return { added, replaced, rejected };
    },

    addSystems(records: readonly SystemRecordInput[]): AddReport {
      const rejected: Reject[] = [];
      let added = 0;
      let replaced = 0;

      for (let index = 0; index < records.length; index += 1) {
        const source = records[index];
        if (typeof source !== 'object' || source === null) {
          rejected.push({ index, reason: 'no-name' });
          continue;
        }
        const record = source as Record<string, unknown>;

        const name = readName(record['name']);
        if (name === null) {
          rejected.push({ index, reason: 'no-name' });
          continue;
        }

        const coords = record['coords'];
        if (typeof coords !== 'object' || coords === null) {
          rejected.push({ index, reason: 'no-coords' });
          continue;
        }
        const point = coords as Record<string, unknown>;
        const x = readFinite(point['x']);
        const y = readFinite(point['y']);
        const z = readFinite(point['z']);
        if (x === null || y === null || z === null) {
          rejected.push({ index, reason: 'no-coords' });
          continue;
        }
        if (!insideBounds(x, y, z)) {
          rejected.push({ index, reason: 'out-of-bounds' });
          continue;
        }

        // An optional field of the wrong type is dropped, so a `categories` that is not
        // an array leaves the record naming none. An entry the table does not hold
        // rejects the record instead, so a misspelt name shows in the report rather
        // than as a system with no colour behind it.
        const categorySource = record['categories'];
        const named: string[] = [];
        let unknownCategory = false;
        if (Array.isArray(categorySource)) {
          for (const entry of categorySource) {
            if (typeof entry !== 'string' || !categoryOf.has(entry)) {
              unknownCategory = true;
              break;
            }
            if (named.includes(entry)) continue;
            named.push(entry);
          }
        }
        if (unknownCategory) {
          rejected.push({ index, reason: 'unknown-category' });
          continue;
        }
        // A record that names none is taken while the table is empty and refused while
        // it holds a category, which is the other half of the all-or-nothing rule.
        if (named.length === 0 && categories.length > 0) {
          rejected.push({ index, reason: 'no-category' });
          continue;
        }

        const id64 = readId64(record['id64']);
        // The identity is the `id64` when the record has one, and the name when it has
        // none, so the same system twice replaces rather than adds.
        const identity = id64 === null ? `name:${name}` : `id64:${id64}`;
        const slot = slotOf.get(identity);
        if (slot === undefined && systems.length >= MAX_SYSTEMS) {
          rejected.push({ index, reason: 'over-capacity' });
          continue;
        }

        // The icons come last, so a record that is faulty in an earlier field reports
        // that earlier reason. A bad icon rejects the record where a bad image is
        // dropped: an icon list is a short list a host writes by hand, so a misspelt
        // symbol is a mistake to report and not a value to guess at.
        const icons = readIcons(record['icons'], safeImageUrl);
        if (typeof icons === 'string') {
          rejected.push({ index, reason: icons });
          continue;
        }

        const system: MutableSystem = {
          name,
          position: [x, y, z],
          categories: named,
        };
        if (id64 !== null) system.id64 = id64;
        for (const field of TEXT_FIELDS) {
          const value = record[field];
          if (typeof value === 'string') system[field] = value;
        }
        for (const field of NUMBER_FIELDS) {
          const value = readFinite(record[field]);
          if (value !== null) system[field] = value;
        }
        const images = readImages(record['images']);
        if (images !== null) system.images = images;
        if (named.length === 0) {
          // A replacement raises it again, as the icon count rises, so the counter needs
          // no sweep of the set. Only a clear resets it.
          uncategorisedSystems += 1;
        }
        if (icons.length > 0) system.icons = icons;

        let at: number;
        if (slot === undefined) {
          at = systems.length;
          slotOf.set(identity, at);
          writeSystem(at, system);
          added += 1;
        } else {
          at = slot;
          writeSystem(slot, system);
          replaced += 1;
        }
        // The list keeps the slot after the write, because a new record takes its slot
        // here. A record that loses its icons leaves the entry: the interface states why
        // that direction is the safe one.
        if (icons.length > 0) noteIconSystem(at);
      }

      if (added > 0 || replaced > 0) version += 1;
      return { added, replaced, rejected };
    },

    clearSystems(): void {
      systems.length = 0;
      foldedNames.length = 0;
      catRowCount = 0;
      catCount.fill(0);
      catRoom.fill(0);
      slotOf.clear();
      iconIndexCount = 0;
      iconFlags.fill(0);
      iconCount.fill(0);
      iconRoom.fill(0);
      iconVectors.length = 0;
      iconVectorCount = 0;
      uncategorisedSystems = 0;
      boxEmpty = true;
      version += 1;
    },

    clearSystemsAndCategories(): void {
      systems.length = 0;
      foldedNames.length = 0;
      catRowCount = 0;
      catCount.fill(0);
      catRoom.fill(0);
      slotOf.clear();
      iconIndexCount = 0;
      iconFlags.fill(0);
      iconCount.fill(0);
      iconRoom.fill(0);
      iconVectors.length = 0;
      iconVectorCount = 0;
      uncategorisedSystems = 0;
      boxEmpty = true;
      categories.length = 0;
      categoryOf.clear();
      categoryVisible.clear();
      rowVisible.fill(1);
      rowRange.fill(DEFAULT_MAX_DRAW_RANGE_LY);
      version += 1;
      categoryVersion += 1;
      categoryTableVersion += 1;
    },

    get count(): number {
      return systems.length;
    },
    get iconSystemCount(): number {
      return iconIndexCount;
    },
    get iconIndices(): Int32Array {
      return iconIndices.subarray(0, iconIndexCount);
    },
    get iconIndexCount(): number {
      return iconIndexCount;
    },
    get iconStarts(): Int32Array {
      return iconStart.subarray(0, systems.length);
    },
    get iconCounts(): Uint8Array {
      return iconCount.subarray(0, systems.length);
    },
    get iconVectors(): readonly ResolvedIcon[] {
      return iconVectors;
    },
    get systemBox(): SystemBox {
      return {
        min: [boxMin[0], boxMin[1], boxMin[2]],
        max: [boxMax[0], boxMax[1], boxMax[2]],
        empty: boxEmpty,
      };
    },
    get categoryCount(): number {
      return categories.length;
    },
    get version(): number {
      return version;
    },
    get categoryVersion(): number {
      return categoryVersion;
    },
    get categoryTableVersion(): number {
      return categoryTableVersion;
    },
    get positions(): Float64Array {
      return positions.subarray(0, systems.length * 3);
    },
    get categoryIndices(): Uint16Array {
      refreshFlags();
      return categoryIndices.subarray(0, systems.length);
    },
    get markerFlags(): Uint8Array {
      refreshFlags();
      return markerFlags.subarray(0, systems.length);
    },
    get drawRanges(): Float32Array {
      refreshFlags();
      return drawRanges.subarray(0, systems.length);
    },
    get lastSweepMs(): number {
      return lastSweepMs;
    },
    get categoryRowCount(): number {
      return catRowCount;
    },
    drawsMarker(index: number): boolean {
      if (index < 0 || index >= systems.length) return false;
      refreshFlags();
      return markerFlags[index] === 1;
    },
    setCategoryVisible(name: string, visible: boolean): void {
      // A name the table does not hold changes nothing and does not throw, so a host
      // that lists categories from its own data cannot break the map with a typo.
      if (!categoryOf.has(name)) return;
      if ((categoryVisible.get(name) !== false) === visible) return;
      categoryVisible.set(name, visible);
      rowVisible[categoryOf.get(name) as number] = visible ? 1 : 0;
      categoryVersion += 1;
    },
    isCategoryVisible(name: string): boolean {
      if (!categoryOf.has(name)) return false;
      return categoryVisible.get(name) !== false;
    },
    setNameFilter(text: string): void {
      const next = typeof text === 'string' ? text : '';
      if (next === nameFilter) return;
      nameFilter = next;
      nameFilterFold = next.toLowerCase();
      categoryVersion += 1;
    },
    getNameFilter(): string {
      return nameFilter;
    },
    system(index: number): RealSystem | null {
      return systems[index] ?? null;
    },
    category(index: number): Category | null {
      const row = categories[index];
      if (row !== undefined) return row;
      // A set with no category holds one internal row, so every reader of
      // `categoryIndices` finds a colour, a style and a draw range. The row is not in
      // the table, and the handle's `getCategory` is the one reader that hides it.
      if (categories.length === 0 && index === UNCATEGORISED_INDEX) {
        return UNCATEGORISED_CATEGORY;
      }
      return null;
    },
    categoryIndex(name: string): number {
      return categoryOf.get(name) ?? -1;
    },
    indexOfIdentity(identity: string): number {
      // A record with an `id64` is held under it, so the `id64` is read first. A record
      // without one is held under its name.
      return slotOf.get(`id64:${identity}`) ?? slotOf.get(`name:${identity}`) ?? -1;
    },
  };
}
