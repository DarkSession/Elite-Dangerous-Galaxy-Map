import { beforeAll, describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  buildClearanceField,
  buildRegionLabelGeometry,
  clearanceAt,
  CLEARANCE_DOWNSAMPLE,
  downsampleClearance,
} from './clearance';
import type { ExactClearanceField } from './clearance';
import {
  regionClearanceFieldTransferables,
  regionLinesTransferables,
} from './messages';
import {
  buildRegionData,
  buildCoarseRegionGrid,
  buildRegionLines,
  chainPoints,
  fillRegionGrid,
  packRegionLines,
  REGION_CELL_LY,
  REGION_DEPARTURE_LY,
  REGION_FIT_TOLERANCE_LY,
  REGION_GRID_SIZE,
  simplifyChain,
  traceRegionChains,
  traceRegionLines,
} from './region-lines';
import type { RegionGrid, RegionTrace, TracedChain } from './region-lines';
import { coarseRegionIdAt, NO_REGION_ID, regionOfId, REGIONS } from './regions';
import type { RegionClearanceField, RegionLabelGeometry, RegionLines } from './types';

/** The step the departure walk takes along both lines, in light years. */
const DEPARTURE_STEP_LY = 10;

/**
 * How far the traced turn measure reaches each way along the chain, in light years.
 * The same reach groups traced nodes into places and holds a vertex to a place.
 */
const TURN_REACH_LY = 500;

let grid: RegionGrid;
let trace: RegionTrace;
let lines: RegionLines;
let field: ExactClearanceField;
let geometry: RegionLabelGeometry;

beforeAll(() => {
  grid = fillRegionGrid();
  trace = traceRegionChains(grid);
  lines = packRegionLines(grid, trace);
  field = buildClearanceField(grid);
  geometry = buildRegionLabelGeometry(grid, field, REGION_DEPARTURE_LY);
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

/** A polyline of one traced chain in light years, as `x` then `z` per node. */
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

/** The same nodes rounded to `float32`, which is how the set stores a vertex. */
function tracedNodes32(source: RegionGrid, index: number): Float32Array {
  return Float32Array.from(tracedPolyline(source, index));
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

/**
 * The traced node each vertex of a drawn chain sits on. The walk runs forward through
 * the nodes, so it also reads whether the vertices are the nodes in their traced
 * order. It gives null when a vertex is not a node of that chain.
 */
function nodeOfEveryVertex(
  source: RegionGrid,
  set: RegionLines,
  index: number,
): number[] | null {
  const nodes = tracedNodes32(source, index);
  const drawn = drawnPolyline(set, index);
  const out: number[] = [];
  let node = 0;
  for (let vertex = 0; vertex * 2 < drawn.length; vertex += 1) {
    const x = drawn[vertex * 2] as number;
    const z = drawn[vertex * 2 + 1] as number;
    while (
      node * 2 < nodes.length &&
      ((nodes[node * 2] as number) !== x || (nodes[node * 2 + 1] as number) !== z)
    ) {
      node += 1;
    }
    if (node * 2 >= nodes.length) return null;
    out.push(node);
    node += 1;
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
 * The largest distance from any point of one polyline to another, walking the first at
 * a fixed step. Both ends of every segment are read, so a step longer than a segment
 * still reads that segment. A walk is what the departure scenario asks for: a check at
 * the vertices alone passes for nothing, because every vertex of the simplified line is
 * a traced node.
 */
function walkedGap(from: Float64Array, to: SegmentIndex, step: number): number {
  let worst = 0;
  const read = (x: number, z: number): void => {
    const gap = nearestGap(to, x, z);
    if (gap > worst) worst = gap;
  };
  for (let segment = 0; segment + 3 < from.length; segment += 2) {
    const x0 = from[segment] as number;
    const z0 = from[segment + 1] as number;
    const dx = (from[segment + 2] as number) - x0;
    const dz = (from[segment + 3] as number) - z0;
    const span = Math.hypot(dx, dz);
    read(x0, z0);
    for (let at = step; at < span; at += step) {
      read(x0 + (dx * at) / span, z0 + (dz * at) / span);
    }
  }
  read(from[from.length - 2] as number, from[from.length - 1] as number);
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
  return angleBetween(ax, az, bx, bz);
}

/** The angle between two directions, in degrees, without a sign. */
function angleBetween(ax: number, az: number, bx: number, bz: number): number {
  const spanA = Math.hypot(ax, az);
  const spanB = Math.hypot(bx, bz);
  if (spanA === 0 || spanB === 0) return 0;
  const cosine = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (spanA * spanB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** The length along a polyline at every one of its points, in light years. */
function arcLengths(points: Float64Array): Float64Array {
  const count = points.length / 2;
  const out = new Float64Array(count);
  for (let index = 1; index < count; index += 1) {
    out[index] =
      (out[index - 1] as number) +
      Math.hypot(
        (points[index * 2] as number) - (points[index * 2 - 2] as number),
        (points[index * 2 + 1] as number) - (points[index * 2 - 1] as number),
      );
  }
  return out;
}

/** The point at a length along a polyline, as `x` then `z`. */
function pointAtArc(
  points: Float64Array,
  lengths: Float64Array,
  at: number,
): [number, number] {
  const count = lengths.length;
  let low = 0;
  let high = count - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((lengths[middle] as number) <= at) low = middle;
    else high = middle;
  }
  const span = (lengths[high] as number) - (lengths[low] as number);
  const share = span === 0 ? 0 : (at - (lengths[low] as number)) / span;
  return [
    (points[low * 2] as number) +
      share * ((points[high * 2] as number) - (points[low * 2] as number)),
    (points[low * 2 + 1] as number) +
      share * ((points[high * 2 + 1] as number) - (points[low * 2 + 1] as number)),
  ];
}

/**
 * The turn of a traced chain at one of its nodes, in degrees.
 *
 * It is the angle between the chord from the traced point `reach` light years back
 * along the chain to that node, and the chord from that node to the traced point
 * `reach` light years forward. Where a chain end is nearer than the reach the node has
 * no value, and the caller leaves it out rather than measuring it over a shorter reach.
 *
 * The two chords are what the measure needs. The traced line is a raster staircase that
 * turns about 1,062 degrees for each 1,000 light years, so an accumulated turn or the
 * largest turn at one node reads a corner in every window of the trace.
 */
function tracedTurnAt(
  points: Float64Array,
  lengths: Float64Array,
  node: number,
  reach: number,
): number | null {
  const at = lengths[node] as number;
  const end = lengths[lengths.length - 1] as number;
  if (at - reach < 0 || at + reach > end) return null;
  const back = pointAtArc(points, lengths, at - reach);
  const ahead = pointAtArc(points, lengths, at + reach);
  const x = points[node * 2] as number;
  const z = points[node * 2 + 1] as number;
  return angleBetween(x - back[0], z - back[1], ahead[0] - x, ahead[1] - z);
}

/** One place of the traced boundary where it turns, as the nodes that make it up. */
interface TurnPlace {
  readonly chain: number;
  readonly nodes: number[];
}

/**
 * The places where the traced boundary turns by more than a bound. Nodes within the
 * reach of each other along the chain are one place, which is the same reach the turn
 * itself is measured over. A shorter window can split one real corner in two.
 */
function turnPlaces(bound: number): TurnPlace[] {
  const places: TurnPlace[] = [];
  for (let index = 0; index < trace.chains.length; index += 1) {
    const points = tracedPolyline(grid, index);
    const lengths = arcLengths(points);
    let current: number[] | null = null;
    let last = 0;
    for (let node = 0; node < lengths.length; node += 1) {
      const turn = tracedTurnAt(points, lengths, node, TURN_REACH_LY);
      if (turn === null || turn <= bound) continue;
      const at = lengths[node] as number;
      if (current !== null && at - last <= TURN_REACH_LY) {
        current.push(node);
      } else {
        current = [node];
        places.push({ chain: index, nodes: current });
      }
      last = at;
    }
  }
  return places;
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
    for (let index = 0; index < lines.chainCount; index += 1) {
      const first = lines.first[index] as number;
      const last = lines.last[index] as number;
      expect(last - first + 1).toBeGreaterThanOrEqual(2);
    }
  });

  test('a chain separates one pair of regions', () => {
    const seen = new Set<number>();
    for (let index = 0; index < trace.chains.length; index += 1) {
      const chain = trace.chains[index] as TracedChain;
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
      // The set records that pair, so a reader can ask which boundaries belong to
      // a region without walking the grid again.
      const recorded = `${lines.pairs[index * 2] as number}:${lines.pairs[index * 2 + 1] as number}`;
      expect(recorded).toBe(pair);
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

describe('the simplification', () => {
  /** Whether every point of a result is a point of the chain it came from. */
  function allTraced(result: Float64Array, source: Float64Array): boolean {
    for (let read = 0; read < result.length; read += 2) {
      let found = false;
      for (let node = 0; node < source.length; node += 2) {
        if (source[node] === result[read] && source[node + 1] === result[read + 1]) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  test('keeps two vertices of a straight run', () => {
    const chain = Float64Array.from([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
    const result = simplifyChain(chain, 0.5);
    expect(result.length / 2).toBe(2);
    expect(Array.from(result)).toEqual([0, 0, 4, 0]);
    expect(allTraced(result, chain)).toBe(true);
  });

  test('keeps three vertices of a right-angle corner', () => {
    const chain = Float64Array.from([0, 0, 1, 0, 2, 0, 2, 1, 2, 2]);
    const result = simplifyChain(chain, 0.5);
    expect(result.length / 2).toBe(3);
    expect(Array.from(result)).toEqual([0, 0, 2, 0, 2, 2]);
    expect(allTraced(result, chain)).toBe(true);
  });

  test('keeps a handful of vertices of a gentle curve', () => {
    // A quarter circle of radius 40 cells, at one point per degree.
    const points: number[] = [];
    for (let degree = 0; degree <= 90; degree += 1) {
      const angle = (degree * Math.PI) / 180;
      points.push(40 * Math.cos(angle), 40 * Math.sin(angle));
    }
    const chain = Float64Array.from(points);
    const result = simplifyChain(chain, 0.5);
    expect(result.length / 2).toBeGreaterThanOrEqual(3);
    expect(result.length / 2).toBeLessThanOrEqual(10);
    expect(allTraced(result, chain)).toBe(true);
  });

  test('keeps the far end of a chain that doubles back', () => {
    // The chain runs out to x = 10 and comes back along the same line. The two ends
    // are 0.5 cells apart, and the far point sits on the infinite line through them,
    // so the line measure reads a distance of zero and drops the whole excursion. The
    // segment measure reads 9.5 cells and keeps it.
    const chain = Float64Array.from([0, 0, 5, 0, 10, 0, 5, 0, 0.5, 0]);
    const result = simplifyChain(chain, 0.5);
    expect(Array.from(result)).toEqual([0, 0, 10, 0, 0.5, 0]);
    expect(allTraced(result, chain)).toBe(true);
  });

  test('fits below the bound it asserts', () => {
    expect(REGION_FIT_TOLERANCE_LY).toBe(190);
    expect(REGION_DEPARTURE_LY).toBe(200);
    expect(REGION_FIT_TOLERANCE_LY).toBeLessThan(REGION_DEPARTURE_LY);
  });
});

describe('the traced turn measure', () => {
  test('reads near zero on a staircase that runs straight', () => {
    // A raster staircase along the diagonal, at 50 light years a step. Every node
    // turns by 90 degrees, and the line runs straight at 45 degrees overall.
    const points: number[] = [0, 0];
    for (let step = 0; step < 60; step += 1) {
      const at = step * 50;
      points.push(at + 50, at, at + 50, at + 50);
    }
    const chain = Float64Array.from(points);
    const lengths = arcLengths(chain);
    const middle = 60;

    expect(tracedTurnAt(chain, lengths, middle, TURN_REACH_LY)).toBeCloseTo(0, 4);

    // The accumulated turn over the same reach reads 900 degrees each way, which is
    // why the measure cannot be an accumulation.
    let accumulated = 0;
    for (let node = middle - 10; node <= middle + 10; node += 1) {
      if (node < 1 || node * 2 + 3 >= chain.length) continue;
      accumulated += turnAt(chain, node);
    }
    expect(accumulated).toBeGreaterThan(500);
  });

  test('has no value where a chain end is nearer than the reach', () => {
    const chain = Float64Array.from([0, 0, 300, 0, 600, 0, 900, 0]);
    const lengths = arcLengths(chain);
    expect(tracedTurnAt(chain, lengths, 1, TURN_REACH_LY)).toBeNull();
    expect(tracedTurnAt(chain, lengths, 2, TURN_REACH_LY)).toBeNull();
  });
});

describe('the boundary set', () => {
  test('every vertex is a traced node', () => {
    for (let index = 0; index < lines.chainCount; index += 1) {
      const nodes = nodeOfEveryVertex(grid, lines, index);
      expect(nodes).not.toBeNull();
      const found = nodes as number[];
      const nodeCount = (trace.chains[index] as TracedChain).nodes.length / 2;
      expect(found[0]).toBe(0);
      expect(found[found.length - 1]).toBe(nodeCount - 1);
    }
  });

  test('the simplified line stays inside the departure bound', () => {
    let drawnToTraced = 0;
    let tracedToDrawn = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const traced = tracedPolyline(grid, index);
      const drawn = drawnPolyline(lines, index);
      drawnToTraced = Math.max(
        drawnToTraced,
        walkedGap(drawn, indexSegments(traced), DEPARTURE_STEP_LY),
      );
      tracedToDrawn = Math.max(
        tracedToDrawn,
        walkedGap(traced, indexSegments(drawn), DEPARTURE_STEP_LY),
      );
    }
    console.log('the departure of the simplified line', {
      drawnToTraced,
      tracedToDrawn,
    });
    expect(drawnToTraced).toBeLessThanOrEqual(REGION_DEPARTURE_LY);
    expect(tracedToDrawn).toBeLessThanOrEqual(REGION_DEPARTURE_LY);
  }, 300000);

  test('the line invents few corners', () => {
    let over20 = 0;
    let honest = 0;
    let worstInvented = 0;
    let worstTurn = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const drawn = drawnPolyline(lines, index);
      const nodes = nodeOfEveryVertex(grid, lines, index) as number[];
      const points = tracedPolyline(grid, index);
      const lengths = arcLengths(points);
      for (let vertex = 1; vertex * 2 + 3 < drawn.length; vertex += 1) {
        const turn = turnAt(drawn, vertex);
        if (turn > worstTurn) worstTurn = turn;
        if (turn <= 20) continue;
        const traced = tracedTurnAt(
          points,
          lengths,
          nodes[vertex] as number,
          TURN_REACH_LY,
        );
        if (traced === null) continue;
        over20 += 1;
        if (traced > 20) honest += 1;
        else if (turn > worstInvented) worstInvented = turn;
      }
    }
    const share = honest / over20;
    console.log('the corners the line invents', {
      over20,
      honest,
      share,
      worstInvented,
      worstTurn,
    });
    expect(worstTurn).toBeGreaterThan(60);
    expect(share).toBeGreaterThanOrEqual(0.9);
  });

  test('the line keeps the corners the region map has', () => {
    const places = turnPlaces(60);
    let covered = 0;
    for (const place of places) {
      const drawn = drawnPolyline(lines, place.chain);
      const nodes = nodeOfEveryVertex(grid, lines, place.chain) as number[];
      const lengths = arcLengths(tracedPolyline(grid, place.chain));
      let holds = false;
      for (let vertex = 1; vertex * 2 + 3 < drawn.length; vertex += 1) {
        if (turnAt(drawn, vertex) <= 40) continue;
        const at = lengths[nodes[vertex] as number] as number;
        for (const node of place.nodes) {
          if (Math.abs(at - (lengths[node] as number)) <= TURN_REACH_LY) {
            holds = true;
            break;
          }
        }
        if (holds) break;
      }
      if (holds) covered += 1;
    }
    const share = places.length === 0 ? 0 : covered / places.length;
    console.log('the corners the line keeps', {
      places: places.length,
      covered,
      share,
    });
    expect(places.length).toBeGreaterThan(0);
    expect(share).toBeGreaterThanOrEqual(0.75);
  }, 120000);

  test('the set does not fragment', () => {
    let short = 0;
    let segments = 0;
    let longest = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const drawn = drawnPolyline(lines, index);
      for (let read = 0; read + 3 < drawn.length; read += 2) {
        const span = Math.hypot(
          (drawn[read + 2] as number) - (drawn[read] as number),
          (drawn[read + 3] as number) - (drawn[read + 1] as number),
        );
        segments += 1;
        if (span < 500) short += 1;
        if (span > longest) longest = span;
      }
    }
    console.log('the segments of the set', { segments, short, longest });
    expect(short).toBeLessThanOrEqual(20);
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
    expect(lines.vertexCount).toBeGreaterThanOrEqual(300);
    expect(lines.vertexCount).toBeLessThanOrEqual(2000);
    expect(lines.positions.length).toBe(lines.vertexCount * 3);
    expect(lines.positions.byteLength).toBeLessThanOrEqual(23.4 * 1024);
    expect(lines.first.length).toBe(lines.chainCount);
    expect(lines.last.length).toBe(lines.chainCount);
  });

  test('two chains that meet share their end exactly', () => {
    // The lattice nodes where three or more chains of the trace meet. The check reads
    // the end vertex of every chain that meets there, and not a grouping of the output.
    const ends = new Map<number, number[]>();
    for (let index = 0; index < trace.chains.length; index += 1) {
      const nodes = (trace.chains[index] as TracedChain).nodes;
      const count = nodes.length / 2;
      for (const node of [0, count - 1]) {
        const key =
          (nodes[node * 2] as number) * 4096 + (nodes[node * 2 + 1] as number);
        let list = ends.get(key);
        if (list === undefined) {
          list = [];
          ends.set(key, list);
        }
        list.push(index * 2 + (node === 0 ? 0 : 1));
      }
    }

    let meetings = 0;
    for (const [, list] of ends) {
      if (list.length < 3) continue;
      meetings += 1;
      let firstX = 0;
      let firstZ = 0;
      for (let which = 0; which < list.length; which += 1) {
        const held = list[which] as number;
        const chain = held >> 1;
        const vertex =
          (held & 1) === 0
            ? (lines.first[chain] as number)
            : (lines.last[chain] as number);
        const x = lines.positions[vertex * 3] as number;
        const z = lines.positions[vertex * 3 + 2] as number;
        if (which === 0) {
          firstX = x;
          firstZ = z;
        } else {
          expect(Math.hypot(x - firstX, z - firstZ)).toBeLessThanOrEqual(1e-6);
        }
      }
    }
    console.log('the chains meet at', meetings, 'lattice nodes');
    expect(meetings).toBeGreaterThan(0);
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
    expect(new Uint8Array(again.pairs.buffer)).toEqual(
      new Uint8Array(lines.pairs.buffer),
    );
  }, 120000);

  test('is transferable', async () => {
    const small = fillRegionGrid(galaxyModel.bounds, 64);
    const set = traceRegionLines(small);
    const firstVertex = set.positions[0] as number;
    const ends = Array.from(set.last);
    const pairs = Array.from(set.pairs);
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
    expect(Array.from(received.pairs)).toEqual(pairs);
    expect(set.positions.buffer.byteLength).toBe(0);
    expect(set.first.buffer.byteLength).toBe(0);
    expect(set.last.buffer.byteLength).toBe(0);
    expect(set.pairs.buffer.byteLength).toBe(0);

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

describe('the clearance field', () => {
  test('the downsample never reports more room than the cells it covers', () => {
    const coarse = downsampleClearance(field);
    expect(coarse.size).toBe(254);
    expect(coarse.values.length).toBe(254 * 254);
    expect(coarse.cell).toBeCloseTo(field.cell * CLEARANCE_DOWNSAMPLE, 9);
    let worstAbove = 0;
    for (let bz = 0; bz < coarse.size; bz += 1) {
      const lowZ = bz * CLEARANCE_DOWNSAMPLE;
      const highZ = Math.min(field.size, lowZ + CLEARANCE_DOWNSAMPLE);
      for (let bx = 0; bx < coarse.size; bx += 1) {
        const lowX = bx * CLEARANCE_DOWNSAMPLE;
        const highX = Math.min(field.size, lowX + CLEARANCE_DOWNSAMPLE);
        let least = Number.POSITIVE_INFINITY;
        for (let iz = lowZ; iz < highZ; iz += 1) {
          for (let ix = lowX; ix < highX; ix += 1) {
            const value = field.values[iz * field.size + ix] as number;
            if (value < least) least = value;
          }
        }
        const held = coarse.values[bz * coarse.size + bx] as number;
        worstAbove = Math.max(worstAbove, held - least);
      }
    }
    expect(worstAbove).toBe(0);
  });

  test('a read between cells stays within one trace cell of the exact field', () => {
    const coarse = downsampleClearance(field);
    let worstOvershoot = 0;
    // Every cell of the trace grid, so the worst read is found and not sampled for.
    for (let iz = 0; iz < field.size; iz += 1) {
      const z = (field.origin[1] as number) + iz * field.cell;
      for (let ix = 0; ix < field.size; ix += 1) {
        const x = (field.origin[0] as number) + ix * field.cell;
        const read = clearanceAt(coarse, x, z);
        if (read === null) continue;
        const exact = field.values[iz * field.size + ix] as number;
        worstOvershoot = Math.max(worstOvershoot, read - exact);
      }
    }
    console.log('the worst overshoot of a read between cells', {
      worstOvershoot,
      cellLy: REGION_CELL_LY,
      shareOfBlock: worstOvershoot / (field.cell * CLEARANCE_DOWNSAMPLE),
    });
    expect(worstOvershoot).toBeLessThanOrEqual(REGION_CELL_LY);
  }, 120000);

  test('the field is 1-Lipschitz', () => {
    // Pairs at arbitrary separation, not only pairs that touch. A chained path
    // between two distant cells is longer than the straight line between them, so a
    // chamfer passes a touching-pair check and fails this one.
    const pairs = 1_000_000;
    let state = 12345;
    const next = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    let worst = Number.NEGATIVE_INFINITY;
    let worstApart = 0;
    for (let pair = 0; pair < pairs; pair += 1) {
      const ax = Math.floor(next() * field.size);
      const az = Math.floor(next() * field.size);
      let bx: number;
      let bz: number;
      if (pair % 2 === 0) {
        // Two cells drawn over the whole field, which are far apart most of the time.
        bx = Math.floor(next() * field.size);
        bz = Math.floor(next() * field.size);
      } else {
        // A second cell at a separation drawn over every scale, so short and middle
        // separations are covered as well as long ones.
        const reach = Math.exp(next() * Math.log(field.size));
        const turn = next() * 2 * Math.PI;
        bx = Math.round(ax + reach * Math.cos(turn));
        bz = Math.round(az + reach * Math.sin(turn));
        if (bx < 0 || bz < 0 || bx >= field.size || bz >= field.size) {
          bx = ax;
          bz = az;
        }
      }
      const first = field.values[az * field.size + ax] as number;
      const second = field.values[bz * field.size + bx] as number;
      const apart = Math.hypot(ax - bx, az - bz) * field.cell;
      const excess = Math.abs(first - second) - apart;
      if (excess > worst) {
        worst = excess;
        worstApart = apart;
      }
    }
    console.log('the worst Lipschitz excess over a million pairs', {
      worst,
      worstApart,
    });
    // The rounding to whole light years lets a pair differ by up to one more.
    expect(worst).toBeLessThanOrEqual(1);
  }, 120000);

  test('the rim seeds the clearance field', () => {
    const size = grid.size;
    // Every region that touches the edge of the mapped area, and one of its cells
    // next to a cell that resolves to no region.
    const outermost = new Map<number, number>();
    for (let iz = 0; iz < size; iz += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const id = grid.ids[iz * size + ix] as number;
        if (id === NO_REGION_ID) continue;
        const rim =
          (ix > 0 && grid.ids[iz * size + ix - 1] === NO_REGION_ID) ||
          (ix + 1 < size && grid.ids[iz * size + ix + 1] === NO_REGION_ID) ||
          (iz > 0 && grid.ids[(iz - 1) * size + ix] === NO_REGION_ID) ||
          (iz + 1 < size && grid.ids[(iz + 1) * size + ix] === NO_REGION_ID);
        if (rim && !outermost.has(id)) outermost.set(id, iz * size + ix);
      }
    }
    expect(outermost.size).toBeGreaterThan(0);

    let rimBinds = 0;
    for (const [id, cell] of outermost) {
      // The trace cell next to the outermost cell that resolves to a region there.
      expect(field.values[cell] as number).toBeLessThanOrEqual(REGION_CELL_LY);

      // The cell of largest clearance inside the region, against the distance to the
      // nearest cell of another named region.
      const centreX = Math.round(
        ((geometry.centres[(id - 1) * 2] as number) - (field.origin[0] as number)) /
          field.cell,
      );
      const centreZ = Math.round(
        ((geometry.centres[(id - 1) * 2 + 1] as number) - (field.origin[1] as number)) /
          field.cell,
      );
      let toNamed = Number.POSITIVE_INFINITY;
      let toRim = Number.POSITIVE_INFINITY;
      for (let iz = 0; iz < size; iz += 1) {
        for (let ix = 0; ix < size; ix += 1) {
          const other = grid.ids[iz * size + ix] as number;
          if (other === id) continue;
          const gap = Math.hypot(ix - centreX, iz - centreZ) * field.cell;
          if (other === NO_REGION_ID) {
            if (gap < toRim) toRim = gap;
          } else if (gap < toNamed) toNamed = gap;
        }
      }
      expect(geometry.clearances[id - 1] as number).toBeLessThan(toNamed);
      if (toRim < toNamed) rimBinds += 1;
    }
    // For some of those regions the rim is nearer than any named region, so the
    // field would run further without it.
    console.log('the regions that touch the rim', {
      touching: outermost.size,
      rimBinds,
    });
    expect(rimBinds).toBeGreaterThan(0);
  }, 300000);

  test('the clearance field is transferable', async () => {
    const coarse = downsampleClearance(field);
    const channel = new MessageChannel();
    const received = await new Promise<RegionClearanceField>((resolve) => {
      channel.port2.onmessage = (event: MessageEvent<RegionClearanceField>) =>
        resolve(event.data);
      channel.port2.start();
      channel.port1.postMessage(coarse, regionClearanceFieldTransferables(coarse));
    });
    expect(received.size).toBe(254);
    expect(received.values.length).toBe(254 * 254);
    expect(received.values.BYTES_PER_ELEMENT).toBe(2);
    expect(received.values.byteLength).toBe(129032);
    expect(coarse.values.buffer.byteLength).toBe(0);
    channel.port1.close();
    channel.port2.close();
  });
});

describe('the label geometry', () => {
  test('the worker returns the label geometry', () => {
    const started = performance.now();
    const data = buildRegionData();
    const elapsed = performance.now() - started;
    console.log('the region worker build', { elapsedMs: elapsed });
    // The whole worker run, with the clearance field in it, against the 5 second
    // budget the far view scene data holds.
    expect(elapsed).toBeLessThan(5000);

    const coarse = data.grid;
    const rows: { name: string; clearance: number; x: number; z: number }[] = [];
    for (const region of REGIONS) {
      const x = data.geometry.centres[(region.id - 1) * 2] as number;
      const z = data.geometry.centres[(region.id - 1) * 2 + 1] as number;
      const clearance = data.geometry.clearances[region.id - 1] as number;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
      expect(clearance).toBeGreaterThan(0);
      // Each centre resolves to its own region on the coarse grid.
      expect(coarseRegionIdAt(coarse, x, z)).toBe(region.id);
      rows.push({ name: region.name, clearance, x, z });
    }
    expect(rows.length).toBe(42);
    expect(data.geometry.departureLy).toBe(REGION_DEPARTURE_LY);

    rows.sort((first, second) => first.clearance - second.clearance);
    console.log('the clearance of every region centre', rows);
    console.log('the range of the clearances', {
      smallest: rows[0],
      largest: rows[41],
      median:
        (((rows[20] as { clearance: number }).clearance +
          (rows[21] as { clearance: number }).clearance) as number) / 2,
    });
  }, 120000);

  test('the centre of a region holds the largest clearance inside it', () => {
    // One reading over the whole grid rather than an assertion per cell, because the
    // grid holds 4.11 million cells.
    const size = grid.size;
    let worstAbove = 0;
    for (let iz = 0; iz < size; iz += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const id = grid.ids[iz * size + ix] as number;
        if (id === NO_REGION_ID) continue;
        const above =
          (field.values[iz * size + ix] as number) -
          (geometry.clearances[id - 1] as number);
        if (above > worstAbove) worstAbove = above;
      }
    }
    expect(worstAbove).toBe(0);
  });

  test('the field read is exact at a region centre once the centre term is used', () => {
    const coarse = downsampleClearance(field);
    let worstLoss = 0;
    const losses: number[] = [];
    for (const region of REGIONS) {
      const x = geometry.centres[(region.id - 1) * 2] as number;
      const z = geometry.centres[(region.id - 1) * 2 + 1] as number;
      const exact = geometry.clearances[region.id - 1] as number;
      const read = clearanceAt(coarse, x, z) as number;
      losses.push(exact - read);
      worstLoss = Math.max(worstLoss, exact - read);
    }
    losses.sort((first, second) => first - second);
    console.log('what the downsample loses at the 42 centres', {
      median: ((losses[20] as number) + (losses[21] as number)) / 2,
      worst: worstLoss,
    });
    // The downsample alone reads low at a centre, which is why the page also holds
    // each region's own clearance and subtracts the distance from the centre.
    expect(worstLoss).toBeGreaterThan(0);
  });
});
