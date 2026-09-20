// Finds the decoration stars a real system removes. The work runs on the CPU, because
// the CPU already has the star hash and the star pass has no room to test a list of
// systems per vertex. Nothing here knows about WebGL.
//
// The result of one boxel depends on the boxel's grid index, its size class and the
// version of the real-system set, never on the camera, so a cache keyed by class and
// index carries it from frame to frame.
import {
  boxelEdge,
  boxelOrigin,
  boxelSeed,
  starOffsets,
  STARS_PER_BOXEL,
} from './boxel';
import type { BoxelIndex } from './boxel';
import { SUPPRESSION_RADIUS_LY } from './real-systems';
import type { RealSystemSet } from './real-systems';

/** How many 32-bit words one boxel's bit mask holds. */
export const MASK_WORDS = STARS_PER_BOXEL / 32;

/** How many cached boxels the sweep holds before it drops them all. */
export const MAX_CACHE_ENTRIES = 8192;

/** The systems near one boxel, by the boxel's grid index. */
export type SuppressionIndex = Map<string, number[]>;

/** The key of a boxel inside one size class. */
function indexKey(index: BoxelIndex): string {
  return `${index[0]},${index[1]},${index[2]}`;
}

/**
 * Builds the index of one size class: a map from boxel index to the systems inside
 * that boxel grown by the suppression radius. A system enters up to 8 entries, one per
 * boxel whose grown box holds it, because the radius is smaller than the smallest
 * boxel edge.
 */
export function buildSuppressionIndex(
  set: RealSystemSet,
  sizeClass: number,
): SuppressionIndex {
  const map: SuppressionIndex = new Map();
  const edge = boxelEdge(sizeClass);
  const origin = boxelOrigin([0, 0, 0], sizeClass);
  const radius = SUPPRESSION_RADIUS_LY;
  const positions = set.positions;

  const cell = (value: number, axis: number): [number, number] => {
    const low = Math.floor((value - radius - (origin[axis] as number)) / edge);
    const high = Math.floor((value + radius - (origin[axis] as number)) / edge);
    return [low, high];
  };

  for (let slot = 0; slot < set.count; slot += 1) {
    const [lowX, highX] = cell(positions[slot * 3] as number, 0);
    const [lowY, highY] = cell(positions[slot * 3 + 1] as number, 1);
    const [lowZ, highZ] = cell(positions[slot * 3 + 2] as number, 2);
    for (let ix = lowX; ix <= highX; ix += 1) {
      for (let iy = lowY; iy <= highY; iy += 1) {
        for (let iz = lowZ; iz <= highZ; iz += 1) {
          const key = indexKey([ix, iy, iz]);
          const entry = map.get(key);
          if (entry === undefined) {
            map.set(key, [slot]);
          } else {
            entry.push(slot);
          }
        }
      }
    }
  }
  return map;
}

/**
 * Writes the bit mask of one boxel into eight words and returns how many stars it
 * suppresses. A set bit says that a real system lies within the suppression radius of
 * the star of that index, so the field does not draw it.
 */
export function sweepBoxel(
  index: BoxelIndex,
  sizeClass: number,
  placed: number,
  slots: readonly number[],
  positions: Float64Array,
  out: Uint32Array,
  offset: number,
): number {
  for (let word = 0; word < MASK_WORDS; word += 1) out[offset + word] = 0;
  if (placed <= 0 || slots.length === 0) return 0;

  const edge = boxelEdge(sizeClass);
  const origin = boxelOrigin(index, sizeClass);
  const seed = boxelSeed(index, sizeClass);
  const limit = SUPPRESSION_RADIUS_LY * SUPPRESSION_RADIUS_LY;
  let suppressed = 0;

  for (let star = 0; star < placed; star += 1) {
    const offsets = starOffsets(seed, star);
    const x = (origin[0] as number) + offsets[0] * edge;
    const y = (origin[1] as number) + offsets[1] * edge;
    const z = (origin[2] as number) + offsets[2] * edge;
    for (const slot of slots) {
      const dx = x - (positions[slot * 3] as number);
      const dy = y - (positions[slot * 3 + 1] as number);
      const dz = z - (positions[slot * 3 + 2] as number);
      if (dx * dx + dy * dy + dz * dz <= limit) {
        out[offset + (star >> 5)] =
          ((out[offset + (star >> 5)] as number) | (1 << (star & 31))) >>> 0;
        suppressed += 1;
        break;
      }
    }
  }
  return suppressed;
}

/** The sweep, with its per-class index and its per-boxel cache. */
export interface StarSuppression {
  /**
   * Starts a build of one size class. It drops the cache when the real-system set has
   * changed since the last build, and it starts the swept count again.
   */
  begin(sizeClass: number): void;
  /**
   * Writes the eight mask words of one boxel and returns how many stars it suppresses.
   * The class must be the class the last `begin` named; every other class writes zeros
   * and sweeps nothing.
   */
  write(
    index: BoxelIndex,
    sizeClass: number,
    placed: number,
    out: Uint32Array,
    offset: number,
  ): number;
  /** How many boxels the sweep computed a mask for since the last `begin`. */
  readonly sweptCount: number;
  /** How many boxels the cache holds. */
  readonly cacheSize: number;
}

/** One cached boxel: its mask words and how many stars they suppress. */
interface CachedMask {
  readonly words: Uint32Array;
  readonly suppressed: number;
}

/**
 * Creates the sweep over a real-system set. The set is read live, so the sweep sees
 * every record the host adds.
 */
export function createStarSuppression(set: RealSystemSet | null): StarSuppression {
  const cache = new Map<string, CachedMask>();
  let index: SuppressionIndex = new Map();
  let positions: Float64Array = new Float64Array(0);
  let indexClass = -1;
  let indexVersion = -1;
  let swept = 0;

  return {
    begin(sizeClass: number): void {
      swept = 0;
      const version = set === null ? -1 : set.version;
      if (version !== indexVersion) {
        // A changed set invalidates every mask, because a mask holds the systems the
        // set had when it was swept.
        cache.clear();
        indexVersion = version;
        indexClass = -1;
      }
      if (cache.size > MAX_CACHE_ENTRIES) cache.clear();
      if (sizeClass !== indexClass) {
        index = set === null ? new Map() : buildSuppressionIndex(set, sizeClass);
        indexClass = sizeClass;
      }
      positions = set === null ? new Float64Array(0) : set.positions;
    },

    write(
      boxel: BoxelIndex,
      sizeClass: number,
      placed: number,
      out: Uint32Array,
      offset: number,
    ): number {
      // Suppression runs in the base size class alone, which is the class `begin`
      // named. A coarser class writes zeros and sweeps nothing.
      if (sizeClass !== indexClass) {
        for (let word = 0; word < MASK_WORDS; word += 1) out[offset + word] = 0;
        return 0;
      }
      const key = indexKey(boxel);
      const slots = index.get(key);
      if (slots === undefined) {
        for (let word = 0; word < MASK_WORDS; word += 1) out[offset + word] = 0;
        return 0;
      }

      const cacheKey = `${sizeClass}:${key}`;
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        out.set(cached.words, offset);
        return cached.suppressed;
      }

      const suppressed = sweepBoxel(
        boxel,
        sizeClass,
        placed,
        slots,
        positions,
        out,
        offset,
      );
      swept += 1;
      cache.set(cacheKey, {
        words: out.slice(offset, offset + MASK_WORDS),
        suppressed,
      });
      return suppressed;
    },

    get sweptCount(): number {
      return swept;
    },
    get cacheSize(): number {
      return cache.size;
    },
  };
}
