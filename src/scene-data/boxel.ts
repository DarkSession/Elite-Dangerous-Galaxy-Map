// The mass-code octree of the game's galaxy grid, and the blocks of boxels the star
// field draws around the camera. The grid constants come from
// `@elite-dangerous-almanac/core`; nothing here knows about rendering.
import { GALAXY_ORIGIN } from '@elite-dangerous-almanac/core/astro/galaxy-grid';
import { boxelEdgeLy } from '@elite-dangerous-almanac/core/astro/mass-code';

/** The low corner of the galaxy grid in game coordinates, in light years. */
export const GRID_ORIGIN: readonly [number, number, number] = [
  GALAXY_ORIGIN.x,
  GALAXY_ORIGIN.y,
  GALAXY_ORIGIN.z,
];

/** The largest size class. Its edge is the sector edge of 1,280 light years. */
export const MAX_SIZE_CLASS = 7;

/** How many size classes draw at once. */
export const DRAWN_CLASS_COUNT = 4;

/** The largest base size class the zoom distance can select. */
export const MAX_BASE_SIZE_CLASS = 4;

/**
 * The zoom distance, in light years, at which the base class rule steps to class 1.
 * The band of base class `s` is `(160 * 2^s, 320 * 2^s]`.
 */
export const BASE_CLASS_DISTANCE = 320;

/** The largest number of stars one boxel draws. */
export const STARS_PER_BOXEL = 256;

/** How many boxels a block holds on one axis. */
export const BLOCK_BOXELS_PER_AXIS = 8;

/** How many boxels a class drops on one axis for the class below to refine. */
export const DROPPED_BOXELS_PER_AXIS = 4;

/**
 * How many boxels the drawn set holds at every view. Each of the four classes draws
 * `8^3` boxels and each class above the base drops `4^3`, so the set holds
 * `512 + 3 * 448`.
 */
export const DRAWN_BOXEL_COUNT = 1856;

/** An integer boxel index on the three axes of the galaxy grid. */
export type BoxelIndex = readonly [number, number, number];

/** One size class's block of boxels around the camera. */
export interface BoxelBlock {
  /** The size class the block draws. */
  readonly sizeClass: number;
  /** The edge of one of its boxels, in light years. */
  readonly edge: number;
  /** The lowest index the block draws on each axis. */
  readonly low: BoxelIndex;
  /** The lowest index the block drops on each axis. */
  readonly droppedLow: BoxelIndex;
  /** How many boxels the block drops per axis: 4, or 0 at the base class. */
  readonly droppedPerAxis: number;
}

/** One boxel of the drawn set. */
export interface DrawnBoxel {
  readonly sizeClass: number;
  readonly index: BoxelIndex;
}

/** The edge of a boxel of a size class, in light years. */
export function boxelEdge(sizeClass: number): number {
  return boxelEdgeLy(sizeClass);
}

/** The index of the boxel of a size class that holds a position. */
export function boxelIndexAt(
  position: readonly [number, number, number],
  sizeClass: number,
): BoxelIndex {
  const edge = boxelEdge(sizeClass);
  return [
    Math.floor((position[0] - GRID_ORIGIN[0]) / edge),
    Math.floor((position[1] - GRID_ORIGIN[1]) / edge),
    Math.floor((position[2] - GRID_ORIGIN[2]) / edge),
  ];
}

/** The low corner of a boxel in game coordinates, in light years. */
export function boxelOrigin(
  index: BoxelIndex,
  sizeClass: number,
): [number, number, number] {
  const edge = boxelEdge(sizeClass);
  return [
    GRID_ORIGIN[0] + index[0] * edge,
    GRID_ORIGIN[1] + index[1] * edge,
    GRID_ORIGIN[2] + index[2] * edge,
  ];
}

/**
 * The base size class at a zoom distance: `clamp(ceil(log2(distance / 320)), 0, 4)`.
 * The rule uses `ceil`, so the covered radius never falls below 0.75 of the zoom
 * distance while the clamp does not bite.
 */
export function baseSizeClass(distance: number): number {
  const raw = Math.ceil(Math.log2(distance / BASE_CLASS_DISTANCE));
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (raw > MAX_BASE_SIZE_CLASS) return MAX_BASE_SIZE_CLASS;
  return raw;
}

/** The radius of the sphere the field covers at a zoom distance, in light years. */
export function coveredRadius(distance: number): number {
  return 3 * boxelEdge(baseSizeClass(distance) + DRAWN_CLASS_COUNT - 1);
}

/**
 * The four blocks the field draws at a camera position and a zoom distance, from the
 * base class up. The builder works from the coarsest class down: that class takes the
 * 8 boxels per axis around the camera's own boxel, each class above the base drops the
 * 4 boxels per axis around the camera, and the class below draws the refinement of
 * exactly those 4. A block of 8 boxels centred on the camera's own boxel at each class
 * on its own does not nest, because 8 child indices cover 4 parents only when the
 * child index of the camera is even.
 */
export function buildBoxelBlocks(
  camera: readonly [number, number, number],
  distance: number,
): BoxelBlock[] {
  const base = baseSizeClass(distance);
  const top = base + DRAWN_CLASS_COUNT - 1;
  const blocks: BoxelBlock[] = [];

  let low: BoxelIndex | undefined;
  for (let sizeClass = top; sizeClass >= base; sizeClass -= 1) {
    const centre = boxelIndexAt(camera, sizeClass);
    if (low === undefined) {
      const half = BLOCK_BOXELS_PER_AXIS / 2;
      low = [centre[0] - half, centre[1] - half, centre[2] - half];
    }
    const droppedPerAxis = sizeClass > base ? DROPPED_BOXELS_PER_AXIS : 0;
    const droppedLow: BoxelIndex = [
      centre[0] - DROPPED_BOXELS_PER_AXIS / 2,
      centre[1] - DROPPED_BOXELS_PER_AXIS / 2,
      centre[2] - DROPPED_BOXELS_PER_AXIS / 2,
    ];
    blocks.push({
      sizeClass,
      edge: boxelEdge(sizeClass),
      low,
      droppedLow,
      droppedPerAxis,
    });
    low = [droppedLow[0] * 2, droppedLow[1] * 2, droppedLow[2] * 2];
  }

  return blocks.reverse();
}

/** True when a block draws the boxel at an index. */
export function blockDraws(block: BoxelBlock, index: BoxelIndex): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    const offset = (index[axis] as number) - (block.low[axis] as number);
    if (offset < 0 || offset >= BLOCK_BOXELS_PER_AXIS) return false;
  }
  if (block.droppedPerAxis === 0) return true;
  let inside = true;
  for (let axis = 0; axis < 3; axis += 1) {
    const offset = (index[axis] as number) - (block.droppedLow[axis] as number);
    if (offset < 0 || offset >= block.droppedPerAxis) inside = false;
  }
  return !inside;
}

/** The boxels one block draws, which is its 8 cubed less the 4 cubed it drops. */
export function listBlockBoxels(block: BoxelBlock): DrawnBoxel[] {
  const boxels: DrawnBoxel[] = [];
  for (let ix = 0; ix < BLOCK_BOXELS_PER_AXIS; ix += 1) {
    for (let iy = 0; iy < BLOCK_BOXELS_PER_AXIS; iy += 1) {
      for (let iz = 0; iz < BLOCK_BOXELS_PER_AXIS; iz += 1) {
        const index: BoxelIndex = [
          (block.low[0] as number) + ix,
          (block.low[1] as number) + iy,
          (block.low[2] as number) + iz,
        ];
        if (blockDraws(block, index)) {
          boxels.push({ sizeClass: block.sizeClass, index });
        }
      }
    }
  }
  return boxels;
}

/** Every boxel the field draws at a camera position and a zoom distance. */
export function listDrawnBoxels(
  camera: readonly [number, number, number],
  distance: number,
): DrawnBoxel[] {
  const boxels: DrawnBoxel[] = [];
  for (const block of buildBoxelBlocks(camera, distance)) {
    for (const boxel of listBlockBoxels(block)) boxels.push(boxel);
  }
  return boxels;
}

/**
 * A 32-bit integer mix. The shader runs the same three steps on a `uint`, where the
 * multiply wraps as `Math.imul` does here.
 */
function mix(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/**
 * The seed of a boxel, from its grid index and its size class. The seed depends on the
 * address alone, so a boxel always shows the same stars whatever route the camera
 * took. A negative index enters the mix as its two's complement, which is what the
 * shader's `uint(int)` conversion gives.
 */
export function boxelSeed(index: BoxelIndex, sizeClass: number): number {
  let seed = mix(index[0] | 0);
  seed = mix((seed ^ ((index[1] | 0) >>> 0)) >>> 0);
  seed = mix((seed ^ ((index[2] | 0) >>> 0)) >>> 0);
  return mix((seed ^ (sizeClass >>> 0)) >>> 0);
}

/** The odd constant that separates one star's stream from the next. */
const STAR_STRIDE = 0x9e3779b1;

/**
 * The three offsets of a star inside its boxel, each in 0 to 1. The value takes the
 * top 24 bits of the mix, which a `float32` holds exactly, so the shader gives the
 * same number as this function.
 */
export function starOffsets(seed: number, starIndex: number): [number, number, number] {
  const first = mix(((seed >>> 0) + Math.imul(starIndex >>> 0, STAR_STRIDE)) >>> 0);
  const second = mix((first ^ 0x68bc21eb) >>> 0);
  const third = mix((second ^ 0x02e5be93) >>> 0);
  return [
    (first >>> 8) / 16777216,
    (second >>> 8) / 16777216,
    (third >>> 8) / 16777216,
  ];
}

/**
 * The fourth value of a star's hash, in 0 to 1. The star pass shapes it into the
 * brightness spread that gives the field its grain. It is a value of its own, so the
 * spread never moves the star.
 */
export function starSpreadValue(seed: number, starIndex: number): number {
  const first = mix(((seed >>> 0) + Math.imul(starIndex >>> 0, STAR_STRIDE)) >>> 0);
  const second = mix((first ^ 0x68bc21eb) >>> 0);
  const third = mix((second ^ 0x02e5be93) >>> 0);
  return (mix((third ^ 0x7fb5d329) >>> 0) >>> 8) / 16777216;
}

/** The position of a star of a boxel in game coordinates, in light years. */
export function starPosition(
  index: BoxelIndex,
  sizeClass: number,
  starIndex: number,
): [number, number, number] {
  const edge = boxelEdge(sizeClass);
  const origin = boxelOrigin(index, sizeClass);
  const offsets = starOffsets(boxelSeed(index, sizeClass), starIndex);
  return [
    origin[0] + offsets[0] * edge,
    origin[1] + offsets[1] * edge,
    origin[2] + offsets[2] * edge,
  ];
}
