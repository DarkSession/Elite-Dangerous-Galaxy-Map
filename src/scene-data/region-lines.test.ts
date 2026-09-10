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
  angleBetween,
  buildRegionData,
  buildCoarseRegionGrid,
  buildRegionLines,
  chainPointsLy,
  fillRegionGrid,
  fitChainArcs,
  keptVerticesLy,
  nodesOfKeptVertices,
  packRegionLines,
  pointAlong,
  polylineLengths,
  REGION_CELL_LY,
  REGION_CORNER_DEGREES,
  REGION_DEPARTURE_LY,
  REGION_FIT_TOLERANCE_LY,
  REGION_GRID_SIZE,
  simplifyChain,
  traceRegionChains,
  REGION_TANGENT_ESTIMATE,
  REGION_TURN_REACH_LY,
  traceRegionLines,
  tracedTurnAt,
} from './region-lines';
import type {
  ChainFit,
  RegionGrid,
  RegionTrace,
  TangentEstimate,
  TracedChain,
} from './region-lines';
import { arcPointAt, arcTangents, arcThrough } from './arc';
import type { Arc } from './arc';
import { coarseRegionIdAt, NO_REGION_ID, regionOfId, REGIONS } from './regions';
import type { RegionClearanceField, RegionLabelGeometry, RegionLines } from './types';

/** The step the departure walk takes along both lines, in light years. */
const DEPARTURE_STEP_LY = 10;

/** The step the faceting walk takes along the drawn line, in light years. */
const FACET_STEP_LY = 25;

/**
 * How far the traced turn measure reaches each way along the chain, in light years.
 * The same reach groups traced nodes into places and holds a vertex to a place.
 */
const TURN_REACH_LY = REGION_TURN_REACH_LY;

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
  return chainPointsLy(source, trace.chains[index] as TracedChain);
}

/** The same nodes rounded to `float32`, which is how the set stores a vertex. */
function tracedNodes32(source: RegionGrid, index: number): Float32Array {
  return Float32Array.from(tracedPolyline(source, index));
}

/** Everything one chain carries: its trace, its fit and the two read together. */
interface ChainRead {
  /** The traced nodes in light years, as `x` then `z`. */
  readonly traced: Float64Array;
  /** The length along the traced chain at each of its nodes. */
  readonly lengths: Float64Array;
  /** The arc spline the pack fits to the chain. */
  readonly fit: ChainFit;
  /** The traced node each kept vertex sits on. */
  readonly nodes: Int32Array;
  /** The length along the traced chain each fitted vertex answers to. */
  readonly at: Float64Array;
}

const reads = new Map<number, ChainRead>();

/**
 * Reads one chain. The fit is the one `packRegionLines` runs, so the flags that say
 * which vertex is a kept vertex and which is a break belong to the drawn set.
 *
 * A joint of a biarc is not a traced node, so it answers to the middle of the span it
 * lies in. That is what puts a drawn sample at a place along the traced chain.
 */
function readChain(index: number): ChainRead {
  const held = reads.get(index);
  if (held !== undefined) return held;
  const chain = trace.chains[index] as TracedChain;
  const traced = chainPointsLy(grid, chain);
  const lengths = polylineLengths(traced);
  const kept = keptVerticesLy(grid, chain);
  const fit = fitChainArcs(traced, kept);
  const nodes = nodesOfKeptVertices(traced, kept);
  const count = fit.points.length / 2;
  const at = new Float64Array(count);
  let ordinal = -1;
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (fit.kept[vertex] === 0) continue;
    ordinal += 1;
    at[vertex] = lengths[nodes[ordinal] as number] as number;
  }
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (fit.kept[vertex] === 1) continue;
    let back = vertex - 1;
    while (back >= 0 && fit.kept[back] === 0) back -= 1;
    let ahead = vertex + 1;
    while (ahead < count && fit.kept[ahead] === 0) ahead += 1;
    at[vertex] = ((at[back] as number) + (at[ahead] as number)) / 2;
  }
  const read: ChainRead = { traced, lengths, fit, nodes, at };
  reads.set(index, read);
  return read;
}

/**
 * The turn of a fitted chain at one of its vertices, in degrees, read from the fit
 * in `float64`. The packed set rounds a position to `float32`, which moves a tangent
 * by about a ten-thousandth of a degree, so a reading of the fit itself is what the
 * arithmetic of the fit can be held to.
 */
function fitTurnAt(fit: ChainFit, vertex: number, points = fit.points): number {
  const before = arcTangents(
    arcThrough(
      points[vertex * 2 - 2] as number,
      points[vertex * 2 - 1] as number,
      points[vertex * 2] as number,
      points[vertex * 2 + 1] as number,
      fit.curvature[vertex - 1] as number,
    ),
  );
  const after = arcTangents(
    arcThrough(
      points[vertex * 2] as number,
      points[vertex * 2 + 1] as number,
      points[vertex * 2 + 2] as number,
      points[vertex * 2 + 3] as number,
      fit.curvature[vertex] as number,
    ),
  );
  return angleBetween(before.endX, before.endZ, after.startX, after.startZ);
}

/** One primitive of a drawn chain, read from the packed set. */
function primitiveOf(set: RegionLines, chain: number, primitive: number): Arc {
  const vertex = (set.first[chain] as number) + primitive;
  return arcThrough(
    set.positions[vertex * 3] as number,
    set.positions[vertex * 3 + 2] as number,
    set.positions[vertex * 3 + 3] as number,
    set.positions[vertex * 3 + 5] as number,
    set.curvature[vertex] as number,
  );
}

/**
 * The turn of the drawn line at a vertex, between the direction the primitive
 * arriving there runs in and the direction the primitive leaving it runs in.
 */
function drawnTurnAt(set: RegionLines, chain: number, vertex: number): number {
  const before = arcTangents(primitiveOf(set, chain, vertex - 1));
  const after = arcTangents(primitiveOf(set, chain, vertex));
  return angleBetween(before.endX, before.endZ, after.startX, after.startZ);
}

/** One drawn chain, walked with each arc sampled along its sweep. */
interface DrawnWalk {
  /** Two values per sample, `x` then `z`, in light years. */
  readonly points: Float64Array;
  /** The length along the drawn line at each sample. */
  readonly lengths: Float64Array;
  /** The length along the traced chain each sample answers to. */
  readonly tracedAt: Float64Array;
}

/**
 * Walks one drawn chain, sampling each arc along its sweep at about the given step.
 * A reading at the ends of a primitive alone would miss the whole of the curve.
 */
function walkDrawnChain(set: RegionLines, chain: number, step: number): DrawnWalk {
  const read = readChain(chain);
  const first = set.first[chain] as number;
  const last = set.last[chain] as number;
  const points: number[] = [];
  const tracedAt: number[] = [];
  for (let vertex = first; vertex < last; vertex += 1) {
    const arc = primitiveOf(set, chain, vertex - first);
    const steps = Math.max(1, Math.ceil(arc.length / step));
    const from = read.at[vertex - first] as number;
    const to = read.at[vertex - first + 1] as number;
    for (let sub = 0; sub < steps; sub += 1) {
      const fraction = sub / steps;
      const point = arcPointAt(arc, fraction);
      points.push(point[0], point[1]);
      tracedAt.push(from + fraction * (to - from));
    }
  }
  points.push(set.positions[last * 3] as number, set.positions[last * 3 + 2] as number);
  tracedAt.push(read.at[last - first] as number);
  const walked = Float64Array.from(points);
  return {
    points: walked,
    lengths: polylineLengths(walked),
    tracedAt: Float64Array.from(tracedAt),
  };
}

/**
 * The two-chord turn of a walked line at one of its samples, in degrees. It is the
 * same measure the traced turn uses, read on the drawn line.
 */
function walkedTurnAt(walk: DrawnWalk, sample: number, reach: number): number | null {
  const at = walk.lengths[sample] as number;
  const end = walk.lengths[walk.lengths.length - 1] as number;
  if (at - reach < 0 || at + reach > end) return null;
  const back = pointAlong(walk.points, walk.lengths, at - reach);
  const ahead = pointAlong(walk.points, walk.lengths, at + reach);
  const x = walk.points[sample * 2] as number;
  const z = walk.points[sample * 2 + 1] as number;
  return angleBetween(x - back[0], z - back[1], ahead[0] - x, ahead[1] - z);
}

/**
 * The traced node each kept vertex of a drawn chain sits on. The walk runs forward
 * through the nodes, so it also reads whether the kept vertices are the nodes in their
 * traced order. It gives null when a kept vertex is not a node of that chain. A joint
 * of a biarc is a computed point, not a traced node, and is left out.
 */
function nodeOfEveryKeptVertex(
  source: RegionGrid,
  set: RegionLines,
  index: number,
): number[] | null {
  const nodes = tracedNodes32(source, index);
  const read = readChain(index);
  const first = set.first[index] as number;
  const out: number[] = [];
  let node = 0;
  for (let vertex = 0; vertex < read.fit.kept.length; vertex += 1) {
    if (read.fit.kept[vertex] === 0) continue;
    const x = set.positions[(first + vertex) * 3] as number;
    const z = set.positions[(first + vertex) * 3 + 2] as number;
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

/** One sample of a drawn chain, with the turn each line holds at that place. */
interface Facet {
  /** The two-chord turn of the drawn line over the reach each side, in degrees. */
  readonly drawn: number;
  /** The largest traced turn at the traced nodes within the reach along the chain. */
  readonly traced: number;
}

/**
 * Reads the turn of the drawn line and the turn of the traced boundary at every
 * sample of one walked chain.
 *
 * The drawn turn is windowed and not read at a break alone, or the rule it serves
 * would be true by construction: a break needs a traced turn over the corner test,
 * and inside a run the drawn turn is zero.
 *
 * The traced turn is the largest at the traced nodes within the reach along the
 * chain, because the drawn line is not the traced line: it may lie up to the
 * departure bound away from it, and a break may sit a cell from the traced node it
 * answers to.
 */
function facetsOf(chain: number, walk: DrawnWalk): Facet[] {
  const read = readChain(chain);
  const turns: (number | null)[] = [];
  for (let node = 0; node < read.lengths.length; node += 1) {
    turns.push(tracedTurnAt(read.traced, read.lengths, node, TURN_REACH_LY));
  }
  const out: Facet[] = [];
  let low = 0;
  let high = 0;
  for (let sample = 0; sample * 2 < walk.points.length; sample += 1) {
    const drawn = walkedTurnAt(walk, sample, TURN_REACH_LY);
    if (drawn === null) continue;
    const at = walk.tracedAt[sample] as number;
    while (low < turns.length && (read.lengths[low] as number) < at - TURN_REACH_LY) {
      low += 1;
    }
    while (
      high < turns.length &&
      (read.lengths[high] as number) <= at + TURN_REACH_LY
    ) {
      high += 1;
    }
    let traced = 0;
    for (let node = low; node < high; node += 1) {
      const turn = turns[node];
      if (turn !== null && turn > traced) traced = turn;
    }
    out.push({ drawn, traced });
  }
  return out;
}

/** How far the drawn line turns above the traced boundary, over the samples of a set. */
interface FacetReading {
  /** How many samples turn by more than 10 degrees. */
  readonly samples: number;
  /** How many of those turn by more than 10 degrees above the traced turn. */
  readonly over: number;
  /** The largest excess of the drawn turn over the traced turn, in degrees. */
  readonly worst: number;
}

/**
 * Reads the faceting rule over a whole set.
 *
 * The rule holds where the traced boundary does not already turn: a sample whose
 * windowed traced turn passes the corner test sits at a corner, and the corner counts
 * govern a corner. A raster rounds a right angle over a cell or two, so the window
 * reads 78.9 degrees where the drawn line keeps the true 91.
 *
 * The exclusion and the corner test go together and neither replaces the other.
 * The corner test removes the fault from the line; the exclusion removes a corner from
 * of the measure. At a corner test of 20 the exclusion alone would have forgiven the
 * chain 67 kink, whose window reads 23.8, and the rule would have passed at 1.9
 * degrees below the traced turn while the drawn line kinked 50.6 degrees.
 */
function readFacets(walkOf: (chain: number) => DrawnWalk): FacetReading {
  let samples = 0;
  let over = 0;
  let worst = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < lines.chainCount; index += 1) {
    for (const facet of facetsOf(index, walkOf(index))) {
      if (facet.drawn <= 10) continue;
      if (facet.traced > REGION_CORNER_DEGREES) continue;
      samples += 1;
      const excess = facet.drawn - facet.traced;
      if (excess > worst) worst = excess;
      if (excess > 10) over += 1;
    }
  }
  return { samples, over, worst };
}

/**
 * The straight fit this change replaces, as a walked chain: the kept vertices joined
 * by chords, with no arc and no run. It is the line the faceting rule has to be able
 * to fail on.
 */
function straightWalk(chain: number, step = FACET_STEP_LY): DrawnWalk {
  const read = readChain(chain);
  const kept = keptVerticesLy(grid, trace.chains[chain] as TracedChain);
  const count = kept.length / 2;
  const at = new Float64Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    at[vertex] = read.lengths[read.nodes[vertex] as number] as number;
  }
  const points: number[] = [];
  const tracedAt: number[] = [];
  for (let vertex = 0; vertex + 1 < count; vertex += 1) {
    const span = Math.hypot(
      (kept[vertex * 2 + 2] as number) - (kept[vertex * 2] as number),
      (kept[vertex * 2 + 3] as number) - (kept[vertex * 2 + 1] as number),
    );
    const steps = Math.max(1, Math.ceil(span / step));
    for (let sub = 0; sub < steps; sub += 1) {
      const fraction = sub / steps;
      points.push(
        (kept[vertex * 2] as number) +
          fraction * ((kept[vertex * 2 + 2] as number) - (kept[vertex * 2] as number)),
        (kept[vertex * 2 + 1] as number) +
          fraction *
            ((kept[vertex * 2 + 3] as number) - (kept[vertex * 2 + 1] as number)),
      );
      tracedAt.push(
        (at[vertex] as number) +
          fraction * ((at[vertex + 1] as number) - (at[vertex] as number)),
      );
    }
  }
  points.push(kept[(count - 1) * 2] as number, kept[(count - 1) * 2 + 1] as number);
  tracedAt.push(at[count - 1] as number);
  const walked = Float64Array.from(points);
  return {
    points: walked,
    lengths: polylineLengths(walked),
    tracedAt: Float64Array.from(tracedAt),
  };
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
    const lengths = polylineLengths(points);
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
    const lengths = polylineLengths(chain);
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
    const lengths = polylineLengths(chain);
    expect(tracedTurnAt(chain, lengths, 1, TURN_REACH_LY)).toBeNull();
    expect(tracedTurnAt(chain, lengths, 2, TURN_REACH_LY)).toBeNull();
  });
});

describe('the arc fit', () => {
  /**
   * A traced chain that runs 3,000 light years east, turns a right angle, and runs
   * 3,000 light years north, at one node every 50 light years. The kept vertices are
   * given rather than simplified, so the run on each side of the corner holds three
   * spans and the tangent at the corner comes from the estimate and not from one
   * chord.
   */
  function cornerChain(): { traced: Float64Array; kept: Float64Array } {
    const nodes: number[] = [];
    for (let at = 0; at <= 3000; at += 50) nodes.push(at, 0);
    for (let at = 50; at <= 3000; at += 50) nodes.push(3000, at);
    const kept: number[] = [];
    for (let at = 0; at <= 3000; at += 1000) kept.push(at, 0);
    for (let at = 1000; at <= 3000; at += 1000) kept.push(3000, at);
    return { traced: Float64Array.from(nodes), kept: Float64Array.from(kept) };
  }

  test('the tangent at a break is one-sided', () => {
    const { traced, kept } = cornerChain();
    const fit = fitChainArcs(traced, kept);
    const count = fit.points.length / 2;

    // The corner is the kept vertex at (3000, 0). Its traced turn is 90 degrees, so
    // the fit breaks there.
    let corner = -1;
    for (let vertex = 0; vertex < count; vertex += 1) {
      if ((fit.points[vertex * 2] as number) !== 3000) continue;
      if ((fit.points[vertex * 2 + 1] as number) !== 0) continue;
      corner = vertex;
    }
    expect(corner).toBeGreaterThan(0);
    expect(fit.breaks[corner]).toBe(1);

    const arriving = arcTangents(
      arcThrough(
        fit.points[corner * 2 - 2] as number,
        fit.points[corner * 2 - 1] as number,
        fit.points[corner * 2] as number,
        fit.points[corner * 2 + 1] as number,
        fit.curvature[corner - 1] as number,
      ),
    );
    const leaving = arcTangents(
      arcThrough(
        fit.points[corner * 2] as number,
        fit.points[corner * 2 + 1] as number,
        fit.points[corner * 2 + 2] as number,
        fit.points[corner * 2 + 3] as number,
        fit.curvature[corner] as number,
      ),
    );
    // The run before the corner runs east and the run after it runs north.
    expect(
      angleBetween(arriving.endX, arriving.endZ, leaving.startX, leaving.startZ),
    ).toBeCloseTo(90, 6);

    // A two-sided estimate at the corner reads the difference of the kept vertices on
    // each side of it, which is the diagonal. It sits 45 degrees from each one-sided
    // tangent, and it would hand the same direction to both runs, so the drawn line
    // would run through the corner and turn by nothing at all.
    const diagonal = [Math.SQRT1_2, Math.SQRT1_2];
    expect(
      angleBetween(
        arriving.endX,
        arriving.endZ,
        diagonal[0] as number,
        diagonal[1] as number,
      ),
    ).toBeCloseTo(45, 6);
    expect(
      angleBetween(
        leaving.startX,
        leaving.startZ,
        diagonal[0] as number,
        diagonal[1] as number,
      ),
    ).toBeCloseTo(45, 6);
  });

  test('a break is a chain end or a corner, and the runs cover the chain', () => {
    let breaks = 0;
    let runs = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const read = readChain(index);
      const count = read.fit.points.length / 2;
      const keptCount = read.nodes.length;
      let ordinal = -1;
      const breakAt: number[] = [];
      for (let vertex = 0; vertex < count; vertex += 1) {
        if (read.fit.kept[vertex] === 0) {
          // A joint of a biarc lies inside a run and is never a break.
          expect(read.fit.breaks[vertex]).toBe(0);
          continue;
        }
        ordinal += 1;
        if (read.fit.breaks[vertex] === 0) continue;
        breaks += 1;
        breakAt.push(ordinal);
        if (ordinal === 0 || ordinal === keptCount - 1) continue;
        // Every other break is a kept vertex whose traced turn passes the corner test.
        const turn = tracedTurnAt(
          read.traced,
          read.lengths,
          read.nodes[ordinal] as number,
          TURN_REACH_LY,
        );
        expect(turn).not.toBeNull();
        expect(turn as number).toBeGreaterThan(REGION_CORNER_DEGREES);
      }
      // The chain ends are breaks, and the runs between the breaks cover every span
      // of the chain exactly once.
      expect(breakAt[0]).toBe(0);
      expect(breakAt[breakAt.length - 1]).toBe(keptCount - 1);
      let covered = 0;
      for (let at = 0; at + 1 < breakAt.length; at += 1) {
        covered += (breakAt[at + 1] as number) - (breakAt[at] as number);
        runs += 1;
      }
      expect(covered).toBe(keptCount - 1);
    }
    console.log('the runs of the fit', { breaks, runs });
    expect(runs).toBeGreaterThan(0);
  });

  test('a biarc interpolates its kept vertices and meets its tangents', () => {
    let worstGap = 0;
    let worstAngle = 0;
    let joints = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const read = readChain(index);
      const kept = keptVerticesLy(grid, trace.chains[index] as TracedChain);
      const count = read.fit.points.length / 2;
      let ordinal = -1;
      for (let vertex = 0; vertex < count; vertex += 1) {
        if (read.fit.kept[vertex] === 1) {
          ordinal += 1;
          worstGap = Math.max(
            worstGap,
            Math.hypot(
              (read.fit.points[vertex * 2] as number) - (kept[ordinal * 2] as number),
              (read.fit.points[vertex * 2 + 1] as number) -
                (kept[ordinal * 2 + 1] as number),
            ),
          );
        } else {
          joints += 1;
        }
        // The two primitives that meet inside a run were fitted to one prescribed
        // tangent each side, so they hold the same direction where they meet.
        if (vertex === 0 || vertex + 1 >= count) continue;
        if (read.fit.breaks[vertex] === 1) continue;
        worstAngle = Math.max(worstAngle, fitTurnAt(read.fit, vertex));
      }
    }
    console.log('the biarc fit', { joints, worstGap, worstAngle });
    expect(joints).toBeGreaterThan(0);
    expect(worstGap).toBeLessThanOrEqual(1e-9);
    // 1e-6 radians, which is what the fit is asked to hold at a prescribed tangent.
    expect((worstAngle * Math.PI) / 180).toBeLessThanOrEqual(1e-6);
  });

  test('the spline is tangent-continuous inside a run', () => {
    let drawn = 0;
    let fitted = 0;
    let moved = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const read = readChain(index);
      const count = read.fit.points.length / 2;
      for (let vertex = 1; vertex + 1 < count; vertex += 1) {
        if (read.fit.breaks[vertex] === 1) continue;
        drawn = Math.max(drawn, drawnTurnAt(lines, index, vertex));
        fitted = Math.max(fitted, fitTurnAt(read.fit, vertex));

        // The same reading with this joint moved one light year across the line.
        if (read.fit.kept[vertex] === 1) continue;
        const leaving = arcTangents(
          arcThrough(
            read.fit.points[vertex * 2] as number,
            read.fit.points[vertex * 2 + 1] as number,
            read.fit.points[vertex * 2 + 2] as number,
            read.fit.points[vertex * 2 + 3] as number,
            read.fit.curvature[vertex] as number,
          ),
        );
        const shifted = Float64Array.from(read.fit.points);
        shifted[vertex * 2] = (shifted[vertex * 2] as number) + leaving.startZ;
        shifted[vertex * 2 + 1] = (shifted[vertex * 2 + 1] as number) - leaving.startX;
        moved = Math.max(moved, fitTurnAt(read.fit, vertex, shifted));
      }
    }
    console.log('the turn inside a run', { drawn, fitted, moved });
    expect(drawn).toBeLessThanOrEqual(0.5);
    expect(fitted).toBeLessThanOrEqual(0.5);
    // The measure sees a joint moved by one light year: it reads 0.407 degrees
    // against the 1.7e-6 degrees the fit leaves. The move does not cross the 0.5
    // degree bound of its own, because the median primitive is 2,029 light years long
    // and one light year across such a primitive turns the tangent by very little.
    expect(moved).toBeGreaterThan(0.1);
    expect(moved / Math.max(fitted, 1e-12)).toBeGreaterThan(1000);
  });

  test('a straight run stays straight', () => {
    let runs = 0;
    let primitives = 0;
    let straight = 0;
    let tightest = Number.POSITIVE_INFINITY;
    const loose: number[] = [];
    for (let index = 0; index < lines.chainCount; index += 1) {
      const read = readChain(index);
      const count = read.fit.points.length / 2;
      let from = -1;
      for (let vertex = 0; vertex < count; vertex += 1) {
        if (read.fit.breaks[vertex] === 0) continue;
        if (from >= 0) {
          // The largest traced turn anywhere along the run.
          let worst = 0;
          let ordinal = -1;
          for (let read2 = 0; read2 <= vertex; read2 += 1) {
            if (read.fit.kept[read2] === 1) ordinal += 1;
          }
          let fromOrdinal = -1;
          for (let read2 = 0; read2 <= from; read2 += 1) {
            if (read.fit.kept[read2] === 1) fromOrdinal += 1;
          }
          const firstNode = read.nodes[fromOrdinal] as number;
          const lastNode = read.nodes[ordinal] as number;
          for (let node = firstNode; node <= lastNode; node += 1) {
            const turn = tracedTurnAt(read.traced, read.lengths, node, TURN_REACH_LY);
            if (turn !== null && turn > worst) worst = turn;
          }
          if (worst <= 5) {
            runs += 1;
            for (let inside = from; inside < vertex; inside += 1) {
              primitives += 1;
              const curvature = lines.curvature[
                (lines.first[index] as number) + inside
              ] as number;
              if (curvature === 0) {
                straight += 1;
                continue;
              }
              const radius = 1 / Math.abs(curvature);
              tightest = Math.min(tightest, radius);
              if (radius < 100000) loose.push(radius);
            }
          }
        }
        from = vertex;
      }
    }
    console.log('the runs whose trace never turns', {
      runs,
      primitives,
      straight,
      tightest,
    });
    // The raster staircase turns by more than 5 degrees over the 500 light year
    // window almost everywhere, so one run of the whole set qualifies. It is a
    // straight primitive, which is what the rule asks for.
    //
    // The test reads every primitive rather than the smallest radius over them. A
    // smallest radius starts at infinity, so a bound on it alone passes when the loop
    // finds nothing, and the reading of infinity above says that is what happens here.
    expect(runs).toBeGreaterThan(0);
    expect(primitives).toBeGreaterThan(0);
    expect(loose).toEqual([]);
  });

  test('the tangent estimate inside a run is the one the measurements chose', () => {
    const rows: {
      estimate: TangentEstimate;
      drawnToTraced: number;
      tracedToDrawn: number;
      worstOnStraight: number;
    }[] = [];
    for (const estimate of ['central', 'traced'] as const) {
      const set = packRegionLines(grid, trace, REGION_FIT_TOLERANCE_LY, estimate);
      let drawnToTraced = 0;
      let tracedToDrawn = 0;
      let worstOnStraight = 0;
      for (let index = 0; index < set.chainCount; index += 1) {
        const traced = tracedPolyline(grid, index);
        const drawn = walkDrawnChain(set, index, DEPARTURE_STEP_LY);
        drawnToTraced = Math.max(
          drawnToTraced,
          walkedGap(drawn.points, indexSegments(traced), DEPARTURE_STEP_LY),
        );
        tracedToDrawn = Math.max(
          tracedToDrawn,
          walkedGap(traced, indexSegments(drawn.points), DEPARTURE_STEP_LY),
        );
        const facets = facetsOf(index, walkDrawnChain(set, index, FACET_STEP_LY));
        for (const facet of facets) {
          // Where the traced boundary runs straight, which is the measure an
          // estimate inside a run can move.
          if (facet.traced > 5) continue;
          worstOnStraight = Math.max(worstOnStraight, facet.drawn);
        }
      }
      rows.push({ estimate, drawnToTraced, tracedToDrawn, worstOnStraight });
    }
    console.log('the two tangent estimates', rows);
    const central = rows[0] as (typeof rows)[number];
    const traced = rows[1] as (typeof rows)[number];
    expect(REGION_TANGENT_ESTIMATE).toBe('central');
    // The chosen estimate is no worse on either measure it can move.
    expect(central.drawnToTraced).toBeLessThanOrEqual(traced.drawnToTraced);
    expect(central.tracedToDrawn).toBeLessThanOrEqual(traced.tracedToDrawn);
    expect(central.worstOnStraight).toBeLessThanOrEqual(traced.worstOnStraight);
    expect(central.drawnToTraced).toBeLessThanOrEqual(REGION_DEPARTURE_LY);
    expect(central.tracedToDrawn).toBeLessThanOrEqual(REGION_DEPARTURE_LY);
  }, 120000);
});

describe('the boundary set', () => {
  test('every kept vertex is a traced node', () => {
    for (let index = 0; index < lines.chainCount; index += 1) {
      const nodes = nodeOfEveryKeptVertex(grid, lines, index);
      expect(nodes).not.toBeNull();
      const found = nodes as number[];
      const nodeCount = (trace.chains[index] as TracedChain).nodes.length / 2;
      expect(found[0]).toBe(0);
      expect(found[found.length - 1]).toBe(nodeCount - 1);
    }
  });

  test('the drawn line stays inside the departure bound', () => {
    let drawnToTraced = 0;
    let tracedToDrawn = 0;
    for (let index = 0; index < trace.chains.length; index += 1) {
      const traced = tracedPolyline(grid, index);
      // The drawn line is walked with each arc sampled along its sweep, so the
      // reading covers the curve and not only the ends of a primitive.
      const drawn = walkDrawnChain(lines, index, DEPARTURE_STEP_LY);
      drawnToTraced = Math.max(
        drawnToTraced,
        walkedGap(drawn.points, indexSegments(traced), DEPARTURE_STEP_LY),
      );
      tracedToDrawn = Math.max(
        tracedToDrawn,
        walkedGap(traced, indexSegments(drawn.points), DEPARTURE_STEP_LY),
      );
    }
    console.log('the departure of the drawn line', { drawnToTraced, tracedToDrawn });
    expect(drawnToTraced).toBeLessThanOrEqual(REGION_DEPARTURE_LY);
    expect(tracedToDrawn).toBeLessThanOrEqual(REGION_DEPARTURE_LY);
  }, 300000);

  test('the line keeps real corners and invents few', () => {
    let over20 = 0;
    let honest = 0;
    let worstInvented = 0;
    let worstTurn = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const read = readChain(index);
      const count = read.fit.points.length / 2;
      let ordinal = -1;
      for (let vertex = 0; vertex < count; vertex += 1) {
        if (read.fit.kept[vertex] === 1) ordinal += 1;
        if (vertex === 0 || vertex + 1 >= count) continue;
        if (read.fit.breaks[vertex] === 0) continue;
        // The turn of the drawn line is read at a break, between the tangent of the
        // primitive arriving and the tangent of the one leaving.
        const turn = drawnTurnAt(lines, index, vertex);
        if (turn > worstTurn) worstTurn = turn;
        if (turn <= 20) continue;
        const traced = tracedTurnAt(
          read.traced,
          read.lengths,
          read.nodes[ordinal] as number,
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
      const read = readChain(place.chain);
      const count = read.fit.points.length / 2;
      let holds = false;
      for (let vertex = 1; vertex + 1 < count; vertex += 1) {
        if (read.fit.breaks[vertex] === 0) continue;
        if (drawnTurnAt(lines, place.chain, vertex) <= 40) continue;
        const at = read.at[vertex] as number;
        for (const node of place.nodes) {
          if (Math.abs(at - (read.lengths[node] as number)) <= TURN_REACH_LY) {
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

  test('the line does not facet', () => {
    const drawn = readFacets((chain) => walkDrawnChain(lines, chain, FACET_STEP_LY));
    // The line this change replaces, measured against the same rule. The rule has to
    // be able to fail, and this is the measurement of that rather than a claim.
    const straight = readFacets((chain) => straightWalk(chain, FACET_STEP_LY));
    console.log('the turn of the drawn line against the traced turn', {
      drawn,
      straight,
    });
    expect(drawn.over).toBe(0);
    expect(drawn.worst).toBeLessThanOrEqual(10);
    expect(straight.over).toBeGreaterThan(0);
    expect(straight.worst).toBeGreaterThan(10);
  }, 120000);

  test('the set is small enough to upload once', () => {
    const primitives = lines.vertexCount - lines.chainCount;
    let straight = 0;
    let counted = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const first = lines.first[index] as number;
      const last = lines.last[index] as number;
      // A chain of `n` vertices holds `n - 1` primitives, because a vertex two
      // primitives share is stored once.
      counted += last - first;
      for (let vertex = first; vertex < last; vertex += 1) {
        if ((lines.curvature[vertex] as number) === 0) straight += 1;
      }
      // The last vertex of a chain starts no primitive.
      expect(lines.curvature[last]).toBe(0);
    }
    expect(counted).toBe(primitives);

    // A primitive is the minor arc through its two ends. Nothing in `arc.ts` holds the
    // fit to that, so the built set is measured here: a sweep past 180 degrees would
    // reconstruct the other arc of the circle and draw a different curve.
    let widestSweep = 0;
    for (let index = 0; index < lines.chainCount; index += 1) {
      const first = lines.first[index] as number;
      const last = lines.last[index] as number;
      for (let vertex = first; vertex < last; vertex += 1) {
        const arc = arcThrough(
          lines.positions[vertex * 3] as number,
          lines.positions[vertex * 3 + 2] as number,
          lines.positions[vertex * 3 + 3] as number,
          lines.positions[vertex * 3 + 5] as number,
          lines.curvature[vertex] as number,
        );
        widestSweep = Math.max(widestSweep, Math.abs(arc.sweep));
      }
    }
    console.log('the widest sweep in degrees', (widestSweep * 180) / Math.PI);
    expect((widestSweep * 180) / Math.PI).toBeLessThan(180);

    console.log('the boundary set holds', {
      chains: lines.chainCount,
      vertices: lines.vertexCount,
      primitives,
      straight,
      arcs: primitives - straight,
      kib: (lines.positions.byteLength + lines.curvature.byteLength) / 1024,
    });
    expect(lines.vertexCount).toBeGreaterThanOrEqual(300);
    expect(lines.vertexCount).toBeLessThanOrEqual(2000);
    expect(primitives).toBeGreaterThanOrEqual(300);
    expect(primitives).toBeLessThanOrEqual(2000);
    expect(lines.positions.length).toBe(lines.vertexCount * 3);
    expect(lines.curvature.length).toBe(lines.vertexCount);
    expect(lines.positions.byteLength + lines.curvature.byteLength).toBeLessThanOrEqual(
      31.2 * 1024,
    );
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
    expect(new Uint8Array(again.curvature.buffer)).toEqual(
      new Uint8Array(lines.curvature.buffer),
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
    const curvature = Array.from(set.curvature);
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
    expect(Array.from(received.curvature)).toEqual(curvature);
    expect(Array.from(received.last)).toEqual(ends);
    expect(Array.from(received.pairs)).toEqual(pairs);
    expect(set.positions.buffer.byteLength).toBe(0);
    expect(set.curvature.buffer.byteLength).toBe(0);
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
