// The category table, the record reader and the set of real star systems the host
// gives the map. This module owns the shape of an EDSM or a Spansh dump record:
// nothing else reads a raw record. Nothing here knows about WebGL.
import { loadGalaxyModel } from '../galaxy-model/load';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import type { Range } from '../galaxy-model/types';

/** The largest number of systems the set holds. */
export const MAX_SYSTEMS = 10000;

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

/** Why the reader rejected a category. */
export type CategoryRejectReason =
  'no-name' | 'bad-color' | 'bad-style' | 'bad-range' | 'over-capacity';

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
  | 'over-capacity';

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

/** One real system the set holds. */
export interface RealSystem {
  readonly name: string;
  /** The position in game coordinates, in light years. */
  readonly position: readonly [number, number, number];
  /** The name of the category whose colour the marker draws. */
  readonly primaryCategory: string;
  /** The other categories the record names, without a repeat. */
  readonly secondaryCategories: readonly string[];
  /** The 64-bit system id as a decimal string. */
  readonly id64?: string;
  readonly allegiance?: string;
  readonly government?: string;
  readonly primaryEconomy?: string;
  readonly security?: string;
  readonly population?: number;
  readonly bodyCount?: number;
}

/** The category table and the system set, which the host fills through the handle. */
export interface RealSystemSet {
  /** Reads categories into the table and reports what it did. */
  addCategories(categories: readonly unknown[]): CategoryReport;
  /** Reads records into the set and reports what it did. */
  addSystems(records: readonly unknown[]): AddReport;
  /** Empties the set. */
  clearSystems(): void;
  /** Empties the set and the category table together. */
  clearSystemsAndCategories(): void;
  /** How many systems the set holds. */
  readonly count: number;
  /** How many categories the table holds. */
  readonly categoryCount: number;
  /** Rises on every change to the set. */
  readonly version: number;
  /** Rises on every change to the category table. */
  readonly categoryVersion: number;
  /** Three game coordinates per system, in the order the records were added. */
  readonly positions: Float64Array;
  /** The table index of each system's primary category, in the same order. */
  readonly categoryIndices: Uint16Array;
  /** One system, or null outside the set. */
  system(index: number): RealSystem | null;
  /** One category of the table, or null outside it. */
  category(index: number): Category | null;
  /** The table index of a category name, or -1 when the table does not hold it. */
  categoryIndex(name: string): number;
}

/** True when three finite numbers from 0 to 255 name a colour. */
function readColor(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: number[] = [];
  for (const part of value) {
    if (typeof part !== 'number' || !Number.isFinite(part)) return null;
    if (part < 0 || part > 255) return null;
    parts.push(part);
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** A string of at least one character, or null. */
function readName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
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
const TEXT_FIELDS = ['allegiance', 'government', 'primaryEconomy', 'security'] as const;

/** The record fields the reader keeps as finite numbers. */
const NUMBER_FIELDS = ['population', 'bodyCount'] as const;

/** A system while the reader builds it. */
interface MutableSystem {
  name: string;
  position: [number, number, number];
  primaryCategory: string;
  secondaryCategories: string[];
  id64?: string;
  allegiance?: string;
  government?: string;
  primaryEconomy?: string;
  security?: string;
  population?: number;
  bodyCount?: number;
}

/** Creates an empty category table and an empty system set. */
export function createSystemSet(): RealSystemSet {
  const categories: Category[] = [];
  const categoryOf = new Map<string, number>();
  let categoryVersion = 0;

  const positions = new Float64Array(MAX_SYSTEMS * 3);
  const categoryIndices = new Uint16Array(MAX_SYSTEMS);
  const systems: RealSystem[] = [];
  // The identity of each system, so a call of 10,000 records costs 10,000 map lookups
  // rather than a scan of the set for each record.
  const slotOf = new Map<string, number>();
  let version = 0;

  const writeSystem = (slot: number, system: RealSystem): void => {
    systems[slot] = system;
    positions[slot * 3] = system.position[0];
    positions[slot * 3 + 1] = system.position[1];
    positions[slot * 3 + 2] = system.position[2];
    categoryIndices[slot] = categoryOf.get(system.primaryCategory) ?? 0;
  };

  return {
    addCategories(input: readonly unknown[]): CategoryReport {
      const rejected: CategoryReject[] = [];
      let added = 0;
      let replaced = 0;

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
          categoryOf.set(name, categories.length);
          categories.push(category);
          added += 1;
        } else {
          // The replacement keeps the index, because the set holds one category index
          // per system and an index that moved would recolour another category.
          categories[existing] = category;
          replaced += 1;
        }
      }

      if (added > 0 || replaced > 0) categoryVersion += 1;
      return { added, replaced, rejected };
    },

    addSystems(records: readonly unknown[]): AddReport {
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

        const primaryCategory = readName(record['primaryCategory']);
        if (primaryCategory === null) {
          rejected.push({ index, reason: 'no-category' });
          continue;
        }
        if (!categoryOf.has(primaryCategory)) {
          rejected.push({ index, reason: 'unknown-category' });
          continue;
        }

        // An optional field of the wrong type is dropped, so a `secondaryCategories`
        // that is not an array leaves the record with no secondary category. An entry
        // the table does not hold rejects the record instead, so a misspelt name shows
        // in the report rather than as a system with no colour behind it.
        const secondarySource = record['secondaryCategories'];
        const secondaryCategories: string[] = [];
        let unknownSecondary = false;
        if (Array.isArray(secondarySource)) {
          for (const entry of secondarySource) {
            if (typeof entry !== 'string' || !categoryOf.has(entry)) {
              unknownSecondary = true;
              break;
            }
            if (entry === primaryCategory) continue;
            if (secondaryCategories.includes(entry)) continue;
            secondaryCategories.push(entry);
          }
        }
        if (unknownSecondary) {
          rejected.push({ index, reason: 'unknown-category' });
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

        const system: MutableSystem = {
          name,
          position: [x, y, z],
          primaryCategory,
          secondaryCategories,
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

        if (slot === undefined) {
          const next = systems.length;
          slotOf.set(identity, next);
          writeSystem(next, system);
          added += 1;
        } else {
          writeSystem(slot, system);
          replaced += 1;
        }
      }

      if (added > 0 || replaced > 0) version += 1;
      return { added, replaced, rejected };
    },

    clearSystems(): void {
      systems.length = 0;
      slotOf.clear();
      version += 1;
    },

    clearSystemsAndCategories(): void {
      systems.length = 0;
      slotOf.clear();
      categories.length = 0;
      categoryOf.clear();
      version += 1;
      categoryVersion += 1;
    },

    get count(): number {
      return systems.length;
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
    get positions(): Float64Array {
      return positions.subarray(0, systems.length * 3);
    },
    get categoryIndices(): Uint16Array {
      return categoryIndices.subarray(0, systems.length);
    },
    system(index: number): RealSystem | null {
      return systems[index] ?? null;
    },
    category(index: number): Category | null {
      return categories[index] ?? null;
    },
    categoryIndex(name: string): number {
      return categoryOf.get(name) ?? -1;
    },
  };
}
