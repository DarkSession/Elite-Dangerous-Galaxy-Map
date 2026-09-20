// The shape set: the spheres and the lines the host gives the map. A shape is drawn and
// is never picked. This module owns the shape of a sphere record and a line record:
// nothing else reads a raw one. Nothing here knows about WebGL.
//
// A shape may name categories of the table `real-systems` holds, and it then follows the
// rule a marker follows: it draws while any category it names is on, and it takes the
// colour of the first category it names that is on. A category holds one visibility flag
// for its markers, which the system set owns, and one for its shapes, which this set
// owns. The set works out what draws in a sweep that runs on a change of the set, the
// table, a category's shape visibility or the name filter, and never per frame.

/** The largest number of spheres the set holds. */
export const MAX_SPHERES = 1024;

/**
 * The largest number of lines the set holds.
 *
 * The UIA demo set draws one line for each hyperdiction pair the Canonn report file holds,
 * which came to 983 lines when the set was built, and that file grows with every report.
 * The cost of the bound is the segment buffer of the pass, which holds
 * `MAX_LINE_POINTS + MAX_LINES` segments, so 4,096 costs 4.6 per cent more than 1,024.
 */
export const MAX_LINES = 4096;

/** The largest number of points the lines of the set hold together. */
export const MAX_LINE_POINTS = 65536;

/** The opacity a sphere takes when it names none. */
export const DEFAULT_SPHERE_OPACITY = 0.18;

/** The width a line takes when it names none, in CSS pixels. */
export const DEFAULT_LINE_WIDTH_CSS = 2;

/** The widest a line draws, in CSS pixels. */
export const MAX_LINE_WIDTH_CSS = 16;

/** One point of a line: a game coordinate, or the identity of a system. */
export type LinePoint = readonly [number, number, number] | { readonly system: string };

/**
 * What a host passes to `addSpheres`. The type states the contract and the reader holds
 * it: every field is still checked at run time, because the data comes from a file or a
 * network call the compiler does not see.
 *
 * The index signature lets a record carry fields the reader drops.
 */
export interface SphereInput {
  /** The centre in game coordinates, in light years. */
  readonly position: readonly [number, number, number];
  /** The radius in light years. It is above 0. */
  readonly radius: number;
  /**
   * Red, green and blue, each from 0 to 255. A sphere that names a category may leave it
   * out and take the colour of the first category it names that is on.
   */
  readonly color?: readonly [number, number, number];
  /** How deep the shell reads at its middle. The default is 0.18. */
  readonly opacity?: number;
  /** What the shape stands for. The map draws no label for it. */
  readonly name?: string;
  /**
   * The names of categories the table holds, in the order the sphere reads them. The
   * first one that is on for shapes gives the colour, where the sphere carries none.
   */
  readonly categories?: readonly string[];
  /**
   * The two names `categories` replaces. Each one is `never`, so a shape that carries it
   * fails the compile. The index signature below turns off TypeScript's excess-property
   * check, so without the pair the old name would compile and the reader would drop it.
   */
  readonly primaryCategory?: never;
  readonly secondaryCategories?: never;
  /** A field the reader drops. */
  readonly [field: string]: unknown;
}

/** One sphere the set holds. */
export interface Sphere {
  readonly position: readonly [number, number, number];
  readonly radius: number;
  /** The sphere's own colour, absent where it takes the colour of a category. */
  readonly color?: readonly [number, number, number];
  readonly opacity: number;
  readonly name?: string;
  /** The categories the sphere names, in order and without a repeat. */
  readonly categories?: readonly string[];
}

/** What a host passes to `addLines`. */
export interface LineInput {
  /** At least two points, each a coordinate or a system reference. */
  readonly points: readonly LinePoint[];
  /**
   * Red, green and blue, each from 0 to 255. A line that names a category may leave it
   * out and take the colour of the first category it names that is on.
   */
  readonly color?: readonly [number, number, number];
  /** How wide the ribbon draws, in CSS pixels. The default is 2. */
  readonly width?: number;
  /** True joins the last point to the first. The default is false. */
  readonly closed?: boolean;
  /** What the shape stands for. The map draws no label for it. */
  readonly name?: string;
  /**
   * The names of categories the table holds, in the order the line reads them. The first
   * one that is on for shapes gives the colour, where the line carries none.
   */
  readonly categories?: readonly string[];
  /**
   * The two names `categories` replaces. Each one is `never`, so a shape that carries it
   * fails the compile. The index signature below turns off TypeScript's excess-property
   * check, so without the pair the old name would compile and the reader would drop it.
   */
  readonly primaryCategory?: never;
  readonly secondaryCategories?: never;
  /** A field the reader drops. */
  readonly [field: string]: unknown;
}

/** One line the set holds. Its points are resolved game coordinates. */
export interface Line {
  readonly points: readonly (readonly [number, number, number])[];
  /** The line's own colour, absent where it takes the colour of a category. */
  readonly color?: readonly [number, number, number];
  readonly width: number;
  readonly closed: boolean;
  readonly name?: string;
  /** The categories the line names, in order and without a repeat. */
  readonly categories?: readonly string[];
}

/** The two kinds of shape the set holds. */
export type ShapeKind = 'sphere' | 'line';

/** One shape without its geometry, which a caller that lists the set reads. */
export interface ShapeInfo {
  /** The shape's name, absent where it carries none. */
  readonly name?: string;
  /** The names the reader kept, in order, and empty where the shape names none. */
  readonly categories: readonly string[];
  /** The sphere's centre, or the middle of the line's bounding box. */
  readonly centre: readonly [number, number, number];
  /** The sphere's radius, or half the diagonal of that box. */
  readonly reach: number;
  /** True while the shape draws in the next frame. */
  readonly drawn: boolean;
}

/** Why the reader rejected a shape. */
export type ShapeRejectReason =
  | 'bad-position'
  | 'bad-radius'
  | 'bad-color'
  | 'bad-opacity'
  | 'bad-width'
  | 'bad-points'
  | 'bad-point'
  | 'bad-category'
  | 'unknown-system'
  | 'unknown-category'
  | 'over-capacity'
  | 'over-point-capacity';

/** One shape the reader rejected. */
export interface ShapeReject {
  /** Where the shape sat in the call. */
  readonly index: number;
  readonly reason: ShapeRejectReason;
}

/** What `addSpheres` and `addLines` give back. */
export interface ShapeReport {
  readonly added: number;
  readonly rejected: ShapeReject[];
}

/**
 * Where a system reference points. The shape set reads it when a line is added, so a
 * later change to the system set does not move a line that is already in.
 */
export type SystemLookup = (
  identity: string,
) => readonly [number, number, number] | null;

/**
 * What the shape set reads of the category table. The system set holds the one table, and
 * these are the members the sweep needs, so the set takes the table as it is and the two
 * never hold two tables between them.
 *
 * The table carries the names, the order and the colours. It carries no visibility: a
 * category holds one flag for its markers and one for its shapes, and the shape set owns
 * the shape flag itself. The set therefore watches `categoryTableVersion`, which rises
 * only where the table itself changes, and a switch of the markers sweeps no shape.
 */
export interface ShapeCategoryTable {
  /** How many categories the table holds. */
  readonly categoryCount: number;
  /** Rises on every change to the table itself, and on no change of a visibility. */
  readonly categoryTableVersion: number;
  /** One category of the table, or null outside it. */
  category(index: number): {
    readonly name: string;
    readonly color: readonly [number, number, number];
  } | null;
  /** The table index of a category name, or -1 when the table does not hold it. */
  categoryIndex(name: string): number;
}

/** The table a set built with no table reads. It holds no category. */
const NO_CATEGORIES: ShapeCategoryTable = {
  categoryCount: 0,
  categoryTableVersion: 0,
  category: () => null,
  categoryIndex: () => -1,
};

/** The spheres and the lines, which the host fills through the handle. */
export interface ShapeSet {
  /** Reads spheres into the set and reports what it did. */
  addSpheres(spheres: readonly SphereInput[]): ShapeReport;
  /** Reads lines into the set and reports what it did. */
  addLines(lines: readonly LineInput[]): ShapeReport;
  /** Empties both lists. */
  clearShapes(): void;
  /** How many spheres the set holds. */
  readonly sphereCount: number;
  /** How many lines the set holds. */
  readonly lineCount: number;
  /** How many points the lines of the set hold together. */
  readonly linePointCount: number;
  /** Rises on every change to the set, and on a sweep that moves a flag or a colour. */
  readonly version: number;
  /** The spheres, in the order they were added. The renderer reads them. */
  readonly spheres: readonly Sphere[];
  /** The lines, in the order they were added. The renderer reads them. */
  readonly lines: readonly Line[];
  /**
   * One byte per sphere, in the order they were added: 1 when the sphere draws and 0 when
   * the category switch or the name filter cuts it. The shape pass reads it, as the marker
   * pass reads `markerFlags`, so the pass holds no rule of its own about a category.
   */
  readonly sphereFlags: Uint8Array;
  /** The same one byte per line. */
  readonly lineFlags: Uint8Array;
  /**
   * Three numbers per sphere, each from 0 to 255: the colour the sphere draws in. It is
   * the sphere's own colour, or the colour of the first category it names that is on.
   */
  readonly sphereColors: Float32Array;
  /** The same three numbers per line. */
  readonly lineColors: Float32Array;
  /**
   * How long the last sweep of the flags took, in milliseconds. A browser test reads it
   * through the handle to hold the sweep to its budget.
   */
  readonly lastSweepMs: number;
  /** How many sweeps the set has run. A test reads it to hold the sweep off the frame. */
  readonly sweepCount: number;
  /** One sphere as a copy, or null outside the set. */
  getSphere(index: number): Sphere | null;
  /** One line as a copy, or null outside the set. */
  getLine(index: number): Line | null;
  /** One shape without its geometry, or null outside the set. */
  getShapeInfo(kind: ShapeKind, index: number): ShapeInfo | null;
  /**
   * Turns the shapes of a category on or off. It reaches no marker: the system set holds
   * the marker flag of the same category. A name the table does not hold changes nothing
   * and does not throw.
   */
  setCategoryVisible(name: string, visible: boolean): void;
  /** True when the shapes of a category draw. False for a name the table lacks. */
  isCategoryVisible(name: string): boolean;
  /** Keeps the shapes whose name holds the text, compared without case. */
  setShapeNameFilter(text: string): void;
  /** Reads the filter text. */
  getShapeNameFilter(): string;
  /** Empties the set and releases what it holds. */
  dispose(): void;
}

/** Three finite numbers, or null. */
function readPoint(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: number[] = [];
  for (const part of value) {
    if (typeof part !== 'number' || !Number.isFinite(part)) return null;
    parts.push(part);
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** Three finite numbers from 0 to 255, or null. */
function readColor(value: unknown): [number, number, number] | null {
  const parts = readPoint(value);
  if (parts === null) return null;
  for (const part of parts) {
    if (part < 0 || part > 255) return null;
  }
  return parts;
}

/** A string of at least one character, or null. */
function readName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}

/**
 * The opacity of a sphere record. It gives the default when the field is absent and
 * `null` on a value that is not a finite number above 0 and at most 1.
 */
function readOpacity(value: unknown): number | null {
  if (value === undefined) return DEFAULT_SPHERE_OPACITY;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 1) return null;
  return value;
}

/**
 * The width of a line record, in CSS pixels. It gives the default when the field is
 * absent and `null` on a value that is not a finite number above 0 and at most 16.
 */
function readWidth(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LINE_WIDTH_CSS;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_LINE_WIDTH_CSS) return null;
  return value;
}

/** The identity a line point names, or null when the point is not a reference. */
function readSystemReference(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const named = (value as { readonly system?: unknown }).system;
  return readName(named);
}

/** What one shape carries for the sweep, beside the fields the host reads back. */
interface ShapeState {
  /** The table indices of the categories the shape names, in the shape's own order. */
  readonly categoryIndices: readonly number[];
  /** The shape's own colour, or null where it takes the colour of a category. */
  readonly color: readonly [number, number, number] | null;
  /** The name folded to lower case, or null where the shape carries none. */
  readonly nameFold: string | null;
}

/** How many categories one shape names before the store grows its list. */
const CATEGORIES_PER_SHAPE = 4;

/**
 * The state of one list of shapes, held flat. The sweep reads typed arrays and one string
 * array, and no object per shape, because it runs over 5,120 shapes in under a
 * millisecond and an object load per shape is the cost that bound does not hold.
 */
interface ShapeStore {
  /** One byte per shape: 1 when it draws. */
  readonly flags: Uint8Array;
  /** Three numbers per shape, each from 0 to 255: the colour it draws in. */
  readonly colors: Float32Array;
  /** Takes the state of one more shape. */
  push(state: ShapeState): void;
  /** Drops every shape. */
  clear(): void;
  /**
   * Writes the flag and the colour of every shape, and gives back whether it moved one of
   * them. `visible` and `categoryColors` hold the table by index, and `filterFold` is the
   * name filter folded to lower case.
   */
  sweep(visible: Uint8Array, categoryColors: Float32Array, filterFold: string): boolean;
}

/** Builds the store of one list of shapes, at the capacity that list holds. */
function createShapeStore(capacity: number): ShapeStore {
  const flags = new Uint8Array(capacity);
  const colors = new Float32Array(capacity * 3);
  // The table indices of every shape, one list after another. `start` and `named` cut it
  // into the list of one shape.
  let categoryIndices = new Int32Array(capacity * CATEGORIES_PER_SHAPE);
  const start = new Int32Array(capacity);
  const named = new Int32Array(capacity);
  // The colour a shape carries of its own, and 1 where it carries one.
  const ownColors = new Float32Array(capacity * 3);
  const ownFlags = new Uint8Array(capacity);
  // The folded name of each shape, which the sweep reads under a filter alone.
  const nameFolds: (string | null)[] = [];
  let count = 0;
  let used = 0;

  return {
    flags,
    colors,

    push(state: ShapeState): void {
      const list = state.categoryIndices;
      if (used + list.length > categoryIndices.length) {
        const grown = new Int32Array(
          Math.max(categoryIndices.length * 2, used + list.length),
        );
        grown.set(categoryIndices);
        categoryIndices = grown;
      }
      start[count] = used;
      named[count] = list.length;
      for (let step = 0; step < list.length; step += 1) {
        categoryIndices[used + step] = list[step] as number;
      }
      used += list.length;
      const own = state.color;
      ownFlags[count] = own === null ? 0 : 1;
      if (own !== null) {
        ownColors[count * 3] = own[0];
        ownColors[count * 3 + 1] = own[1];
        ownColors[count * 3 + 2] = own[2];
      }
      nameFolds[count] = state.nameFold;
      count += 1;
    },

    clear(): void {
      count = 0;
      used = 0;
      nameFolds.length = 0;
    },

    sweep(
      visible: Uint8Array,
      categoryColors: Float32Array,
      filterFold: string,
    ): boolean {
      let changed = false;
      const filtering = filterFold.length > 0;
      for (let index = 0; index < count; index += 1) {
        const first = start[index] as number;
        const held = named[index] as number;
        let chosen = -1;
        for (let step = 0; step < held; step += 1) {
          const category = categoryIndices[first + step] as number;
          if (visible[category] === 1) {
            chosen = category;
            break;
          }
        }
        // A shape draws while any category it names is on, and a shape that names none
        // always draws. The filter is the second cut, over the shapes the first one kept.
        let drawn = held === 0 || chosen >= 0 ? 1 : 0;
        if (drawn === 1 && filtering) {
          const fold = nameFolds[index];
          if (fold === null || fold === undefined || !fold.includes(filterFold)) {
            drawn = 0;
          }
        }
        if (flags[index] !== drawn) {
          flags[index] = drawn;
          changed = true;
        }
        // A shape with a colour of its own keeps it, whatever its categories hold. A
        // shape with every category off draws nothing, so the colour it holds never
        // reaches the frame: it keeps the colour of the first category it names, which
        // is always a row of the table.
        const base = index * 3;
        let red = 0;
        let green = 0;
        let blue = 0;
        if (ownFlags[index] === 1) {
          red = ownColors[base] as number;
          green = ownColors[base + 1] as number;
          blue = ownColors[base + 2] as number;
        } else if (held > 0) {
          const source = chosen >= 0 ? chosen : (categoryIndices[first] as number);
          red = categoryColors[source * 3] as number;
          green = categoryColors[source * 3 + 1] as number;
          blue = categoryColors[source * 3 + 2] as number;
        }
        if (
          colors[base] !== red ||
          colors[base + 1] !== green ||
          colors[base + 2] !== blue
        ) {
          colors[base] = red;
          colors[base + 1] = green;
          colors[base + 2] = blue;
          changed = true;
        }
      }
      return changed;
    },
  };
}

/**
 * The category fields of one shape, read against the table. The two lists hold the same
 * categories in the same order: the names are what the host reads back and the indices
 * are what the sweep reads, so neither reader converts.
 */
interface ShapeCategoryFields {
  /** The names the shape gave, in its own order and without a repeat. */
  readonly categoryNames: string[];
  /** The table index of each of those names. */
  readonly categoryIndices: number[];
}

/**
 * The category field the host reads back. A shape that names no category carries none,
 * so `getSphere` and `getLine` give back what the shape gave.
 */
function categoryFields(named: ShapeCategoryFields): {
  readonly categories?: readonly string[];
} {
  if (named.categoryNames.length === 0) return {};
  return { categories: named.categoryNames };
}

/** The state the sweep reads for one shape. */
function stateOf(
  color: readonly [number, number, number] | null,
  name: string | null,
  named: ShapeCategoryFields,
): ShapeState {
  return {
    categoryIndices: named.categoryIndices,
    color,
    // The fold is taken once, so a sweep under a filter costs no case fold per shape.
    nameFold: name === null ? null : name.toLowerCase(),
  };
}

/**
 * Builds the shape set. `findSystem` reads a system identity, which is the `id64` as a
 * string or the name compared without case, and gives that system's position back. The
 * set reads it while `addLines` runs and never again, so a line holds the position the
 * system had when the line went in.
 *
 * `table` is the category table the shapes name. A set built without one holds no
 * category, so every shape that names one is rejected with `unknown-category`.
 */
export function createShapeSet(
  findSystem: SystemLookup,
  table: ShapeCategoryTable = NO_CATEGORIES,
): ShapeSet {
  let spheres: Sphere[] = [];
  let lines: Line[] = [];
  let linePointCount = 0;
  let version = 0;
  // What the sweep reads. `version` rises with it and with the sweep, so a reader of
  // `version` cannot say whether the shapes themselves changed: the sweep compares this
  // one instead.
  let contentVersion = 0;

  // The filter text, and the same text folded to lower case once. The comparison folds
  // both sides to lower case, so it reads the same in every browser.
  let nameFilter = '';
  let nameFilterFold = '';

  // What the user chose to see of the shapes, by category name. A category is on for its
  // shapes when the table takes it, and a replacement under the same name keeps the
  // choice, as the marker flag of the system set does. The version rises with the map, so
  // the sweep reads one number rather than walking the map.
  let shapeVisible = new Map<string, boolean>();
  let shapeVisibleVersion = 0;

  // One byte per shape: 1 when it draws. Three numbers per shape: the colour it draws in.
  // The sweep writes them and the pass reads them, so the pass holds no rule of its own.
  const sphereStore = createShapeStore(MAX_SPHERES);
  const lineStore = createShapeStore(MAX_LINES);
  // What the last sweep read: the content, the table, the shape visibility and the
  // filter. The sweep runs when one of the four has moved and not once per frame.
  let sweptContentVersion = -1;
  let sweptTableVersion = -1;
  let sweptVisibleVersion = -1;
  let sweptFilter: string | null = null;
  let lastSweepMs = 0;
  let sweepCount = 0;
  // The visibility and the colour of each category, read once per sweep. The table holds
  // at most 256 categories and the set holds up to 5,120 shapes naming 4 each, so one
  // read of the table per category costs far less than one per name of a shape.
  let categoryVisible = new Uint8Array(0);
  let categoryColors = new Float32Array(0);

  /**
   * Reads the category fields of one shape against the table, or gives the reason the
   * reader dropped it. A shape that names no category comes back with an empty list.
   */
  const readCategories = (
    input: SphereInput | LineInput,
  ): ShapeCategoryFields | ShapeRejectReason => {
    const categoryNames: string[] = [];
    const categoryIndices: number[] = [];
    const given = input.categories;
    // A `categories` that is not an array is dropped, as every optional field of the
    // wrong type is dropped, and the shape then names none.
    if (Array.isArray(given)) {
      for (const entry of given) {
        // An entry that is not a string of at least one character is a fault in the
        // call, and one the table does not hold is a fault in the data. Each one has its
        // own reason, so the host reads which of the two it made.
        const name = readName(entry);
        if (name === null) return 'bad-category';
        const found = table.categoryIndex(name);
        if (found < 0) return 'unknown-category';
        if (categoryNames.includes(name)) continue;
        categoryNames.push(name);
        categoryIndices.push(found);
      }
    }
    return { categoryNames, categoryIndices };
  };

  /**
   * Reads the colour of one shape. A shape that names a category may carry none and take
   * the colour of the first category it names that is on. A shape that names no category
   * has no colour to take, so it needs one of its own.
   */
  const readShapeColor = (
    value: unknown,
    hasCategory: boolean,
  ): [number, number, number] | null | 'bad-color' => {
    if (value === undefined) return hasCategory ? null : 'bad-color';
    const color = readColor(value);
    return color === null ? 'bad-color' : color;
  };

  /** One shape the reader kept, with the state the sweep reads. */
  interface ReadShape<T> {
    readonly shape: T;
    readonly state: ShapeState;
  }

  /** Reads one sphere, or gives the reason the reader dropped it. */
  const readSphere = (input: SphereInput): ReadShape<Sphere> | ShapeRejectReason => {
    const position = readPoint(input.position);
    if (position === null) return 'bad-position';
    const radius = input.radius;
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
      return 'bad-radius';
    }
    const named = readCategories(input);
    if (typeof named === 'string') return named;
    const color = readShapeColor(input.color, named.categoryNames.length > 0);
    if (color === 'bad-color') return 'bad-color';
    const opacity = readOpacity(input.opacity);
    if (opacity === null) return 'bad-opacity';
    // A `name` that is not a string of at least one character is dropped, and the shape
    // is still read. The name carries no meaning to the map, which draws no label for a
    // shape, so a bad one is not a reason to lose the picture.
    const name = readName(input.name);
    const sphere: Sphere = {
      position,
      radius,
      opacity,
      ...(color === null ? {} : { color }),
      ...(name === null ? {} : { name }),
      ...categoryFields(named),
    };
    return { shape: sphere, state: stateOf(color, name, named) };
  };

  /** Reads one line, or gives the reason the reader dropped it. */
  const readLine = (input: LineInput): ReadShape<Line> | ShapeRejectReason => {
    const given = input.points;
    if (!Array.isArray(given) || given.length < 2) return 'bad-points';
    const points: [number, number, number][] = [];
    for (const entry of given) {
      const coordinate = readPoint(entry);
      if (coordinate !== null) {
        points.push(coordinate);
        continue;
      }
      const identity = readSystemReference(entry);
      // An entry that is neither form is a fault in the call. A reference the system set
      // does not hold is a fault in the data, and each one has its own reason.
      if (identity === null) return 'bad-point';
      const found = findSystem(identity);
      // A route that has lost a waypoint is wrong and not shorter, so the whole line goes.
      if (found === null) return 'unknown-system';
      points.push([found[0], found[1], found[2]]);
    }
    const named = readCategories(input);
    if (typeof named === 'string') return named;
    const color = readShapeColor(input.color, named.categoryNames.length > 0);
    if (color === 'bad-color') return 'bad-color';
    const width = readWidth(input.width);
    if (width === null) return 'bad-width';
    // `closed` carries no reject reason, so a value that is not a boolean reads as the
    // default. The field says how to draw the line and not what the line is.
    const closed = input.closed === true;
    const name = readName(input.name);
    const line: Line = {
      points,
      width,
      closed,
      ...(color === null ? {} : { color }),
      ...(name === null ? {} : { name }),
      ...categoryFields(named),
    };
    return { shape: line, state: stateOf(color, name, named) };
  };

  /**
   * Works out which shapes draw and in which colour. It runs on a change of the set, the
   * category table, a category's shape visibility or the name filter, and never per
   * frame: the four readings below say when an input moved. A switch of the marker flag
   * of a category moves none of the four, so it sweeps no shape.
   */
  const refreshFlags = (): void => {
    const tableVersion = table.categoryTableVersion;
    if (
      sweptContentVersion === contentVersion &&
      sweptTableVersion === tableVersion &&
      sweptVisibleVersion === shapeVisibleVersion &&
      sweptFilter === nameFilterFold
    ) {
      return;
    }
    const startMs = performance.now();
    const count = table.categoryCount;
    if (categoryVisible.length < count) {
      categoryVisible = new Uint8Array(count);
      categoryColors = new Float32Array(count * 3);
    }
    for (let index = 0; index < count; index += 1) {
      const category = table.category(index);
      if (category === null) continue;
      categoryVisible[index] = shapeVisible.get(category.name) === false ? 0 : 1;
      categoryColors[index * 3] = category.color[0];
      categoryColors[index * 3 + 1] = category.color[1];
      categoryColors[index * 3 + 2] = category.color[2];
    }
    const movedSpheres = sphereStore.sweep(
      categoryVisible,
      categoryColors,
      nameFilterFold,
    );
    const movedLines = lineStore.sweep(categoryVisible, categoryColors, nameFilterFold);
    sweptContentVersion = contentVersion;
    sweptTableVersion = tableVersion;
    sweptVisibleVersion = shapeVisibleVersion;
    sweptFilter = nameFilterFold;
    sweepCount += 1;
    lastSweepMs = performance.now() - startMs;
    // The pass rebuilds its instance buffers on the version it already watches, so a
    // switch that hides a shape reaches the next frame through the same counter as an
    // added shape.
    if (movedSpheres || movedLines) version += 1;
  };

  /** The middle of a line's bounding box, and half the diagonal of that box. */
  const lineReach = (
    line: Line,
  ): { centre: [number, number, number]; reach: number } => {
    const min: [number, number, number] = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    const max: [number, number, number] = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const point of line.points) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = point[axis] as number;
        if (value < (min[axis] as number)) min[axis] = value;
        if (value > (max[axis] as number)) max[axis] = value;
      }
    }
    const size: [number, number, number] = [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
    ];
    return {
      centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      reach: Math.sqrt(size[0] * size[0] + size[1] * size[1] + size[2] * size[2]) / 2,
    };
  };

  /** One shape without its geometry. */
  const infoOf = (shape: Sphere | Line, drawn: boolean): ShapeInfo => {
    const placed =
      'radius' in shape
        ? {
            centre: [...shape.position] as [number, number, number],
            reach: shape.radius,
          }
        : lineReach(shape);
    return {
      ...(shape.name === undefined ? {} : { name: shape.name }),
      categories: [...(shape.categories ?? [])],
      centre: placed.centre,
      reach: placed.reach,
      drawn,
    };
  };

  return {
    addSpheres(input: readonly SphereInput[]): ShapeReport {
      const rejected: ShapeReject[] = [];
      let added = 0;
      for (let index = 0; index < input.length; index += 1) {
        const read = readSphere(input[index] as SphereInput);
        if (typeof read === 'string') {
          rejected.push({ index, reason: read });
          continue;
        }
        // The capacity is read after the fields, so an entry that is both bad and past
        // the cap reports its own fault and the host can fix it.
        if (spheres.length >= MAX_SPHERES) {
          rejected.push({ index, reason: 'over-capacity' });
          continue;
        }
        spheres.push(read.shape);
        sphereStore.push(read.state);
        added += 1;
      }
      if (added > 0) {
        version += 1;
        contentVersion += 1;
      }
      return { added, rejected };
    },

    addLines(input: readonly LineInput[]): ShapeReport {
      const rejected: ShapeReject[] = [];
      let added = 0;
      for (let index = 0; index < input.length; index += 1) {
        const read = readLine(input[index] as LineInput);
        if (typeof read === 'string') {
          rejected.push({ index, reason: read });
          continue;
        }
        if (lines.length >= MAX_LINES) {
          rejected.push({ index, reason: 'over-capacity' });
          continue;
        }
        // A line goes in whole or not at all, so the point capacity is read against the
        // whole line and a line that would cross it is dropped.
        if (linePointCount + read.shape.points.length > MAX_LINE_POINTS) {
          rejected.push({ index, reason: 'over-point-capacity' });
          continue;
        }
        lines.push(read.shape);
        lineStore.push(read.state);
        linePointCount += read.shape.points.length;
        added += 1;
      }
      if (added > 0) {
        version += 1;
        contentVersion += 1;
      }
      return { added, rejected };
    },

    clearShapes(): void {
      // The filter names shapes of the set being cleared, so it goes with them. The sweep
      // watches the filter of its own, so the clear needs no counter to carry it.
      nameFilter = '';
      nameFilterFold = '';
      // A shape flag names a category of the set being cleared, so it goes the same way.
      // Both sit above the return below, or a clear of an empty set would keep them and
      // the next set would open with a name hidden and its row's dot reading on.
      if (shapeVisible.size > 0) {
        shapeVisible = new Map<string, boolean>();
        shapeVisibleVersion += 1;
      }
      if (spheres.length === 0 && lines.length === 0) return;
      spheres = [];
      lines = [];
      sphereStore.clear();
      lineStore.clear();
      linePointCount = 0;
      version += 1;
      contentVersion += 1;
    },

    get sphereCount(): number {
      return spheres.length;
    },

    get lineCount(): number {
      return lines.length;
    },

    get linePointCount(): number {
      return linePointCount;
    },

    get version(): number {
      // The sweep runs before the reading, so a switch that hides a shape has raised the
      // counter by the time the pass compares it. The check itself is three readings and
      // the sweep runs only where one of them moved.
      refreshFlags();
      return version;
    },

    get spheres(): readonly Sphere[] {
      return spheres;
    },

    get lines(): readonly Line[] {
      return lines;
    },

    get sphereFlags(): Uint8Array {
      refreshFlags();
      return sphereStore.flags.subarray(0, spheres.length);
    },

    get lineFlags(): Uint8Array {
      refreshFlags();
      return lineStore.flags.subarray(0, lines.length);
    },

    get sphereColors(): Float32Array {
      refreshFlags();
      return sphereStore.colors.subarray(0, spheres.length * 3);
    },

    get lineColors(): Float32Array {
      refreshFlags();
      return lineStore.colors.subarray(0, lines.length * 3);
    },

    get lastSweepMs(): number {
      return lastSweepMs;
    },

    get sweepCount(): number {
      return sweepCount;
    },

    getSphere(index: number): Sphere | null {
      const found = spheres[index];
      if (found === undefined) return null;
      return {
        ...found,
        position: [found.position[0], found.position[1], found.position[2]],
        ...(found.color === undefined
          ? {}
          : { color: [found.color[0], found.color[1], found.color[2]] as const }),
        ...(found.categories === undefined
          ? {}
          : { categories: [...found.categories] }),
      };
    },

    getLine(index: number): Line | null {
      const found = lines[index];
      if (found === undefined) return null;
      return {
        ...found,
        points: found.points.map((point) => [point[0], point[1], point[2]] as const),
        ...(found.color === undefined
          ? {}
          : { color: [found.color[0], found.color[1], found.color[2]] as const }),
        ...(found.categories === undefined
          ? {}
          : { categories: [...found.categories] }),
      };
    },

    getShapeInfo(kind: ShapeKind, index: number): ShapeInfo | null {
      // A kind the set does not hold reads as no shape, as an index outside the list does.
      if (kind !== 'sphere' && kind !== 'line') return null;
      refreshFlags();
      if (kind === 'sphere') {
        const found = spheres[index];
        return found === undefined
          ? null
          : infoOf(found, sphereStore.flags[index] === 1);
      }
      const found = lines[index];
      return found === undefined ? null : infoOf(found, lineStore.flags[index] === 1);
    },

    setCategoryVisible(name: string, visible: boolean): void {
      // A name the table does not hold changes nothing and does not throw, so a host
      // that lists categories from its own data cannot break the map with a typo.
      if (table.categoryIndex(name) < 0) return;
      if ((shapeVisible.get(name) !== false) === visible) return;
      shapeVisible.set(name, visible);
      shapeVisibleVersion += 1;
    },

    isCategoryVisible(name: string): boolean {
      if (table.categoryIndex(name) < 0) return false;
      return shapeVisible.get(name) !== false;
    },

    setShapeNameFilter(text: string): void {
      const next = typeof text === 'string' ? text : '';
      if (next === nameFilter) return;
      nameFilter = next;
      nameFilterFold = next.toLowerCase();
    },

    getShapeNameFilter(): string {
      return nameFilter;
    },

    dispose(): void {
      spheres = [];
      lines = [];
      sphereStore.clear();
      lineStore.clear();
      linePointCount = 0;
      nameFilter = '';
      nameFilterFold = '';
      shapeVisible = new Map<string, boolean>();
      shapeVisibleVersion += 1;
      version += 1;
      contentVersion += 1;
    },
  };
}
