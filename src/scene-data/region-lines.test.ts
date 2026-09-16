import { beforeAll, describe, expect, test } from 'vitest';
import { findCodexRegionAt } from '@elite-dangerous-almanac/core/astro/codex-region-lookup';
import { galaxyModel } from '../galaxy-model/model';
import {
  buildCoarseRegionGrid,
  buildRegionData,
  buildRegionFlow,
  regionFlowRoots,
  buildRegionLines,
  chainPoints,
  collapseChain,
  fillRegionGrid,
  midpointChain,
  packRegionLines,
  packTracedLines,
  REGION_CELL_LY,
  REGION_DEPARTURE_LY,
  REGION_GRID_SIZE,
  REGION_MOVE_CAP,
  REGION_ROUND_CAP,
  REGION_ROUND_PASSES,
  REGION_SIMPLIFY_TOLERANCE,
  REGION_SMOOTH_HALF_WIDTH,
  REGION_SMOOTH_PASSES,
  REGION_TRACED_MOVE_CAP,
  REGION_TRACED_SIMPLIFY_TOLERANCE,
  REGION_TRACED_SMOOTH_HALF_WIDTH,
  REGION_TRACED_SMOOTH_PASSES,
  averageChain,
  capChain,
  roundChain,
  simplifyChain,
  tracedChain,
  traceRegionChains,
  traceRegionLines,
} from './region-lines';
import type { RegionGrid, RegionTrace, TracedChain } from './region-lines';
import {
  coarseRegionFlowStepAt,
  coarseRegionIdAt,
  NO_REGION_ID,
  REGION_COUNT,
  REGION_FLOW_END,
  REGION_FLOW_STEPS,
  regionOfId,
} from './regions';
import { regionLinesTransferables, regionResponseTransferables } from './messages';
import type { CoarseRegionGrid, RegionLines } from './types';

/** The departure bound the spec states, in light years. It is one cell. */
const DEPARTURE_LIMIT = REGION_DEPARTURE_LY;

/**
 * How many CSS pixels one cell measures at the worst view the range fade allows: a range
 * of 10,000 light years, on 1,080 rows, at a 60 degree vertical field of view. It is the
 * view every CSS pixel reading of the roughness is stated at.
 */
const CELL_CSS_PIXELS = REGION_CELL_LY / ((2 * 10000 * Math.tan(Math.PI / 6)) / 1080);

let grid: RegionGrid;
let trace: RegionTrace;
let lines: RegionLines;
let traced: RegionLines;
let coarse: CoarseRegionGrid;
let flow: Uint8Array;
let roots: Int32Array;

beforeAll(() => {
  grid = fillRegionGrid();
  trace = traceRegionChains(grid);
  lines = packRegionLines(grid, trace);
  traced = packTracedLines(grid, trace);
  coarse = buildCoarseRegionGrid(grid);
  flow = buildRegionFlow(coarse);
  roots = regionFlowRoots(coarse);
}, 120000);

/** A small grid with the ids written out, for the rules that need no real data. */
function gridOf(ids: number[][]): RegionGrid {
  const size = ids.length;
  const values = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      values[iz * size + ix] = (ids[iz] as number[])[ix] as number;
    }
  }
  return { size, origin: [0, 0], cell: 10, ids: values };
}

/** A polyline of one chain in light years, as `x` then `z` per point. */
function tracedPolyline(source: RegionGrid, index: number): Float64Array {
  const nodes = chainPoints(trace.chains[index] as TracedChain);
  const out = new Float64Array(nodes.length);
  for (let read = 0; read < nodes.length; read += 2) {
    out[read] = (source.origin[0] as number) + (nodes[read] as number) * source.cell;
    out[read + 1] =
      (source.origin[1] as number) + (nodes[read + 1] as number) * source.cell;
  }
  return out;
}

/**
 * The polyline through the midpoints of the unit edges of one chain, in light years. It
 * is the boundary the region data states: a lattice corner sits up to half a cell from
 * the edge it marks, and the midpoint is the one point the two cells agree on.
 */
function midpointPolyline(source: RegionGrid, index: number): Float64Array {
  const chain = chainPoints(trace.chains[index] as TracedChain);
  return toLightYears(midpointChain(chain), source);
}

/** A polyline of one drawn chain in light years, as `x` then `z` per point. */
function drawnPolyline(set: RegionLines, index: number): Float64Array {
  const first = set.first[index] as number;
  const last = set.last[index] as number;
  const out = new Float64Array((last - first + 1) * 2);
  for (let vertex = first; vertex <= last; vertex += 1) {
    out[(vertex - first) * 2] = set.positions[vertex * 3] as number;
    out[(vertex - first) * 2 + 1] = set.positions[vertex * 3 + 2] as number;
  }
  return out;
}

/** A polyline of points in cells, in light years. */
function toLightYears(points: Float64Array, source: RegionGrid): Float64Array {
  const out = new Float64Array(points.length);
  for (let read = 0; read < points.length; read += 2) {
    out[read] = (source.origin[0] as number) + (points[read] as number) * source.cell;
    out[read + 1] =
      (source.origin[1] as number) + (points[read + 1] as number) * source.cell;
  }
  return out;
}

/** A uniform grid over the segments of one polyline, so a nearest query is local. */
interface SegmentIndex {
  readonly cell: number;
  readonly buckets: Map<number, number[]>;
  readonly points: Float64Array;
}

function indexSegments(points: Float64Array, cell = 200): SegmentIndex {
  const buckets = new Map<number, number[]>();
  const put = (ix: number, iz: number, segment: number): void => {
    const key = ix * 1000003 + iz;
    let list = buckets.get(key);
    if (list === undefined) {
      list = [];
      buckets.set(key, list);
    }
    if (list[list.length - 1] !== segment) list.push(segment);
  };
  for (let segment = 0; segment + 3 < points.length; segment += 2) {
    const x0 = points[segment] as number;
    const z0 = points[segment + 1] as number;
    const x1 = points[segment + 2] as number;
    const z1 = points[segment + 3] as number;
    const lowX = Math.floor(Math.min(x0, x1) / cell);
    const highX = Math.floor(Math.max(x0, x1) / cell);
    const lowZ = Math.floor(Math.min(z0, z1) / cell);
    const highZ = Math.floor(Math.max(z0, z1) / cell);
    for (let ix = lowX; ix <= highX; ix += 1) {
      for (let iz = lowZ; iz <= highZ; iz += 1) put(ix, iz, segment);
    }
  }
  return { cell, buckets, points };
}

/** The distance from a point to one segment of a polyline. */
function segmentGap(
  points: Float64Array,
  segment: number,
  x: number,
  z: number,
): number {
  const x0 = points[segment] as number;
  const z0 = points[segment + 1] as number;
  const dx = (points[segment + 2] as number) - x0;
  const dz = (points[segment + 3] as number) - z0;
  const span = dx * dx + dz * dz;
  let t = span === 0 ? 0 : ((x - x0) * dx + (z - z0) * dz) / span;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz));
}

/**
 * The distance from a point to the whole polyline. The search reads the cells of the
 * index in rings around the point and stops when the ring is further away than the
 * shortest distance it has, so the answer is the true nearest segment.
 */
function nearestGap(index: SegmentIndex, x: number, z: number): number {
  const cx = Math.floor(x / index.cell);
  const cz = Math.floor(z / index.cell);
  let best = Number.POSITIVE_INFINITY;
  for (let ring = 0; ring < 8192; ring += 1) {
    for (let ix = cx - ring; ix <= cx + ring; ix += 1) {
      for (let iz = cz - ring; iz <= cz + ring; iz += 1) {
        if (ring > 0 && Math.abs(ix - cx) !== ring && Math.abs(iz - cz) !== ring) {
          continue;
        }
        const list = index.buckets.get(ix * 1000003 + iz);
        if (list === undefined) continue;
        for (const segment of list) {
          const gap = segmentGap(index.points, segment, x, z);
          if (gap < best) best = gap;
        }
      }
    }
    if (best <= ring * index.cell) return best;
  }
  return best;
}

/**
 * The largest distance from any point of one polyline to another polyline, not only
 * from its vertices. The search cuts each segment in half while the distance at the
 * two ends plus half the length of the piece is above the limit, so `bound` is a true
 * upper bound on the distance of every point of the segment and `measured` is the
 * largest distance the search read.
 */
function worstGap(
  from: Float64Array,
  to: SegmentIndex,
  limit: number,
): { measured: number; bound: number } {
  let measured = 0;
  let bound = 0;
  for (let segment = 0; segment + 3 < from.length; segment += 2) {
    const ax = from[segment] as number;
    const az = from[segment + 1] as number;
    const bx = from[segment + 2] as number;
    const bz = from[segment + 3] as number;
    const stack: number[][] = [
      [ax, az, nearestGap(to, ax, az), bx, bz, nearestGap(to, bx, bz)],
    ];
    while (stack.length > 0) {
      const piece = stack.pop() as number[];
      const x0 = piece[0] as number;
      const z0 = piece[1] as number;
      const d0 = piece[2] as number;
      const x1 = piece[3] as number;
      const z1 = piece[4] as number;
      const d1 = piece[5] as number;
      const worst = Math.max(d0, d1);
      if (worst > measured) measured = worst;
      const half = Math.hypot(x1 - x0, z1 - z0) / 2;
      if (worst + half <= limit || half <= 0.02) {
        if (worst + half > bound) bound = worst + half;
        continue;
      }
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const dm = nearestGap(to, mx, mz);
      stack.push([x0, z0, d0, mx, mz, dm], [mx, mz, dm, x1, z1, d1]);
    }
  }
  return { measured, bound };
}

/**
 * The largest distance from any point of one polyline to another polyline, read exactly.
 *
 * The distance to a polyline changes by at most the distance moved, so every point of a
 * piece whose two ends read `d0` and `d1` sits within `max(d0, d1) + half` of the other
 * line, where `half` is half the length of the piece. The search cuts a piece in two only
 * while that bound can still beat the largest reading it holds, so the answer is the true
 * largest distance to within a hundredth of a light year.
 *
 * `worstGap` above answers a different question: it certifies that every point is inside a
 * limit, and it stops cutting as soon as it can say so, which under-reads the largest
 * distance on a line whose vertices sit far apart.
 */
function worstDeparture(from: Float64Array, to: SegmentIndex): number {
  let worst = 0;
  for (let segment = 0; segment + 3 < from.length; segment += 2) {
    const ax = from[segment] as number;
    const az = from[segment + 1] as number;
    const bx = from[segment + 2] as number;
    const bz = from[segment + 3] as number;
    const stack: number[][] = [
      [ax, az, nearestGap(to, ax, az), bx, bz, nearestGap(to, bx, bz)],
    ];
    while (stack.length > 0) {
      const piece = stack.pop() as number[];
      const x0 = piece[0] as number;
      const z0 = piece[1] as number;
      const d0 = piece[2] as number;
      const x1 = piece[3] as number;
      const z1 = piece[4] as number;
      const d1 = piece[5] as number;
      const ends = Math.max(d0, d1);
      if (ends > worst) worst = ends;
      const half = Math.hypot(x1 - x0, z1 - z0) / 2;
      if (ends + half <= worst + 0.01 || half <= 0.005) continue;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const dm = nearestGap(to, mx, mz);
      stack.push([x0, z0, d0, mx, mz, dm], [mx, mz, dm, x1, z1, d1]);
    }
  }
  return worst;
}

/** The two cell ids on the sides of the edge between two neighbouring nodes. */
function edgeOf(
  source: RegionGrid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { key: number; pair: string } {
  const size = source.size;
  if (x0 === x1) {
    const iz = Math.min(z0, z1);
    const low = source.ids[iz * size + x0 - 1] as number;
    const high = source.ids[iz * size + x0] as number;
    return {
      key: (iz * size + x0) * 2,
      pair: `${Math.min(low, high)}:${Math.max(low, high)}`,
    };
  }
  const ix = Math.min(x0, x1);
  const low = source.ids[(z0 - 1) * size + ix] as number;
  const high = source.ids[z0 * size + ix] as number;
  return {
    key: (z0 * size + ix) * 2 + 1,
    pair: `${Math.min(low, high)}:${Math.max(low, high)}`,
  };
}

/** The absolute turn angle at one vertex of a polyline, in degrees. */
function turnAt(polyline: Float64Array, vertex: number): number {
  const ax = (polyline[vertex * 2] as number) - (polyline[vertex * 2 - 2] as number);
  const az =
    (polyline[vertex * 2 + 1] as number) - (polyline[vertex * 2 - 1] as number);
  const bx = (polyline[vertex * 2 + 2] as number) - (polyline[vertex * 2] as number);
  const bz =
    (polyline[vertex * 2 + 3] as number) - (polyline[vertex * 2 + 1] as number);
  const spanA = Math.hypot(ax, az);
  const spanB = Math.hypot(bx, bz);
  if (spanA === 0 || spanB === 0) return 0;
  const cosine = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (spanA * spanB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** The sum of the absolute turn angle at the vertices of a polyline, in degrees. */
function turnOf(polyline: Float64Array): { turn: number; length: number } {
  const count = polyline.length / 2;
  let turn = 0;
  let length = 0;
  for (let index = 0; index + 1 < count; index += 1) {
    length += Math.hypot(
      (polyline[index * 2 + 2] as number) - (polyline[index * 2] as number),
      (polyline[index * 2 + 3] as number) - (polyline[index * 2 + 1] as number),
    );
  }
  for (let index = 1; index + 1 < count; index += 1) {
    const ax = (polyline[index * 2] as number) - (polyline[index * 2 - 2] as number);
    const az =
      (polyline[index * 2 + 1] as number) - (polyline[index * 2 - 1] as number);
    const bx = (polyline[index * 2 + 2] as number) - (polyline[index * 2] as number);
    const bz =
      (polyline[index * 2 + 3] as number) - (polyline[index * 2 + 1] as number);
    const spanA = Math.hypot(ax, az);
    const spanB = Math.hypot(bx, bz);
    if (spanA === 0 || spanB === 0) continue;
    const cosine = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (spanA * spanB)));
    turn += (Math.acos(cosine) * 180) / Math.PI;
  }
  return { turn, length };
}

/** How far apart the roughness reading takes its samples, in cells. */
const ROUGHNESS_STEP_CELLS = 0.25;

/** How much arc one roughness window spans, in cells. */
const ROUGHNESS_SPAN_CELLS = 8;

/**
 * The roughness of a polyline: the root mean square departure from the straight line
 * fitted to a sliding window of 8 cells of arc, one reading per window, in light years.
 *
 * The reading is of the **drawn line** and not of its vertices, so the polyline is first
 * resampled at a fixed step along its arc. A reading at the vertices alone would measure
 * where the vertices fall, and the two sets carry their vertices at very different
 * spacings. Eight cells is about two periods of the worst saw tooth, the 45 degree
 * staircase, and is short enough that a real bend does not dominate the reading.
 *
 * The fitted line is the total least squares fit, so the departure is measured
 * perpendicular to it: the root mean square departure is then the square root of the
 * smaller eigenvalue of the window's scatter matrix.
 */
function roughnessOf(polyline: Float64Array, cell: number): number[] {
  const step = ROUGHNESS_STEP_CELLS * cell;
  const samples: number[] = [polyline[0] as number, polyline[1] as number];
  let carry = 0;
  for (let segment = 0; segment + 3 < polyline.length; segment += 2) {
    const ax = polyline[segment] as number;
    const az = polyline[segment + 1] as number;
    const bx = polyline[segment + 2] as number;
    const bz = polyline[segment + 3] as number;
    const span = Math.hypot(bx - ax, bz - az);
    if (span === 0) continue;
    let at = step - carry;
    while (at <= span) {
      samples.push(ax + ((bx - ax) * at) / span, az + ((bz - az) * at) / span);
      at += step;
    }
    carry = span - (at - step);
  }

  const count = samples.length / 2;
  const width = Math.round(ROUGHNESS_SPAN_CELLS / ROUGHNESS_STEP_CELLS) + 1;
  const readings: number[] = [];
  for (let start = 0; start + width <= count; start += 1) {
    let meanX = 0;
    let meanZ = 0;
    for (let index = start; index < start + width; index += 1) {
      meanX += samples[index * 2] as number;
      meanZ += samples[index * 2 + 1] as number;
    }
    meanX /= width;
    meanZ /= width;
    let xx = 0;
    let xz = 0;
    let zz = 0;
    for (let index = start; index < start + width; index += 1) {
      const dx = (samples[index * 2] as number) - meanX;
      const dz = (samples[index * 2 + 1] as number) - meanZ;
      xx += dx * dx;
      xz += dx * dz;
      zz += dz * dz;
    }
    xx /= width;
    xz /= width;
    zz /= width;
    const trace2 = xx + zz;
    const determinant = xx * zz - xz * xz;
    const smaller =
      trace2 / 2 - Math.sqrt(Math.max(0, (trace2 * trace2) / 4 - determinant));
    readings.push(Math.sqrt(Math.max(0, smaller)));
  }
  return readings;
}

/** The value at a part of the way through a list, once it is sorted. */
function quantileOf(values: number[], part: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  const at = Math.min(sorted.length - 1, Math.floor(part * sorted.length));
  return sorted[at] as number;
}

/** The roughness of a whole set, in cells, as its median and its 90th percentile. */
function roughnessOfSet(
  read: (index: number) => Float64Array,
  chains: number,
  cell: number,
): { median: number; ninetieth: number; windows: number } {
  const readings: number[] = [];
  for (let index = 0; index < chains; index += 1) {
    for (const value of roughnessOf(read(index), cell)) readings.push(value);
  }
  return {
    median: quantileOf(readings, 0.5) / cell,
    ninetieth: quantileOf(readings, 0.9) / cell,
    windows: readings.length,
  };
}

/** The largest turn at a single vertex of a whole set, in degrees. */
function sharpestVertexOf(set: RegionLines): number {
  let worst = 0;
  for (let index = 0; index < set.chainCount; index += 1) {
    const drawn = drawnPolyline(set, index);
    const count = drawn.length / 2;
    for (let vertex = 1; vertex + 1 < count; vertex += 1) {
      const turn = turnAt(drawn, vertex);
      if (turn > worst) worst = turn;
    }
  }
  return worst;
}

describe('the region grid', () => {
  test('covers the model bounds at the cell size the game uses', () => {
    expect(REGION_CELL_LY).toBeCloseTo(4096 / 83, 12);
    const span = galaxyModel.bounds.x[1] - galaxyModel.bounds.x[0];
    expect(REGION_GRID_SIZE).toBe(Math.ceil(span / REGION_CELL_LY));
    expect(REGION_GRID_SIZE * REGION_CELL_LY).toBeGreaterThanOrEqual(span);
  });

  test('gives a cell outside the map an id of its own', () => {
    // Two regions side by side, with unmapped space around them. Dropping the edge
    // between a region and no region would lose the outline of the codex map.
    const withRim = traceRegionChains(
      gridOf([
        [0, 0, 0],
        [0, 7, 9],
        [0, 0, 0],
      ]),
    );
    expect(withRim.edgeCount).toBeGreaterThan(0);

    const withoutRim = traceRegionChains(
      gridOf([
        [7, 7, 7],
        [7, 7, 9],
        [7, 7, 7],
      ]),
    );
    expect(withoutRim.edgeCount).toBeLessThan(withRim.edgeCount);
  });
});

describe('the chain trace', () => {
  test('the boundary is a small number of chains', () => {
    expect(trace.edgeCount).toBe(38563);
    expect(trace.nodeCount).toBe(38522);
    expect(trace.junctionCount).toBe(82);
    expect(trace.chains.length).toBe(123);
    expect(trace.chains.length).toBeGreaterThanOrEqual(100);
    expect(trace.chains.length).toBeLessThanOrEqual(200);
    expect(lines.chainCount).toBe(trace.chains.length);
    expect(traced.chainCount).toBe(lines.chainCount);
    for (const set of [lines, traced]) {
      for (let index = 0; index < set.chainCount; index += 1) {
        const first = set.first[index] as number;
        const last = set.last[index] as number;
        expect(last - first + 1).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('a chain separates one pair of regions', () => {
    const seen = new Set<number>();
    for (const chain of trace.chains) {
      const nodes = chain.nodes;
      let pair: string | null = null;
      for (let node = 0; node + 3 < nodes.length; node += 2) {
        const edge = edgeOf(
          grid,
          nodes[node] as number,
          nodes[node + 1] as number,
          nodes[node + 2] as number,
          nodes[node + 3] as number,
        );
        if (pair === null) pair = edge.pair;
        expect(edge.pair).toBe(pair);
        expect(seen.has(edge.key)).toBe(false);
        seen.add(edge.key);
      }
    }
    expect(seen.size).toBe(trace.edgeCount);
  });

  test('links a loop with no junction into one chain', () => {
    // One cell of another id inside a region. Its four edges make a closed loop, and
    // no node of that loop carries more than two edges.
    const loop = traceRegionChains(
      gridOf([
        [7, 7, 7],
        [7, 9, 7],
        [7, 7, 7],
      ]),
    );
    expect(loop.edgeCount).toBe(4);
    expect(loop.junctionCount).toBe(0);
    expect(loop.chains.length).toBe(1);
    const nodes = (loop.chains[0] as TracedChain).nodes;
    expect(nodes.length).toBe(10);
    expect(nodes[0]).toBe(nodes[8]);
    expect(nodes[1]).toBe(nodes[9]);
  });
});

describe('the vertex reduction', () => {
  test('drops no vertex further than the tolerance from the line that replaces it', () => {
    // The reduction runs on the averaged chain and not on the raw staircase, which is
    // where the pipeline puts it. On the staircase it would only drop exactly
    // collinear points and would report nothing about the code as built.
    let worst = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const traced = chainPoints(trace.chains[index] as TracedChain);
      let points = traced;
      for (let pass = 0; pass < REGION_SMOOTH_PASSES; pass += 1) {
        points = capChain(
          averageChain(points, REGION_SMOOTH_HALF_WIDTH),
          traced,
          REGION_MOVE_CAP,
        );
      }
      const simplified = simplifyChain(points, REGION_SIMPLIFY_TOLERANCE);
      const line = indexSegments(toLightYears(simplified, grid), 200);
      const before = toLightYears(points, grid);
      for (let read = 0; read < before.length; read += 2) {
        const gap = nearestGap(
          line,
          before[read] as number,
          before[read + 1] as number,
        );
        if (gap > worst) worst = gap;
      }
    }
    console.log('the worst dropped vertex sits', worst, 'light years from the line');
    expect(worst).toBeLessThanOrEqual(REGION_SIMPLIFY_TOLERANCE * REGION_CELL_LY);
  }, 120000);
});

describe('the capped average', () => {
  test('holds the endpoints of a chain', () => {
    const chain = Float64Array.from([0, 0, 10, 0, 10, 10, 20, 10]);
    const averaged = averageChain(chain, REGION_SMOOTH_HALF_WIDTH);
    expect(averaged[0]).toBe(0);
    expect(averaged[1]).toBe(0);
    expect(averaged[averaged.length - 2]).toBe(20);
    expect(averaged[averaged.length - 1]).toBe(10);
    expect(averaged.length).toBe(chain.length);
  });

  test('shrinks the window near an end so it stays symmetric', () => {
    // A step in the middle of a straight run. The second point reads one neighbour on
    // each side, so it takes the mean of the first three points.
    const chain = Float64Array.from([0, 0, 1, 3, 2, 0, 3, 0, 4, 0]);
    const averaged = averageChain(chain, REGION_SMOOTH_HALF_WIDTH);
    expect(averaged[2]).toBeCloseTo(1, 12);
    expect(averaged[3]).toBeCloseTo(1, 12);
  });

  test('moves no point further than the cap from the node the trace put it on', () => {
    let worst = 0;
    for (const chain of trace.chains) {
      const points = chainPoints(chain);
      let out = points;
      for (let pass = 0; pass < REGION_SMOOTH_PASSES; pass += 1) {
        out = capChain(
          averageChain(out, REGION_SMOOTH_HALF_WIDTH),
          points,
          REGION_MOVE_CAP,
        );
      }
      for (let read = 0; read < points.length; read += 2) {
        const away = Math.hypot(
          (out[read] as number) - (points[read] as number),
          (out[read + 1] as number) - (points[read + 1] as number),
        );
        if (away > worst) worst = away;
      }
    }
    console.log('the worst point movement is', worst, 'cells');
    expect(worst).toBeLessThanOrEqual(REGION_MOVE_CAP + 1e-9);
  }, 120000);

  test('caps against the reference chain and not against the pass before', () => {
    // The middle point sits 10 cells away. Two passes of an average that walks it back
    // by a tenth each time would leave it 8.1 cells out; the cap holds it at 0.9.
    const points = Float64Array.from([0, 0, 1, 10, 2, 0]);
    const capped = capChain(
      Float64Array.from([0, 0, 1, 0, 2, 0]),
      points,
      REGION_MOVE_CAP,
    );
    expect(capped[3]).toBeCloseTo(10 - REGION_MOVE_CAP, 12);
  });
});

describe('the midpoint polyline', () => {
  test('gives one point for each unit edge and keeps the two ends', () => {
    const nodes = Float64Array.from([0, 0, 1, 0, 2, 0, 2, 1]);
    const midpoints = midpointChain(nodes);
    expect(midpoints.length / 2).toBe(nodes.length / 2 + 1);
    expect(Array.from(midpoints)).toEqual([0, 0, 0.5, 0, 1.5, 0, 2, 0.5, 2, 1]);
  });

  test('puts every interior point on the mean of the two nodes it sits between', () => {
    for (const chain of trace.chains.slice(0, 20)) {
      const nodes = chainPoints(chain);
      const midpoints = midpointChain(nodes);
      const count = nodes.length / 2;
      expect(midpoints.length / 2).toBe(count + 1);
      expect(midpoints[0]).toBe(nodes[0]);
      expect(midpoints[1]).toBe(nodes[1]);
      expect(midpoints[count * 2]).toBe(nodes[count * 2 - 2]);
      expect(midpoints[count * 2 + 1]).toBe(nodes[count * 2 - 1]);
      for (let index = 0; index + 1 < count; index += 1) {
        expect(midpoints[index * 2 + 2]).toBeCloseTo(
          ((nodes[index * 2] as number) + (nodes[index * 2 + 2] as number)) / 2,
          12,
        );
        expect(midpoints[index * 2 + 3]).toBeCloseTo(
          ((nodes[index * 2 + 1] as number) + (nodes[index * 2 + 3] as number)) / 2,
          12,
        );
      }
    }
  });

  test('caps a point against its own midpoint and not against the pass before', () => {
    // The third midpoint is pushed 10 cells off the line. The cap brings it back to half
    // a cell of that midpoint, whatever the pass before it read.
    const nodes = Float64Array.from([0, 0, 1, 0, 2, 0, 3, 0]);
    const midpoints = midpointChain(nodes);
    const pushed = midpoints.slice();
    pushed[5] = (midpoints[5] as number) + 10;
    const capped = capChain(pushed, midpoints, REGION_TRACED_MOVE_CAP);
    expect(capped[4]).toBeCloseTo(midpoints[4] as number, 12);
    expect(capped[5]).toBeCloseTo(
      (midpoints[5] as number) + REGION_TRACED_MOVE_CAP,
      12,
    );
  });

  test('moves no point of the traced pipeline past the cap from its own midpoint', () => {
    let worst = 0;
    for (const chain of trace.chains) {
      const midpoints = midpointChain(chainPoints(chain));
      let out = midpoints;
      for (let pass = 0; pass < REGION_TRACED_SMOOTH_PASSES; pass += 1) {
        out = capChain(
          averageChain(out, REGION_TRACED_SMOOTH_HALF_WIDTH),
          midpoints,
          REGION_TRACED_MOVE_CAP,
        );
      }
      for (let read = 0; read < midpoints.length; read += 2) {
        const away = Math.hypot(
          (out[read] as number) - (midpoints[read] as number),
          (out[read + 1] as number) - (midpoints[read + 1] as number),
        );
        if (away > worst) worst = away;
      }
    }
    console.log('the worst traced point movement is', worst, 'cells');
    expect(worst).toBeLessThanOrEqual(REGION_TRACED_MOVE_CAP + 1e-9);
  }, 120000);

  test('drops no vertex further than the tolerance from the line that replaces it', () => {
    let worst = 0;
    for (const chain of trace.chains) {
      const midpoints = midpointChain(chainPoints(chain));
      let out = midpoints;
      for (let pass = 0; pass < REGION_TRACED_SMOOTH_PASSES; pass += 1) {
        out = capChain(
          averageChain(out, REGION_TRACED_SMOOTH_HALF_WIDTH),
          midpoints,
          REGION_TRACED_MOVE_CAP,
        );
      }
      const reduced = tracedChain(chainPoints(chain));
      const line = indexSegments(toLightYears(reduced, grid), 200);
      const before = toLightYears(out, grid);
      for (let read = 0; read < before.length; read += 2) {
        const away = nearestGap(
          line,
          before[read] as number,
          before[read + 1] as number,
        );
        if (away > worst) worst = away;
      }
    }
    console.log(
      'the worst dropped traced vertex sits',
      worst,
      'light years from the line',
    );
    expect(worst).toBeLessThanOrEqual(
      REGION_TRACED_SIMPLIFY_TOLERANCE * REGION_CELL_LY,
    );
  }, 120000);
});

describe('the corner rounding', () => {
  test('cuts a sharp corner by the cap, not by a quarter of the segment', () => {
    // A right angle between two segments of 100 cells. A plain Chaikin cut would put
    // the two new points 25 cells from the corner.
    const corner = Float64Array.from([0, 0, 100, 0, 100, 100]);
    const rounded = roundChain(corner, REGION_ROUND_CAP);
    expect(rounded.length / 2).toBe(6);
    const before = [rounded[4] as number, rounded[5] as number];
    const after = [rounded[6] as number, rounded[7] as number];
    expect(Math.hypot((before[0] as number) - 100, before[1] as number)).toBeCloseTo(
      REGION_ROUND_CAP,
      12,
    );
    expect(
      Math.hypot((after[0] as number) - 100, (after[1] as number) - 0),
    ).toBeCloseTo(REGION_ROUND_CAP, 12);
  });

  test('never cuts more than a quarter of a short segment', () => {
    // A segment of half a cell is shorter than four times the cap, so the quarter
    // rule binds and the segment keeps half its length.
    const chain = Float64Array.from([0, 0, 0.5, 0, 0.5, 0.5]);
    const rounded = roundChain(chain, REGION_ROUND_CAP);
    expect(rounded[2]).toBeCloseTo(0.125, 12);
    expect(rounded[4]).toBeCloseTo(0.375, 12);
  });

  test('holds the endpoints of a chain', () => {
    const chain = Float64Array.from([0, 0, 10, 0, 10, 10]);
    const rounded = roundChain(chain, REGION_ROUND_CAP);
    expect(rounded[0]).toBe(0);
    expect(rounded[1]).toBe(0);
    expect(rounded[rounded.length - 2]).toBe(10);
    expect(rounded[rounded.length - 1]).toBe(10);
  });

  test('gives two points for each segment, so a pass doubles the count', () => {
    const chain = Float64Array.from([0, 0, 10, 0, 10, 10, 20, 10]);
    expect(roundChain(chain, REGION_ROUND_CAP).length / 2).toBe(8);
    expect(REGION_ROUND_PASSES).toBe(4);
  });
});

describe('the boundary set', () => {
  test('the drawn line stays near the boundary', () => {
    let drawnToTraced = 0;
    let tracedToDrawn = 0;
    let measuredDrawn = 0;
    let measuredTraced = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const traced = tracedPolyline(grid, index);
      const drawn = drawnPolyline(lines, index);
      const first = worstGap(drawn, indexSegments(traced), DEPARTURE_LIMIT);
      const second = worstGap(traced, indexSegments(drawn), DEPARTURE_LIMIT);
      drawnToTraced = Math.max(drawnToTraced, first.bound);
      tracedToDrawn = Math.max(tracedToDrawn, second.bound);
      measuredDrawn = Math.max(measuredDrawn, first.measured);
      measuredTraced = Math.max(measuredTraced, second.measured);
    }
    console.log('the departure of the drawn line', {
      drawnToTraced,
      tracedToDrawn,
      measuredDrawn,
      measuredTraced,
    });
    expect(drawnToTraced).toBeLessThanOrEqual(DEPARTURE_LIMIT);
    expect(tracedToDrawn).toBeLessThanOrEqual(DEPARTURE_LIMIT);
  }, 300000);

  test('the drawn line reads as a line', () => {
    let drawnTurn = 0;
    let drawnLength = 0;
    let tracedTurn = 0;
    let tracedLength = 0;
    const perChain: number[] = [];
    for (let index = 0; index < trace.chains.length; index += 1) {
      const drawn = turnOf(drawnPolyline(lines, index));
      drawnTurn += drawn.turn;
      drawnLength += drawn.length;
      if (drawn.length > 0) perChain.push((drawn.turn / drawn.length) * 1000);
      const traced = turnOf(tracedPolyline(grid, index));
      tracedTurn += traced.turn;
      tracedLength += traced.length;
    }
    const drawnPer = (drawnTurn / drawnLength) * 1000;
    const tracedPer = (tracedTurn / tracedLength) * 1000;
    const sorted = [...perChain].sort((first, second) => first - second);
    const worstChain = sorted[sorted.length - 1] as number;
    const median = sorted[Math.floor(sorted.length / 2)] as number;
    console.log('the turn for each 1,000 light years', {
      drawnPer,
      tracedPer,
      worstChain,
      median,
      chains: perChain.length,
    });
    expect(drawnPer).toBeLessThanOrEqual(60);
    expect(worstChain).toBeLessThanOrEqual(100);
    expect(tracedPer).toBeGreaterThan(1000);
  });

  test('the drawn line carries no visible corner', () => {
    let worst = 0;
    let over = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const drawn = drawnPolyline(lines, index);
      const count = drawn.length / 2;
      for (let vertex = 1; vertex + 1 < count; vertex += 1) {
        const turn = turnAt(drawn, vertex);
        if (turn > worst) worst = turn;
        if (turn > 20) over += 1;
      }
    }
    console.log('the worst vertex turns', worst, 'degrees, and', over, 'turn over 20');
    expect(worst).toBeLessThanOrEqual(20);
    expect(over).toBe(0);

    // The reading walks the vertices between the two ends of a chain, and the smoothing
    // holds those two ends fixed. A closed loop would therefore keep a raw staircase
    // corner at its seam that this measure never reads. The shipped trace holds no
    // closed loop, and this guards that: a loop would need the seam smoothed as well.
    let loops = 0;
    for (const chain of trace.chains) {
      const nodes = chain.nodes;
      if (
        nodes[0] === nodes[nodes.length - 2] &&
        nodes[1] === nodes[nodes.length - 1]
      ) {
        loops += 1;
      }
    }
    expect(loops).toBe(0);
  });

  test('the set is small enough to upload once', () => {
    console.log(
      'the boundary set holds',
      lines.vertexCount,
      'vertices in',
      lines.positions.byteLength / 1024,
      'KiB over',
      lines.chainCount,
      'chains',
    );
    expect(lines.vertexCount).toBeGreaterThanOrEqual(20000);
    expect(lines.vertexCount).toBeLessThanOrEqual(120000);
    expect(lines.positions.length).toBe(lines.vertexCount * 3);
    expect(lines.positions.byteLength).toBeLessThanOrEqual(1.4 * 1024 * 1024);
    expect(lines.first.length).toBe(lines.chainCount);
    expect(lines.last.length).toBe(lines.chainCount);
    // A vertex that two segments share is stored once, so the set holds one segment
    // per vertex less one per chain.
    expect(lines.vertexCount - lines.chainCount).toBe(68549);
  });

  test('draws every chain on the plane', () => {
    for (let vertex = 0; vertex < lines.vertexCount; vertex += 1) {
      expect(lines.positions[vertex * 3 + 1]).toBe(0);
    }
    let previous = -1;
    for (let index = 0; index < lines.chainCount; index += 1) {
      expect(lines.first[index]).toBe(previous + 1);
      previous = lines.last[index] as number;
    }
    expect(previous).toBe(lines.vertexCount - 1);
  });

  test('is deterministic', () => {
    const again = buildRegionLines();
    expect(again.chainCount).toBe(lines.chainCount);
    expect(again.vertexCount).toBe(lines.vertexCount);
    expect(new Uint8Array(again.positions.buffer)).toEqual(
      new Uint8Array(lines.positions.buffer),
    );
    expect(new Uint8Array(again.first.buffer)).toEqual(
      new Uint8Array(lines.first.buffer),
    );
    expect(new Uint8Array(again.last.buffer)).toEqual(
      new Uint8Array(lines.last.buffer),
    );
  }, 120000);

  test('is transferable', async () => {
    const small = fillRegionGrid(galaxyModel.bounds, 64);
    const set = traceRegionLines(small);
    const firstVertex = set.positions[0] as number;
    const ends = Array.from(set.last);
    const channel = new MessageChannel();
    const received = await new Promise<RegionLines>((resolve) => {
      channel.port2.onmessage = (event: MessageEvent<RegionLines>) =>
        resolve(event.data);
      channel.port2.start();
      channel.port1.postMessage(set, regionLinesTransferables(set));
    });

    expect(received.chainCount).toBe(set.chainCount);
    expect(received.vertexCount).toBe(set.vertexCount);
    expect(received.positions[0]).toBe(firstVertex);
    expect(Array.from(received.last)).toEqual(ends);
    expect(set.positions.buffer.byteLength).toBe(0);
    expect(set.first.buffer.byteLength).toBe(0);
    expect(set.last.buffer.byteLength).toBe(0);

    channel.port1.close();
    channel.port2.close();
  });
});

describe('the coarse region grid', () => {
  test('the coarse region grid resolves known positions', () => {
    const coarse = buildCoarseRegionGrid(grid);
    console.log(
      'the coarse region grid holds',
      coarse.size,
      'cells of',
      coarse.cell,
      'light years',
    );
    expect(coarse.size).toBeLessThanOrEqual(512);
    expect(coarse.ids.length).toBe(coarse.size * coarse.size);
    expect(regionOfId(coarseRegionIdAt(coarse, 0, 0))?.name).toBe('Inner Orion Spur');
    expect(regionOfId(coarseRegionIdAt(coarse, 15, 25895))?.name).toBe(
      'Galactic Centre',
    );
  });

  test('the exact call is right where the coarse one is not', () => {
    // The coarse grid reads the middle cell of each 4 by 4 block of the fine grid, so a
    // point near a boundary can sit in one region and take its coarse neighbour's name.
    // The search takes the point nearest Sol where the two readings differ and both
    // name a region. The browser tests of the panel select a system at this point,
    // so a change in the region data fails here first.
    let bestX = 0;
    let bestZ = 0;
    let bestAway = Number.POSITIVE_INFINITY;
    let fineName = '';
    let coarseName = '';
    for (let iz = 0; iz < grid.size; iz += 1) {
      const z = (grid.origin[1] as number) + (iz + 0.5) * grid.cell;
      const row = iz * grid.size;
      for (let ix = 0; ix < grid.size; ix += 1) {
        const fine = regionOfId(grid.ids[row + ix] as number)?.name;
        if (fine === undefined) continue;
        const x = (grid.origin[0] as number) + (ix + 0.5) * grid.cell;
        const away = Math.hypot(x, z);
        if (away >= bestAway) continue;
        const wide = regionOfId(coarseRegionIdAt(coarse, x, z))?.name;
        if (wide === undefined || wide === fine) continue;
        bestAway = away;
        bestX = x;
        bestZ = z;
        fineName = fine;
        coarseName = wide;
      }
    }
    console.log('the point where the two grids disagree', {
      x: bestX,
      z: bestZ,
      away: bestAway,
      fine: fineName,
      coarse: coarseName,
    });

    expect(bestAway).toBeLessThan(Number.POSITIVE_INFINITY);
    // The fine grid holds the reading `findCodexRegionAt` gives, which is what
    // `regionNameAtExact` reads.
    expect(findCodexRegionAt({ x: bestX, z: bestZ })?.name).toBe(fineName);
    expect(coarseName).not.toBe(fineName);

    // `e2e/hud.spec.ts` and `e2e/regions.spec.ts` read the point to three decimal
    // places, which is well inside one 49.3494 light year cell. The three readings
    // below pin the figure and the two names those tests carry.
    const rounded = { x: -857.675, z: -1379.602 };
    expect(Math.abs(rounded.x - bestX)).toBeLessThan(0.001);
    expect(Math.abs(rounded.z - bestZ)).toBeLessThan(0.001);
    expect(findCodexRegionAt(rounded)?.name).toBe('Sanguineous Rim');
    expect(regionOfId(coarseRegionIdAt(coarse, rounded.x, rounded.z))?.name).toBe(
      'Inner Orion Spur',
    );
  });

  test('reads a cell of the trace grid, so it costs no further lookups', () => {
    const source = gridOf([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    const coarse = buildCoarseRegionGrid(source);
    expect(coarse.size).toBe(3);
    expect(coarse.cell).toBe(10);
    expect(Array.from(coarse.ids)).toEqual(Array.from(source.ids));
    expect(coarseRegionIdAt(coarse, -1, 0)).toBe(0);
    expect(coarseRegionIdAt(coarse, 5, 25)).toBe(7);
  });
});

describe('the traced set', () => {
  test('keeps a node only where the direction changes', () => {
    // A straight run of five nodes collapses to its two ends, and a corner stays.
    const straight = Float64Array.from([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
    expect(Array.from(collapseChain(straight))).toEqual([0, 0, 4, 0]);

    const corner = Float64Array.from([0, 0, 1, 0, 2, 0, 2, 1, 2, 2]);
    expect(Array.from(collapseChain(corner))).toEqual([0, 0, 2, 0, 2, 2]);

    // A chain of two nodes has no interior node to drop.
    const pair = Float64Array.from([3, 4, 3, 5]);
    expect(Array.from(collapseChain(pair))).toEqual([3, 4, 3, 5]);
  });

  test('the traced set stays near the data', () => {
    let toMidpoints = 0;
    let toLattice = 0;
    let smoothedToMidpoints = 0;
    let apart = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const midpoints = indexSegments(midpointPolyline(grid, index));
      const lattice = indexSegments(tracedPolyline(grid, index));
      const drawn = drawnPolyline(traced, index);
      toMidpoints = Math.max(toMidpoints, worstDeparture(drawn, midpoints));
      toLattice = Math.max(toLattice, worstDeparture(drawn, lattice));
      const smoothed = drawnPolyline(lines, index);
      smoothedToMidpoints = Math.max(
        smoothedToMidpoints,
        worstDeparture(smoothed, midpoints),
      );
      // The two drawn sets both depart from the lattice polyline, so their separation is
      // bounded by two cells and not by one.
      apart = Math.max(
        apart,
        worstDeparture(drawn, indexSegments(smoothed)),
        worstDeparture(smoothed, indexSegments(drawn)),
      );
    }
    console.log('the departure of the traced set', {
      toMidpoints,
      toLattice,
      smoothedToMidpoints,
      apart,
    });
    expect(toMidpoints).toBeLessThanOrEqual(DEPARTURE_LIMIT);
    expect(toLattice).toBeLessThanOrEqual(DEPARTURE_LIMIT);
    expect(apart).toBeLessThanOrEqual(2 * DEPARTURE_LIMIT);
  }, 300000);

  test('the traced set reads as a line', () => {
    const drawn = roughnessOfSet(
      (index) => drawnPolyline(traced, index),
      traced.chainCount,
      REGION_CELL_LY,
    );
    const lattice = roughnessOfSet(
      (index) => tracedPolyline(grid, index),
      trace.chains.length,
      REGION_CELL_LY,
    );
    const smoothed = roughnessOfSet(
      (index) => drawnPolyline(lines, index),
      lines.chainCount,
      REGION_CELL_LY,
    );
    console.log('the roughness in cells', { drawn, lattice, smoothed });
    console.log('the roughness in CSS pixels at 10,000 light years on 1,080 rows', {
      drawnMedian: drawn.median * CELL_CSS_PIXELS,
      latticeMedian: lattice.median * CELL_CSS_PIXELS,
      smoothedMedian: smoothed.median * CELL_CSS_PIXELS,
    });

    expect(drawn.median).toBeLessThanOrEqual(0.03);
    expect(drawn.ninetieth).toBeLessThanOrEqual(0.08);
    expect(lattice.median).toBeGreaterThan(0.25);
    expect(lattice.ninetieth).toBeGreaterThan(0.25);
  }, 120000);

  test('the traced set keeps the corners the smoothed set removes', () => {
    const sharpest = sharpestVertexOf(traced);
    const smoothed = sharpestVertexOf(lines);
    console.log('the sharpest vertex turns', { sharpest, smoothed });
    expect(sharpest).toBeGreaterThan(25);
    expect(sharpest).toBeGreaterThan(smoothed);
    expect(smoothed).toBeLessThanOrEqual(20);
  });

  test('the traced set holds the turn bounds of a line', () => {
    let drawnTurn = 0;
    let drawnLength = 0;
    let worstChain = 0;
    for (let index = 0; index < traced.chainCount; index += 1) {
      const drawn = turnOf(drawnPolyline(traced, index));
      drawnTurn += drawn.turn;
      drawnLength += drawn.length;
      if (drawn.length > 0) {
        worstChain = Math.max(worstChain, (drawn.turn / drawn.length) * 1000);
      }
    }
    const drawnPer = (drawnTurn / drawnLength) * 1000;
    console.log('the turn of the traced set for each 1,000 light years', {
      drawnPer,
      worstChain,
    });
    expect(drawnPer).toBeLessThanOrEqual(60);
    expect(worstChain).toBeLessThanOrEqual(100);
  });

  test('drops the straight runs', () => {
    let nodeCount = 0;
    for (const chain of trace.chains) nodeCount += chain.nodes.length / 2;
    const segments: number[] = [];
    for (let index = 0; index < traced.chainCount; index += 1) {
      const drawn = drawnPolyline(traced, index);
      for (let read = 0; read + 3 < drawn.length; read += 2) {
        segments.push(
          Math.hypot(
            (drawn[read + 2] as number) - (drawn[read] as number),
            (drawn[read + 3] as number) - (drawn[read + 1] as number),
          ),
        );
      }
    }
    console.log('the traced set holds', traced.vertexCount, 'of', nodeCount, 'nodes', {
      kiB: traced.positions.byteLength / 1024,
      medianSegmentLy: quantileOf(segments, 0.5),
      segments: segments.length,
    });

    // The bound is a range and not the reading, so a package release that redraws a
    // region fails "The package constants hold" and not this test.
    expect(traced.vertexCount).toBeGreaterThanOrEqual(4000);
    expect(traced.vertexCount).toBeLessThanOrEqual(12000);
    expect(traced.vertexCount).toBeLessThan(nodeCount);
    expect(traced.vertexCount).toBeLessThan(lines.vertexCount);
    expect(traced.positions.length).toBe(traced.vertexCount * 3);
    expect(traced.first.length).toBe(traced.chainCount);
    expect(traced.last.length).toBe(traced.chainCount);
  });

  test('draws every chain on the plane', () => {
    for (let vertex = 0; vertex < traced.vertexCount; vertex += 1) {
      expect(traced.positions[vertex * 3 + 1]).toBe(0);
    }
    let previous = -1;
    for (let index = 0; index < traced.chainCount; index += 1) {
      expect(traced.first[index]).toBe(previous + 1);
      previous = traced.last[index] as number;
    }
    expect(previous).toBe(traced.vertexCount - 1);
  });

  test('comes from the same trace as the smoothed set, and is deterministic', () => {
    const data = buildRegionData();
    expect(data.traced.chainCount).toBe(data.lines.chainCount);
    expect(data.traced.chainCount).toBe(traced.chainCount);
    expect(data.traced.vertexCount).toBe(traced.vertexCount);
    expect(new Uint8Array(data.traced.positions.buffer)).toEqual(
      new Uint8Array(traced.positions.buffer),
    );
    expect(new Uint8Array(data.traced.first.buffer)).toEqual(
      new Uint8Array(traced.first.buffer),
    );
    expect(new Uint8Array(data.traced.last.buffer)).toEqual(
      new Uint8Array(traced.last.buffer),
    );
  }, 240000);
});

describe('the region flow field', () => {
  /** The cell index of a plane point on the coarse grid, as `ix` then `iz`. */
  function cellOf(
    onGrid: CoarseRegionGrid,
    x: number,
    z: number,
  ): readonly [number, number] {
    return [
      Math.floor((x - (onGrid.origin[0] as number)) / onGrid.cell),
      Math.floor((z - (onGrid.origin[1] as number)) / onGrid.cell),
    ] as const;
  }

  test('every step stays on its own region', () => {
    const size = coarse.size;
    let steps = 0;
    // The loop reads all 257,049 cells. A call to `expect` for each one costs seconds on a
    // slow machine, and the test then goes past the 5 second limit. The loop therefore
    // keeps the first fault it finds, and the assertions run once after it. The reading is
    // the same, and the message names the cell.
    let fault: string | null = null;
    for (let iz = 0; iz < size; iz += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const at = iz * size + ix;
        const id = coarse.ids[at] as number;
        if (id === NO_REGION_ID) continue;
        const byte = flow[at] as number;
        if (byte === REGION_FLOW_END) continue;
        const move = REGION_FLOW_STEPS[byte] as readonly [number, number];
        const nextX = ix + move[0];
        const nextZ = iz + move[1];
        if (nextX < 0 || nextZ < 0 || nextX >= size || nextZ >= size) {
          fault ??= `the step from ${ix},${iz} goes off the grid to ${nextX},${nextZ}`;
          continue;
        }
        const nextId = coarse.ids[nextZ * size + nextX] as number;
        if (nextId !== id) {
          fault ??= `the step from ${ix},${iz} leaves region ${id} for region ${nextId}`;
          continue;
        }
        steps += 1;
      }
    }
    console.log('the flow field holds', steps, 'steps of', flow.length, 'cells');
    expect(fault).toBeNull();
    expect(steps).toBeGreaterThan(0);
  });

  test('a cell that holds no region names no step', () => {
    // One assertion after the loop, for the reason the test above gives.
    let fault: string | null = null;
    for (let at = 0; at < flow.length; at += 1) {
      if ((coarse.ids[at] as number) !== NO_REGION_ID) continue;
      if ((flow[at] as number) === REGION_FLOW_END) continue;
      fault ??= `cell ${at} holds no region and names the step ${String(flow[at])}`;
    }
    expect(fault).toBeNull();
  });

  test('following the field reaches the centre', () => {
    const size = coarse.size;
    // The end of the walk from each cell, held so each cell is walked once. -2 means the
    // cell has not been read yet.
    const ends = new Int32Array(flow.length).fill(-2);
    const stamp = new Int32Array(flow.length).fill(-1);
    const path: number[] = [];
    let looped = 0;
    let offRoot = 0;
    let atOnce = 0;
    let walked = 0;

    for (let start = 0; start < flow.length; start += 1) {
      if ((coarse.ids[start] as number) === NO_REGION_ID) continue;
      if ((ends[start] as number) !== -2) continue;
      path.length = 0;
      let at = start;
      while ((ends[at] as number) === -2 && (flow[at] as number) !== REGION_FLOW_END) {
        if ((stamp[at] as number) === start) {
          looped += 1;
          break;
        }
        stamp[at] = start;
        path.push(at);
        const move = REGION_FLOW_STEPS[flow[at] as number] as readonly [number, number];
        const ix = at % size;
        const iz = (at - ix) / size;
        at = (iz + move[1]) * size + (ix + move[0]);
      }
      const end = (ends[at] as number) === -2 ? at : (ends[at] as number);
      ends[at] = end;
      for (const cell of path) ends[cell] = end;
    }

    for (let start = 0; start < flow.length; start += 1) {
      const id = coarse.ids[start] as number;
      if (id === NO_REGION_ID) continue;
      const end = ends[start] as number;
      walked += 1;
      if (end === start) {
        // A cell the build never reached, or the root itself, ends at once on itself.
        atOnce += 1;
        if ((flow[start] as number) !== REGION_FLOW_END) offRoot += 1;
        continue;
      }
      if (end !== (roots[id] as number)) offRoot += 1;
    }

    console.log('the field walks', walked, 'cells and ends at once on', atOnce);
    // No walk visits a cell twice, and every walk that moves ends at its region's root.
    expect(looped).toBe(0);
    expect(offRoot).toBe(0);
    expect(walked).toBeGreaterThan(0);
  }, 120000);

  test('the shipped data has no region the field cannot cross', () => {
    const size = coarse.size;
    const stranded = new Int32Array(REGION_COUNT + 1);
    for (let at = 0; at < flow.length; at += 1) {
      const id = coarse.ids[at] as number;
      if (id === NO_REGION_ID) continue;
      if ((flow[at] as number) !== REGION_FLOW_END) continue;
      if (at === (roots[id] as number)) continue;
      stranded[id] = (stranded[id] as number) + 1;
    }
    const counts = Array.from(stranded.slice(1));
    console.log('the cells no walk reached, by region id', counts);
    expect(size).toBe(507);
    for (let id = 1; id <= REGION_COUNT; id += 1) {
      expect(stranded[id]).toBe(0);
    }
  });

  test('the field crosses a region that lies in the way', () => {
    // The region of id 1 is two lobes joined by a neck at `ix` 0, and the region of id 2
    // fills the gap between them. A straight line from the far lobe to the near one
    // crosses the second region, so only a walk through the neck stays on its own.
    const rows = [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 2, 2, 2],
      [1, 2, 2, 2, 2, 2, 2],
      [1, 2, 2, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ];
    const size = 9;
    const cell = 200;
    const centroid = regionOfId(1)?.centroid as readonly [number, number];
    // The grid is placed so that the centroid of the region of id 1 sits at the middle
    // of the cell (3, 1), which is in the near lobe, so that cell is the root.
    const toy: CoarseRegionGrid = {
      size,
      origin: [centroid[0] - 3.5 * cell, centroid[1] - 1.5 * cell] as const,
      cell,
      ids: new Uint8Array(size * size),
    };
    for (let iz = 0; iz < size; iz += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        toy.ids[iz * size + ix] = ix < 7 ? ((rows[iz] as number[])[ix] as number) : 0;
      }
    }

    const toyRoots = regionFlowRoots(toy);
    expect(toyRoots[1]).toBe(1 * size + 3);
    const toyFlow = buildRegionFlow(toy);

    let at = 7 * size + 3;
    const visited: number[] = [at];
    while ((toyFlow[at] as number) !== REGION_FLOW_END) {
      const move = REGION_FLOW_STEPS[toyFlow[at] as number] as readonly [
        number,
        number,
      ];
      const ix = at % size;
      const iz = (at - ix) / size;
      at = (iz + move[1]) * size + (ix + move[0]);
      visited.push(at);
      expect(visited.length).toBeLessThanOrEqual(size * size);
    }
    expect(at).toBe(toyRoots[1]);
    for (const step of visited) expect(toy.ids[step]).toBe(1);
    // The walk goes through the neck, which is the column `ix` 0 at the rows 3, 4 and 5.
    for (const row of [3, 4, 5]) {
      expect(visited).toContain(row * size + 0);
    }
  });

  test('the reader turns a byte into a unit step on the plane', () => {
    const cell = 200;
    const toy: CoarseRegionGrid = {
      size: 3,
      origin: [0, 0] as const,
      cell,
      ids: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    };
    const field = Uint8Array.from([0, 1, 2, 3, REGION_FLOW_END, 5, 6, 7, 4]);
    const at = (ix: number, iz: number): readonly [number, number] =>
      [(ix + 0.5) * cell, (iz + 0.5) * cell] as const;
    const read = (ix: number, iz: number): readonly [number, number] | null => {
      const point = at(ix, iz);
      return coarseRegionFlowStepAt(toy, field, point[0], point[1]);
    };
    expect(read(0, 0)).toEqual([1, 0]);
    expect(read(2, 0)?.[0]).toBeCloseTo(0, 12);
    expect(read(2, 0)?.[1]).toBeCloseTo(-1, 12);
    expect(read(1, 1)).toBeNull();
    const slanted = read(1, 0) as readonly [number, number];
    expect(Math.hypot(slanted[0], slanted[1])).toBeCloseTo(1, 12);
    // A point outside the grid names no step and does not throw.
    expect(coarseRegionFlowStepAt(toy, field, -10, 0)).toBeNull();
  });

  test('the field is sent with the boundary sets', () => {
    const data = buildRegionData();
    expect(data.flow).toBeInstanceOf(Uint8Array);
    expect(data.flow.length).toBe(data.grid.size * data.grid.size);
    expect(data.grid.size).toBe(507);
    const transfers = regionResponseTransferables({
      lines: data.lines,
      traced: data.traced,
      grid: data.grid,
      flow: data.flow,
    });
    expect(transfers).toContain(data.flow.buffer);
    expect(transfers).toContain(data.grid.ids.buffer);
  }, 240000);

  test('the field costs the build nothing measurable', () => {
    const started = performance.now();
    const field = buildRegionFlow(coarse);
    const spent = performance.now() - started;
    console.log('the flow field build took', spent.toFixed(1), 'milliseconds');
    expect(field.length).toBe(flow.length);
    expect(spent).toBeLessThan(2000);
  });

  test('a cell reads its own region on the reader', () => {
    // The reader and the id lookup take one point the same way, so a label reads the
    // step of the region it is standing on.
    const point = cellOf(coarse, 0, 0);
    expect(point[0]).toBeGreaterThanOrEqual(0);
    expect(coarseRegionIdAt(coarse, 0, 0)).toBe(
      coarse.ids[point[1] * coarse.size + point[0]],
    );
  });
});
