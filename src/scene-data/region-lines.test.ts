import { beforeAll, describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { regionLinesTransferables } from './messages';
import {
  buildCoarseRegionGrid,
  buildRegionData,
  buildRegionLines,
  chainPoints,
  collapseChain,
  fillRegionGrid,
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
  averageChain,
  capChain,
  roundChain,
  simplifyChain,
  traceRegionChains,
  traceRegionLines,
} from './region-lines';
import type { RegionGrid, RegionTrace, TracedChain } from './region-lines';
import { coarseRegionIdAt, regionOfId } from './regions';
import type { RegionLines } from './types';

/** The departure bound the spec states, in light years. It is one cell. */
const DEPARTURE_LIMIT = REGION_DEPARTURE_LY;

let grid: RegionGrid;
let trace: RegionTrace;
let lines: RegionLines;
let traced: RegionLines;

beforeAll(() => {
  grid = fillRegionGrid();
  trace = traceRegionChains(grid);
  lines = packRegionLines(grid, trace);
  traced = packTracedLines(grid, trace);
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

  test('departs from the traced boundary by nothing', () => {
    let drawnToTraced = 0;
    let tracedToDrawn = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const nodes = tracedPolyline(grid, index);
      const drawn = drawnPolyline(traced, index);
      drawnToTraced = Math.max(
        drawnToTraced,
        worstGap(drawn, indexSegments(nodes), 0).measured,
      );
      tracedToDrawn = Math.max(
        tracedToDrawn,
        worstGap(nodes, indexSegments(drawn), 0).measured,
      );
    }
    console.log('the departure of the traced set', { drawnToTraced, tracedToDrawn });
    // The packed set holds `float32` coordinates. One step of a `float32` near 50,000 is
    // 0.0078 light years, so a node can land half a step from where the trace put it and
    // the departure of an exact packer is not 0 but a fraction of one step.
    expect(drawnToTraced).toBeLessThanOrEqual(0.01);
    expect(tracedToDrawn).toBeLessThanOrEqual(0.01);
  }, 300000);

  test('keeps every turn', () => {
    let drawnTurn = 0;
    let drawnLength = 0;
    let nodeTurn = 0;
    let nodeLength = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const drawn = turnOf(drawnPolyline(traced, index));
      drawnTurn += drawn.turn;
      drawnLength += drawn.length;
      const nodes = turnOf(tracedPolyline(grid, index));
      nodeTurn += nodes.turn;
      nodeLength += nodes.length;
    }
    const drawnPer = (drawnTurn / drawnLength) * 1000;
    const nodePer = (nodeTurn / nodeLength) * 1000;
    console.log('the turn of the traced set', { drawnPer, nodePer });

    // Collapsing the straight runs removes no turn and no length. The two readings part
    // only by the `float32` rounding of the packed coordinates, so the bound is relative.
    expect(Math.abs(drawnPer - nodePer) / nodePer).toBeLessThanOrEqual(1e-6);
    expect(drawnPer).toBeGreaterThan(1000);
  });

  test('drops the straight runs', () => {
    let nodeCount = 0;
    for (const chain of trace.chains) nodeCount += chain.nodes.length / 2;
    console.log('the traced set holds', traced.vertexCount, 'of', nodeCount, 'nodes', {
      kiB: traced.positions.byteLength / 1024,
    });

    // The bound is a range and not the reading, so a package release that redraws a
    // region fails "The package constants hold" and not this test.
    expect(traced.vertexCount).toBeGreaterThanOrEqual(15000);
    expect(traced.vertexCount).toBeLessThanOrEqual(40000);
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
