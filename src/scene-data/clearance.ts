// The clearance field: for every cell of the region grid, the distance to the nearest
// cell that touches a cell of another region id.
//
// Inside a region the field is the distance to that region's own boundary, so one
// field serves all 42 regions. The point of largest clearance inside a region is the
// point furthest from any of its boundaries, which is where its label sits.
//
// This module reads the region grid as a type only. It imports nothing that carries
// the 199 KiB region cell lookup, so the page can read the downsampled field with
// `clearanceAt` without pulling that table into its chunk.
import type { RegionGrid } from './region-lines';
import { NO_REGION_ID, REGION_COUNT } from './regions';
import type { RegionClearanceField, RegionLabelGeometry } from './types';

/** How many trace cells one cell of the downsampled field covers, per axis. */
export const CLEARANCE_DOWNSAMPLE = 8;

/** The largest clearance a `Uint16` cell holds, in light years. */
const CLEARANCE_MAX_LY = 65535;

/**
 * The exact clearance field over the trace grid.
 *
 * The value of a cell is the distance to the nearest cell that has a 4-neighbour of
 * another id, in light years, **rounded down**. Rounding down keeps the field a lower
 * bound on the true distance, which is what every reader of it assumes. It is one
 * `Uint16` per cell, which is 8.2 MB over the shipped grid.
 */
export interface ExactClearanceField {
  /** How many cells the field holds per axis. */
  readonly size: number;
  /** The plane point the value of cell (0, 0) sits at, as `x` then `z`. */
  readonly origin: readonly [number, number];
  /** The distance between two neighbouring cell values, in light years. */
  readonly cell: number;
  /** One value per cell, `x` fastest, in light years, rounded down. */
  readonly values: Uint16Array;
}

/** A squared distance no seeded cell can reach, for a row that holds no seed. */
const NO_SEED_SQUARED = 1e15;

/**
 * The exact squared distance transform of one line, by Felzenszwalb and Huttenlocher.
 *
 * `f` holds the squared distance already found for each sample of the line, and `d`
 * takes the result. The pass reads `f` as a set of parabolas and keeps their lower
 * envelope, so it runs in one sweep of the line rather than in a search.
 */
function transformLine(
  f: Float64Array,
  count: number,
  d: Float64Array,
  hulls: Int32Array,
  breaks: Float64Array,
): void {
  let top = 0;
  hulls[0] = 0;
  breaks[0] = -Number.MAX_VALUE;
  breaks[1] = Number.MAX_VALUE;
  for (let at = 1; at < count; at += 1) {
    const value = f[at] as number;
    let cross: number;
    for (;;) {
      const other = hulls[top] as number;
      cross =
        (value + at * at - (f[other] as number) - other * other) / (2 * at - 2 * other);
      if (cross > (breaks[top] as number) || top === 0) break;
      top -= 1;
    }
    top += 1;
    hulls[top] = at;
    breaks[top] = cross;
    breaks[top + 1] = Number.MAX_VALUE;
  }
  let read = 0;
  for (let at = 0; at < count; at += 1) {
    while ((breaks[read + 1] as number) < at) read += 1;
    const other = hulls[read] as number;
    d[at] = (at - other) * (at - other) + (f[other] as number);
  }
}

/**
 * Marks every cell that has a 4-neighbour of another region id. A cell that resolves
 * to no region counts as an id of its own, the same rule the boundary trace uses, so
 * the rim of the mapped area seeds the field.
 *
 * The distance is to the last cell **inside** the region, not to the first cell
 * outside it, so a cell that touches another id has a clearance of zero.
 */
export function markClearanceSeeds(grid: RegionGrid): Uint8Array {
  const size = grid.size;
  const ids = grid.ids;
  const seeds = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    const row = iz * size;
    for (let ix = 0; ix < size; ix += 1) {
      const id = ids[row + ix] as number;
      const edge =
        (ix > 0 && ids[row + ix - 1] !== id) ||
        (ix + 1 < size && ids[row + ix + 1] !== id) ||
        (iz > 0 && ids[row - size + ix] !== id) ||
        (iz + 1 < size && ids[row + size + ix] !== id);
      if (edge) seeds[row + ix] = 1;
    }
  }
  return seeds;
}

/**
 * Builds the exact clearance field over a region grid.
 *
 * It is one exact Euclidean distance transform, run as two separable passes: one
 * along `x` and one along `z`. The working buffer holds squared distances in cells,
 * which reach 8,209,352 over the shipped grid; a `float32` holds every integer up to
 * 16,777,216 exactly, so the buffer costs 16.4 MB and loses nothing.
 */
export function buildClearanceField(grid: RegionGrid): ExactClearanceField {
  const size = grid.size;
  const squared = new Float32Array(size * size);
  const seeds = markClearanceSeeds(grid);
  for (let index = 0; index < squared.length; index += 1) {
    squared[index] = seeds[index] === 1 ? 0 : NO_SEED_SQUARED;
  }

  const line = new Float64Array(size);
  const result = new Float64Array(size);
  const hulls = new Int32Array(size);
  const breaks = new Float64Array(size + 1);

  for (let iz = 0; iz < size; iz += 1) {
    const row = iz * size;
    for (let ix = 0; ix < size; ix += 1) line[ix] = squared[row + ix] as number;
    transformLine(line, size, result, hulls, breaks);
    for (let ix = 0; ix < size; ix += 1) squared[row + ix] = result[ix] as number;
  }
  for (let ix = 0; ix < size; ix += 1) {
    for (let iz = 0; iz < size; iz += 1) line[iz] = squared[iz * size + ix] as number;
    transformLine(line, size, result, hulls, breaks);
    for (let iz = 0; iz < size; iz += 1) squared[iz * size + ix] = result[iz] as number;
  }

  const values = new Uint16Array(size * size);
  for (let index = 0; index < values.length; index += 1) {
    const distance = Math.sqrt(squared[index] as number) * grid.cell;
    values[index] =
      distance >= CLEARANCE_MAX_LY ? CLEARANCE_MAX_LY : Math.floor(distance);
  }

  return {
    size,
    origin: [
      (grid.origin[0] as number) + grid.cell / 2,
      (grid.origin[1] as number) + grid.cell / 2,
    ],
    cell: grid.cell,
    values,
  };
}

/**
 * Downsamples the field for the page.
 *
 * A downsampled cell carries the **smallest** clearance of the cells it covers, so a
 * reader that takes it never believes it has more room than it has, and its value
 * sits at the centre of the block it covers, so a reader knows where to interpolate
 * from. Over the shipped grid it is 254 by 254 cells, which is 126 KiB.
 */
export function downsampleClearance(
  field: ExactClearanceField,
  step: number = CLEARANCE_DOWNSAMPLE,
): RegionClearanceField {
  // The field size is not always a whole number of blocks. The shipped field is 2027
  // trace cells, which is 253 blocks of 8 and one ragged block of 3. The last row and
  // the last column hold that ragged block.
  const size = Math.ceil(field.size / step);
  const values = new Uint16Array(size * size);
  for (let bz = 0; bz < size; bz += 1) {
    const lowZ = bz * step;
    const highZ = Math.min(field.size, lowZ + step);
    for (let bx = 0; bx < size; bx += 1) {
      const lowX = bx * step;
      const highX = Math.min(field.size, lowX + step);
      let least = CLEARANCE_MAX_LY;
      for (let iz = lowZ; iz < highZ; iz += 1) {
        const row = iz * field.size;
        for (let ix = lowX; ix < highX; ix += 1) {
          const value = field.values[row + ix] as number;
          if (value < least) least = value;
        }
      }
      values[bz * size + bx] = least;
    }
  }
  // The value of a block sits at the centre of the block, which is half a step of the
  // trace grid past the centre of the first cell the block covers.
  //
  // The shift is the same for every block, and the ragged last block takes it too. That
  // block covers 3 trace cells but takes the anchor of a full block of 8, which is 1.5
  // trace cells past the last cell it summarises. The anchor stays uniform on purpose,
  // so a reader interpolates with no special case at the edge. The overshoot walk in
  // `region-lines.test.ts` measures the cost over every trace cell: the read exceeds the
  // exact field by at most 47.887 light years, against a trace cell of 49.349 and the
  // two cells, 98.70, that the label rule allows.
  const shift = ((step - 1) / 2) * field.cell;
  return {
    size,
    origin: [(field.origin[0] as number) + shift, (field.origin[1] as number) + shift],
    cell: field.cell * step,
    values,
  };
}

/**
 * The clearance at a plane point, read from the downsampled field, or null when the
 * point lies off it.
 *
 * The read is bilinear, so the value moves smoothly across a cell edge and the drawn
 * size of a label does not step. It can exceed the exact field at the sampled point,
 * because it interpolates between block minima. Measured over every cell of the trace
 * grid, it does so by at most 0.1213 of a block width, which is 47.89 light years
 * against a trace cell of 49.3494. The label rule allows two trace cells for it.
 */
export function clearanceAt(
  field: RegionClearanceField,
  x: number,
  z: number,
): number | null {
  const fx = (x - (field.origin[0] as number)) / field.cell;
  const fz = (z - (field.origin[1] as number)) / field.cell;
  const last = field.size - 1;
  if (!(fx >= 0 && fz >= 0 && fx <= last && fz <= last)) return null;
  if (field.size === 1) return field.values[0] as number;
  const ix = Math.min(last - 1, Math.floor(fx));
  const iz = Math.min(last - 1, Math.floor(fz));
  const tx = fx - ix;
  const tz = fz - iz;
  const row = iz * field.size;
  const next = row + field.size;
  const low =
    (field.values[row + ix] as number) * (1 - tx) +
    (field.values[row + ix + 1] as number) * tx;
  const high =
    (field.values[next + ix] as number) * (1 - tx) +
    (field.values[next + ix + 1] as number) * tx;
  return low * (1 - tz) + high * tz;
}

/**
 * Takes the centre of every region: the plane point of largest exact clearance inside
 * it, and the clearance there.
 *
 * This is not the centroid. A region can be concave, and its centroid then lies
 * outside it, while the point furthest from every boundary cannot.
 *
 * A region with no cell in the grid takes a centre of `NaN`, which no placement can
 * use. All 42 regions of the shipped grid hold cells.
 */
export function buildRegionLabelGeometry(
  grid: RegionGrid,
  field: ExactClearanceField,
  departureLy: number,
): RegionLabelGeometry {
  const centres = new Float32Array(REGION_COUNT * 2).fill(Number.NaN);
  const clearances = new Uint16Array(REGION_COUNT);
  const found = new Uint8Array(REGION_COUNT);
  for (let iz = 0; iz < grid.size; iz += 1) {
    const row = iz * grid.size;
    for (let ix = 0; ix < grid.size; ix += 1) {
      const id = grid.ids[row + ix] as number;
      if (id === NO_REGION_ID || id > REGION_COUNT) continue;
      const slot = id - 1;
      const value = field.values[row + ix] as number;
      if (found[slot] === 1 && value <= (clearances[slot] as number)) continue;
      found[slot] = 1;
      clearances[slot] = value;
      centres[slot * 2] = (field.origin[0] as number) + ix * field.cell;
      centres[slot * 2 + 1] = (field.origin[1] as number) + iz * field.cell;
    }
  }
  return { centres, clearances, field: downsampleClearance(field), departureLy };
}
