// Traces the boundaries of the galactic codex regions onto the galactic plane.
//
// This module reads `astro/codex-region-lookup`, which carries the cell grid and is
// about 199 KiB. Only `region-lines.worker.ts` imports this file, so the grid stays
// out of the main bundle.
import {
  CODEX_REGION_MAP_LY_PER_CELL,
  findCodexRegionAt,
} from '@elite-dangerous-almanac/core/astro/codex-region-lookup';
import { arcCurvature } from './arc';
import { galaxyModel } from '../galaxy-model/model';
import type { Range } from '../galaxy-model/types';
import { buildClearanceField, buildRegionLabelGeometry } from './clearance';
import { NO_REGION_ID } from './regions';
import type { CoarseRegionGrid, RegionLabelGeometry, RegionLines } from './types';

/** The edge of one cell of the region grid, in light years. It is 4,096 / 83. */
export const REGION_CELL_LY = CODEX_REGION_MAP_LY_PER_CELL;

/** How many cells the grid holds per axis over the model bounds. */
export const REGION_GRID_SIZE = 2027;

/**
 * How far the simplified line may sit from the traced boundary, in light years. It is
 * looser than the 49.3494 light year resolution of the source on purpose. Nothing the
 * page draws shows where the boundary truly lies, so a departure the viewer cannot
 * check costs nothing, while the shape the viewer can check gets better.
 */
export const REGION_DEPARTURE_LY = 200;

/**
 * The tolerance the simplification fits to, in light years. It sits strictly below the
 * departure bound, so the asserted bound carries slack: the residual of the fit is its
 * own tolerance, so a fit at the bound leaves a knife edge that a change of tie-break
 * pushes over.
 */
export const REGION_FIT_TOLERANCE_LY = 190;

/** The largest number of cells per axis the coarse region grid holds. */
export const COARSE_REGION_GRID_MAX = 512;

/** The region id at the centre of every cell of the grid over the model bounds. */
export interface RegionGrid {
  /** How many cells the grid holds per axis. */
  readonly size: number;
  /** The low corner of the covered plane box, as `x` then `z`, in light years. */
  readonly origin: readonly [number, number];
  /** The edge of one cell, in light years. */
  readonly cell: number;
  /** One id per cell, `x` fastest. 0 means the cell lies outside the mapped grid. */
  readonly ids: Uint8Array;
}

/**
 * One traced chain of unit edges, as the lattice nodes it runs through. A node is a
 * corner of a cell, counted in cells from the low corner of the grid. A chain whose
 * first node equals its last node is a closed loop.
 */
export interface TracedChain {
  /** Two values per node, `ix` then `iz`. */
  readonly nodes: Int32Array;
}

/** What the chain trace of one region grid gives. */
export interface RegionTrace {
  /** One chain per run of edges between two junction nodes, or one closed loop. */
  readonly chains: readonly TracedChain[];
  /** How many unit edges the grid holds. */
  readonly edgeCount: number;
  /** How many lattice nodes carry at least one edge. */
  readonly nodeCount: number;
  /** How many of those nodes carry a number of edges other than two. */
  readonly junctionCount: number;
}

/**
 * Reads the region at the centre of every cell. A cell outside the mapped grid takes
 * the id 0, which is an id of its own, so the rim of the codex map draws as a
 * boundary. About 1.16 million of the 4.11 million cells lie outside it, and dropping
 * that edge would lose the outline of the map.
 */
export function fillRegionGrid(
  bounds: Range = galaxyModel.bounds,
  size: number = REGION_GRID_SIZE,
): RegionGrid {
  const cell = REGION_CELL_LY;
  const xLow = bounds.x[0];
  const zLow = bounds.z[0];
  const ids = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    const z = zLow + (iz + 0.5) * cell;
    const row = iz * size;
    for (let ix = 0; ix < size; ix += 1) {
      const x = xLow + (ix + 0.5) * cell;
      ids[row + ix] = findCodexRegionAt({ x, z })?.id ?? NO_REGION_ID;
    }
  }
  return { size, origin: [xLow, zLow], cell, ids };
}

/**
 * Links the unit edges of the grid into chains.
 *
 * An edge sits between two neighbouring cells that hold different ids, and it joins
 * two nodes of the lattice of cell corners. A node carries two edges almost
 * everywhere, and more only where three or more regions meet. A chain follows the
 * boundary through every node of degree two and ends at every other node, so a chain
 * separates exactly one pair of region ids and no edge belongs to two chains. A loop
 * that carries no such node becomes one chain that ends where it starts.
 */
export function traceRegionChains(grid: RegionGrid): RegionTrace {
  const size = grid.size;
  const ids = grid.ids;
  const rowNodes = size + 1;

  // A vertical edge at (ix, iz) joins node (ix, iz) to node (ix, iz + 1). It sits
  // between the cells (ix - 1, iz) and (ix, iz).
  const vertical = (ix: number, iz: number): boolean =>
    ix >= 1 &&
    ix < size &&
    iz >= 0 &&
    iz < size &&
    ids[iz * size + ix - 1] !== ids[iz * size + ix];

  // A horizontal edge at (ix, iz) joins node (ix, iz) to node (ix + 1, iz). It sits
  // between the cells (ix, iz - 1) and (ix, iz).
  const horizontal = (ix: number, iz: number): boolean =>
    iz >= 1 &&
    iz < size &&
    ix >= 0 &&
    ix < size &&
    ids[(iz - 1) * size + ix] !== ids[iz * size + ix];

  const degrees = new Uint8Array(rowNodes * rowNodes);
  const verticalSeen = new Uint8Array(size * size);
  const horizontalSeen = new Uint8Array(size * size);
  let edgeCount = 0;
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      if (vertical(ix, iz)) {
        degrees[iz * rowNodes + ix] += 1;
        degrees[(iz + 1) * rowNodes + ix] += 1;
        edgeCount += 1;
      }
      if (horizontal(ix, iz)) {
        degrees[iz * rowNodes + ix] += 1;
        degrees[iz * rowNodes + ix + 1] += 1;
        edgeCount += 1;
      }
    }
  }

  let nodeCount = 0;
  let junctionCount = 0;
  for (let index = 0; index < degrees.length; index += 1) {
    const degree = degrees[index] as number;
    if (degree === 0) continue;
    nodeCount += 1;
    if (degree !== 2) junctionCount += 1;
  }

  // The four directions a walk can take from a node, as steps in `ix` and `iz`.
  const stepX = [1, 0, -1, 0];
  const stepZ = [0, 1, 0, -1];

  /** Whether the edge that leaves node (ix, iz) in a direction is there and unwalked. */
  const openEdge = (ix: number, iz: number, dir: number): boolean => {
    if (dir === 0) return horizontal(ix, iz) && horizontalSeen[iz * size + ix] === 0;
    if (dir === 1) return vertical(ix, iz) && verticalSeen[iz * size + ix] === 0;
    if (dir === 2)
      return horizontal(ix - 1, iz) && horizontalSeen[iz * size + ix - 1] === 0;
    return vertical(ix, iz - 1) && verticalSeen[(iz - 1) * size + ix] === 0;
  };

  /** Whether the edge that leaves node (ix, iz) in a direction is there. */
  const anyEdge = (ix: number, iz: number, dir: number): boolean => {
    if (dir === 0) return horizontal(ix, iz);
    if (dir === 1) return vertical(ix, iz);
    if (dir === 2) return horizontal(ix - 1, iz);
    return vertical(ix, iz - 1);
  };

  /** Marks the edge that leaves node (ix, iz) in a direction as walked. */
  const markEdge = (ix: number, iz: number, dir: number): void => {
    if (dir === 0) horizontalSeen[iz * size + ix] = 1;
    else if (dir === 1) verticalSeen[iz * size + ix] = 1;
    else if (dir === 2) horizontalSeen[iz * size + ix - 1] = 1;
    else verticalSeen[(iz - 1) * size + ix] = 1;
  };

  const chains: TracedChain[] = [];

  /** Walks from a node in a direction until the chain ends, and keeps the chain. */
  const walk = (startX: number, startZ: number, startDir: number): void => {
    const nodes: number[] = [startX, startZ];
    let ix = startX;
    let iz = startZ;
    let dir = startDir;
    for (;;) {
      markEdge(ix, iz, dir);
      ix += stepX[dir] as number;
      iz += stepZ[dir] as number;
      nodes.push(ix, iz);
      if (degrees[iz * rowNodes + ix] !== 2) break;
      if (ix === startX && iz === startZ) break;
      const back = (dir + 2) % 4;
      let next = -1;
      for (let step = 0; step < 4; step += 1) {
        if (step !== back && anyEdge(ix, iz, step)) next = step;
      }
      if (next < 0) break;
      dir = next;
    }
    chains.push({ nodes: Int32Array.from(nodes) });
  };

  // Every chain that ends at a junction. The walk starts at the junction, so a chain
  // is walked once from each of its two ends only if both ends are junctions; the
  // walked edges stop the second walk.
  for (let iz = 0; iz <= size; iz += 1) {
    for (let ix = 0; ix <= size; ix += 1) {
      const degree = degrees[iz * rowNodes + ix] as number;
      if (degree === 0 || degree === 2) continue;
      for (let dir = 0; dir < 4; dir += 1) {
        if (openEdge(ix, iz, dir)) walk(ix, iz, dir);
      }
    }
  }

  // What is left is closed loops, where every node carries two edges.
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      if (vertical(ix, iz) && verticalSeen[iz * size + ix] === 0) walk(ix, iz, 1);
      if (horizontal(ix, iz) && horizontalSeen[iz * size + ix] === 0) walk(ix, iz, 0);
    }
  }

  return { chains, edgeCount, nodeCount, junctionCount };
}

/**
 * Simplifies a chain to straight segments, by Douglas-Peucker.
 *
 * The result keeps a traced node only where dropping it would move the line further
 * than the tolerance from the trace, and it always keeps the first and the last node.
 * Every vertex of the result is therefore a node of the chain it came from, so two
 * chains that end at the same lattice node keep that node and share the point exactly.
 *
 * The distance is measured to the **segment** between the two kept nodes, and not to
 * the infinite line through them. The two differ where a chain doubles back: a node far
 * past the end of the segment can sit on the line through it, and the line measure then
 * drops the whole excursion. The segment measure is also the one the departure scenario
 * checks.
 *
 * The points and the tolerance are in cells.
 */
export function simplifyChain(points: Float64Array, tolerance: number): Float64Array {
  const count = points.length / 2;
  if (count <= 2) return points.slice();

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: number[] = [0, count - 1];
  while (stack.length > 0) {
    const last = stack.pop() as number;
    const first = stack.pop() as number;
    if (last - first < 2) continue;
    const ax = points[first * 2] as number;
    const az = points[first * 2 + 1] as number;
    const dx = (points[last * 2] as number) - ax;
    const dz = (points[last * 2 + 1] as number) - az;
    const span = dx * dx + dz * dz;
    let worst = 0;
    let worstAt = -1;
    for (let index = first + 1; index < last; index += 1) {
      const px = (points[index * 2] as number) - ax;
      const pz = (points[index * 2 + 1] as number) - az;
      let along = span === 0 ? 0 : (px * dx + pz * dz) / span;
      if (along < 0) along = 0;
      if (along > 1) along = 1;
      const gap = Math.hypot(px - along * dx, pz - along * dz);
      if (gap > worst) {
        worst = gap;
        worstAt = index;
      }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push(first, worstAt, worstAt, last);
    }
  }

  let kept = 0;
  for (let index = 0; index < count; index += 1) if (keep[index] === 1) kept += 1;
  const out = new Float64Array(kept * 2);
  let write = 0;
  for (let index = 0; index < count; index += 1) {
    if (keep[index] === 0) continue;
    out[write] = points[index * 2] as number;
    out[write + 1] = points[index * 2 + 1] as number;
    write += 2;
  }
  return out;
}

/** How far the traced turn measure reaches each way along a chain, in light years. */
export const REGION_TURN_REACH_LY = 500;

/**
 * The traced turn above which a kept vertex is a corner, in degrees.
 *
 * A corner breaks the spline, so the drawn line turns there and nowhere else. The
 * test is the two-chord traced turn below, which tells a corner the region map has
 * from a wobble of the raster.
 *
 * **The number sits in an empty band.** Measured over the whole set, no kept vertex
 * holds a traced turn between **22.93 and 39.59 degrees**, so a test of 25, 30 or 35
 * gives the same 472 breaks, 716 vertices and 593 primitives. The result does not
 * depend on the exact number, which is the only honest way to pick one. At 30 the
 * test sits 7.1 degrees above the highest wobble the raster produces and 9.6 below
 * the lowest real corner.
 *
 * **A test of 20 lets the raster through.** On chain 67 the traced turn alternates 11.1, 21.6,
 * 22.9 and 11.7 at neighbouring nodes of a smooth bend near the galactic centre. The
 * kept vertex at 22.9 becomes a corner, both of its runs fall to one span, and the
 * drawn line kinks **50.6 degrees** where the traced boundary turns 23.8 over the
 * window. Above 22.93 that place is a run, and the drawn line bends 28.1 degrees
 * through it.
 *
 * **The ceiling is the departure bound, not the corner counts.** Recall holds all 221
 * of its places up to a test of 60, because a recall place turns by more than 60 and
 * stays a corner. A test of 70 rounds a real corner into a run and leaves the 200
 * light year departure bound at 297.4 and 334.7.
 */
export const REGION_CORNER_DEGREES = 30;

/**
 * How far the tangent estimate reads each way along the traced chain, in light years.
 *
 * It is a few hundred, so the estimate averages the raster staircase rather than
 * inheriting the half-cell error of the two kept vertices next to it.
 */
export const REGION_TANGENT_REACH_LY = 300;

/**
 * Which estimate the fit takes for the tangent at a kept vertex inside a run.
 *
 * `central` takes the difference of the two kept vertices next to it. `traced` reads
 * the traced nodes `REGION_TANGENT_REACH_LY` each way, so it averages the raster
 * rather than inheriting the half-cell error of two of its nodes.
 *
 * Measured over the whole set, `central` wins on both measures an estimate inside a
 * run can move. The departure is 185.8 and 189.8 light years against 283.9 and 320.4,
 * and the second pair is outside the 200 light year bound. The worst windowed drawn
 * turn where the traced boundary runs straight is 2.4 degrees against 4.6. Neither
 * measure is corner recall, which the one-sided tangent at a break decides.
 */
export type TangentEstimate = 'traced' | 'central';

/** The estimate the build takes. The measurement above chose it. */
export const REGION_TANGENT_ESTIMATE: TangentEstimate = 'central';

/** The angle between two directions, in degrees, without a sign. */
export function angleBetween(ax: number, az: number, bx: number, bz: number): number {
  const spanA = Math.hypot(ax, az);
  const spanB = Math.hypot(bx, bz);
  if (spanA === 0 || spanB === 0) return 0;
  const cosine = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (spanA * spanB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** The length along a polyline at every one of its points, in light years. */
export function polylineLengths(points: Float64Array): Float64Array {
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
export function pointAlong(
  points: Float64Array,
  lengths: Float64Array,
  at: number,
): [number, number] {
  let low = 0;
  let high = lengths.length - 1;
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
 * `reach` forward. Where a chain end is nearer than the reach the node has no value,
 * and the caller leaves it out rather than measuring it over a shorter reach.
 *
 * The two chords are what the measure needs. The traced line is a raster staircase
 * that turns about 1,062 degrees for each 1,000 light years, so an accumulated turn
 * or the turn at one node alone reads a corner in every window of the trace.
 */
export function tracedTurnAt(
  points: Float64Array,
  lengths: Float64Array,
  node: number,
  reach: number = REGION_TURN_REACH_LY,
): number | null {
  const at = lengths[node] as number;
  const end = lengths[lengths.length - 1] as number;
  if (at - reach < 0 || at + reach > end) return null;
  const back = pointAlong(points, lengths, at - reach);
  const ahead = pointAlong(points, lengths, at + reach);
  const x = points[node * 2] as number;
  const z = points[node * 2 + 1] as number;
  return angleBetween(x - back[0], z - back[1], ahead[0] - x, ahead[1] - z);
}

/**
 * The traced node each kept vertex sits on. Every kept vertex is a node of the chain
 * it came from, and the simplification keeps them in their traced order, so one
 * forward walk answers for the whole chain.
 */
export function nodesOfKeptVertices(
  traced: Float64Array,
  kept: Float64Array,
): Int32Array {
  const count = traced.length / 2;
  const out = new Int32Array(kept.length / 2);
  let node = 0;
  for (let vertex = 0; vertex * 2 < kept.length; vertex += 1) {
    const x = kept[vertex * 2] as number;
    const z = kept[vertex * 2 + 1] as number;
    while (
      node < count &&
      ((traced[node * 2] as number) !== x || (traced[node * 2 + 1] as number) !== z)
    ) {
      node += 1;
    }
    out[vertex] = Math.min(node, count - 1);
    node += 1;
  }
  return out;
}

/** The arc spline fitted to one simplified chain. */
export interface ChainFit {
  /** Two `float64` per vertex, `x` then `z`, in light years. */
  readonly points: Float64Array;
  /**
   * One signed curvature per vertex, in reciprocal light years. The value at a vertex
   * belongs to the primitive that starts there, and the value at the last vertex is
   * zero because it starts none.
   */
  readonly curvature: Float64Array;
  /** 1 at a kept vertex of the simplification, 0 at a joint of a biarc. */
  readonly kept: Uint8Array;
  /** 1 at a break, which is a chain end or a corner. The line may turn there. */
  readonly breaks: Uint8Array;
}

/**
 * The tangent length of the biarc that joins two points with two prescribed tangents.
 *
 * The two arcs meet at the middle of the segment from `p0 + d t0` to `p1 - d t1`, and
 * they meet tangentially when that segment is `2 d` long. That condition is a
 * quadratic in `d`, and its root with the minus sign is the positive one whenever the
 * two tangents are not the same direction. Where they are, the quadratic falls to a
 * linear equation and the fit takes that root instead.
 */
function biarcTangentLength(
  p0x: number,
  p0z: number,
  t0x: number,
  t0z: number,
  p1x: number,
  p1z: number,
  t1x: number,
  t1z: number,
): number | null {
  const vx = p1x - p0x;
  const vz = p1z - p0z;
  const a = 2 * (t0x * t1x + t0z * t1z - 1);
  const b = -2 * (vx * (t0x + t1x) + vz * (t0z + t1z));
  const c = vx * vx + vz * vz;
  let d: number;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return null;
    d = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    d = (-b - Math.sqrt(discriminant)) / (2 * a);
  }
  if (!Number.isFinite(d) || d <= 0) return null;
  return d;
}

/**
 * Fits an arc spline to the kept vertices of one simplified chain.
 *
 * A **run** is a stretch of the chain between two breaks, where a break is a chain end
 * or a kept vertex at which the traced boundary turns by more than
 * `REGION_CORNER_DEGREES`. Inside a run each span of two kept vertices takes a biarc:
 * two circular arcs that meet tangentially at a joint, so the line has no turn
 * anywhere inside the run. A run of one span takes one straight primitive, because a
 * break fixes the tangent at each of its ends and the biarc degenerates to the chord.
 *
 * The tangent at a break is one-sided: it comes from inside the run alone, and the run
 * on the other side takes its own. A two-sided estimate there would average across the
 * corner and round it, which is the fault the earlier smoothing pipeline had.
 *
 * Both lines are in light years, and the kept vertices are nodes of the traced one.
 */
export function fitChainArcs(
  traced: Float64Array,
  kept: Float64Array,
  estimate: TangentEstimate = REGION_TANGENT_ESTIMATE,
): ChainFit {
  const count = kept.length / 2;
  const keptX = (index: number): number => kept[index * 2] as number;
  const keptZ = (index: number): number => kept[index * 2 + 1] as number;

  const lengths = polylineLengths(traced);
  const nodes = nodesOfKeptVertices(traced, kept);

  // A break is a chain end or a corner. A vertex within a reach of a chain end has no
  // traced turn, and it is not a break: the chain end beside it already is one.
  const isBreak = new Uint8Array(count);
  isBreak[0] = 1;
  isBreak[count - 1] = 1;
  for (let vertex = 1; vertex < count - 1; vertex += 1) {
    const turn = tracedTurnAt(traced, lengths, nodes[vertex] as number);
    if (turn !== null && turn > REGION_CORNER_DEGREES) isBreak[vertex] = 1;
  }

  /**
   * The direction the line runs in at a kept vertex, inside the run `from` to `to`.
   * At either end of the run the estimate reads one side only.
   */
  const tangentAt = (vertex: number, from: number, to: number): [number, number] => {
    let ax: number;
    let az: number;
    let bx: number;
    let bz: number;
    if (estimate === 'central') {
      const low = vertex > from ? vertex - 1 : vertex;
      const high = vertex < to ? vertex + 1 : vertex;
      ax = keptX(low);
      az = keptZ(low);
      bx = keptX(high);
      bz = keptZ(high);
    } else {
      const at = lengths[nodes[vertex] as number] as number;
      // The reach stays inside the run, so it never reads across a corner.
      const back =
        vertex > from
          ? Math.min(
              REGION_TANGENT_REACH_LY,
              at - (lengths[nodes[from] as number] as number),
            )
          : 0;
      const ahead =
        vertex < to
          ? Math.min(
              REGION_TANGENT_REACH_LY,
              (lengths[nodes[to] as number] as number) - at,
            )
          : 0;
      const low = pointAlong(traced, lengths, at - back);
      const high = pointAlong(traced, lengths, at + ahead);
      ax = low[0];
      az = low[1];
      bx = high[0];
      bz = high[1];
    }
    const dx = bx - ax;
    const dz = bz - az;
    const span = Math.hypot(dx, dz);
    if (span > 0) return [dx / span, dz / span];
    // Two readings at the same point. The chord of the span answers instead.
    const chordX = keptX(Math.min(vertex + 1, to)) - keptX(Math.max(vertex - 1, from));
    const chordZ = keptZ(Math.min(vertex + 1, to)) - keptZ(Math.max(vertex - 1, from));
    const chord = Math.hypot(chordX, chordZ);
    return chord > 0 ? [chordX / chord, chordZ / chord] : [1, 0];
  };

  const outX: number[] = [];
  const outZ: number[] = [];
  const outCurvature: number[] = [];
  const outKept: number[] = [];
  const outBreak: number[] = [];

  /** Writes one vertex and the curvature of the primitive that starts there. */
  const write = (
    x: number,
    z: number,
    curvature: number,
    vertexIsKept: boolean,
    vertexIsBreak: boolean,
  ): void => {
    outX.push(x);
    outZ.push(z);
    outCurvature.push(curvature);
    outKept.push(vertexIsKept ? 1 : 0);
    outBreak.push(vertexIsBreak ? 1 : 0);
  };

  let from = 0;
  for (let to = 1; to < count; to += 1) {
    if (isBreak[to] === 0) continue;
    if (to - from === 1) {
      // A run of one span. Both tangents are fixed by the break at each end.
      write(keptX(from), keptZ(from), 0, true, isBreak[from] === 1);
    } else {
      for (let span = from; span < to; span += 1) {
        const [t0x, t0z] = tangentAt(span, from, to);
        const [t1x, t1z] = tangentAt(span + 1, from, to);
        const startX = keptX(span);
        const startZ = keptZ(span);
        const endX = keptX(span + 1);
        const endZ = keptZ(span + 1);
        const reach = biarcTangentLength(
          startX,
          startZ,
          t0x,
          t0z,
          endX,
          endZ,
          t1x,
          t1z,
        );
        if (reach === null) {
          // The two tangents cannot be joined by a biarc. The chord holds the span.
          write(startX, startZ, 0, true, isBreak[span] === 1);
          continue;
        }
        const jointX = (startX + reach * t0x + endX - reach * t1x) / 2;
        const jointZ = (startZ + reach * t0z + endZ - reach * t1z) / 2;
        // The two arcs meet along the segment the joint sits at the middle of.
        const alongX = endX - reach * t1x - (startX + reach * t0x);
        const alongZ = endZ - reach * t1z - (startZ + reach * t0z);
        const along = Math.hypot(alongX, alongZ);
        const jointTangentX = along === 0 ? t0x : alongX / along;
        const jointTangentZ = along === 0 ? t0z : alongZ / along;
        write(
          startX,
          startZ,
          arcCurvature(startX, startZ, t0x, t0z, jointX, jointZ),
          true,
          isBreak[span] === 1,
        );
        write(
          jointX,
          jointZ,
          arcCurvature(jointX, jointZ, jointTangentX, jointTangentZ, endX, endZ),
          false,
          false,
        );
      }
    }
    from = to;
  }
  // The last vertex of the chain starts no primitive.
  write(keptX(count - 1), keptZ(count - 1), 0, true, true);

  const points = new Float64Array(outX.length * 2);
  for (let vertex = 0; vertex < outX.length; vertex += 1) {
    points[vertex * 2] = outX[vertex] as number;
    points[vertex * 2 + 1] = outZ[vertex] as number;
  }
  return {
    points,
    curvature: Float64Array.from(outCurvature),
    kept: Uint8Array.from(outKept),
    breaks: Uint8Array.from(outBreak),
  };
}

/**
 * The two region ids on the sides of a chain, as the smaller id then the larger one.
 *
 * Every edge of a chain carries the same pair, because a chain ends wherever three or
 * more regions meet, so the first edge answers for the whole chain.
 */
export function chainPair(grid: RegionGrid, chain: TracedChain): [number, number] {
  const size = grid.size;
  const nodes = chain.nodes;
  const x0 = nodes[0] as number;
  const z0 = nodes[1] as number;
  const x1 = nodes[2] as number;
  const z1 = nodes[3] as number;
  let low: number;
  let high: number;
  if (x0 === x1) {
    // A vertical edge sits between the cells (x0 - 1, iz) and (x0, iz).
    const iz = Math.min(z0, z1);
    low = grid.ids[iz * size + x0 - 1] as number;
    high = grid.ids[iz * size + x0] as number;
  } else {
    // A horizontal edge sits between the cells (ix, z0 - 1) and (ix, z0).
    const ix = Math.min(x0, x1);
    low = grid.ids[(z0 - 1) * size + ix] as number;
    high = grid.ids[z0 * size + ix] as number;
  }
  return low <= high ? [low, high] : [high, low];
}

/** The nodes of a traced chain as a point list in cells. */
export function chainPoints(chain: TracedChain): Float64Array {
  return Float64Array.from(chain.nodes);
}

/**
 * The kept vertices of one chain in light years, as `x` then `z`.
 *
 * The simplification runs in cells, as it always has, and the fit runs in light years,
 * because its reach and its corner test are both in light years. A kept vertex is a
 * lattice node either way, so the two agree on the point exactly.
 */
export function keptVerticesLy(
  grid: RegionGrid,
  chain: TracedChain,
  toleranceLy: number = REGION_FIT_TOLERANCE_LY,
): Float64Array {
  const simplified = simplifyChain(chainPoints(chain), toleranceLy / grid.cell);
  const out = new Float64Array(simplified.length);
  const xLow = grid.origin[0] as number;
  const zLow = grid.origin[1] as number;
  for (let read = 0; read < simplified.length; read += 2) {
    out[read] = xLow + (simplified[read] as number) * grid.cell;
    out[read + 1] = zLow + (simplified[read + 1] as number) * grid.cell;
  }
  return out;
}

/** The nodes of a traced chain as a point list in light years, `x` then `z`. */
export function chainPointsLy(grid: RegionGrid, chain: TracedChain): Float64Array {
  const nodes = chain.nodes;
  const out = new Float64Array(nodes.length);
  const xLow = grid.origin[0] as number;
  const zLow = grid.origin[1] as number;
  for (let read = 0; read < nodes.length; read += 2) {
    out[read] = xLow + (nodes[read] as number) * grid.cell;
    out[read + 1] = zLow + (nodes[read + 1] as number) * grid.cell;
  }
  return out;
}

/**
 * Packs the fitted chains of a trace into the boundary set the renderer draws.
 *
 * The set holds the vertices of every chain in one array with the index range of each
 * chain, and one curvature per vertex, so a vertex two primitives share is stored
 * once. The tolerance is in light years.
 */
export function packRegionLines(
  grid: RegionGrid,
  trace: RegionTrace,
  toleranceLy: number = REGION_FIT_TOLERANCE_LY,
  estimate: TangentEstimate = REGION_TANGENT_ESTIMATE,
): RegionLines {
  const fits = trace.chains.map((chain) =>
    fitChainArcs(
      chainPointsLy(grid, chain),
      keptVerticesLy(grid, chain, toleranceLy),
      estimate,
    ),
  );

  let vertexCount = 0;
  for (const fit of fits) vertexCount += fit.points.length / 2;

  const positions = new Float32Array(vertexCount * 3);
  const curvature = new Float32Array(vertexCount);
  const first = new Uint32Array(fits.length);
  const last = new Uint32Array(fits.length);
  const pairs = new Uint8Array(fits.length * 2);
  let vertex = 0;
  for (let index = 0; index < fits.length; index += 1) {
    const fit = fits[index] as ChainFit;
    first[index] = vertex;
    for (let read = 0; read * 2 < fit.points.length; read += 1) {
      positions[vertex * 3] = fit.points[read * 2] as number;
      positions[vertex * 3 + 1] = 0;
      positions[vertex * 3 + 2] = fit.points[read * 2 + 1] as number;
      curvature[vertex] = fit.curvature[read] as number;
      vertex += 1;
    }
    last[index] = vertex - 1;
    const pair = chainPair(grid, trace.chains[index] as TracedChain);
    pairs[index * 2] = pair[0];
    pairs[index * 2 + 1] = pair[1];
  }

  return {
    chainCount: fits.length,
    vertexCount,
    positions,
    curvature,
    first,
    last,
    pairs,
  };
}

/** Traces the grid and gives the simplified boundary set. */
export function traceRegionLines(grid: RegionGrid): RegionLines {
  return packRegionLines(grid, traceRegionChains(grid));
}

/**
 * Takes one cell of the trace grid per coarse cell, so the coarse grid costs no
 * further region lookups. The step is the smallest that holds the grid to 512 cells
 * per axis, which is 4 on the shipped grid: 507 cells of 197.4 light years.
 */
export function buildCoarseRegionGrid(grid: RegionGrid): CoarseRegionGrid {
  const step = Math.ceil(grid.size / COARSE_REGION_GRID_MAX);
  const size = Math.ceil(grid.size / step);
  const half = step >> 1;
  const ids = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    const readZ = Math.min(grid.size - 1, iz * step + half);
    for (let ix = 0; ix < size; ix += 1) {
      const readX = Math.min(grid.size - 1, ix * step + half);
      ids[iz * size + ix] = grid.ids[readZ * grid.size + readX] as number;
    }
  }
  return {
    size,
    origin: [grid.origin[0] as number, grid.origin[1] as number],
    cell: grid.cell * step,
    ids,
  };
}

/** What one region worker run gives the main thread. */
export interface RegionData {
  /** The boundary set the renderer draws. */
  readonly lines: RegionLines;
  /** The coarse region grid the label placement samples. */
  readonly grid: CoarseRegionGrid;
  /** The label centres, their clearances and the downsampled clearance field. */
  readonly geometry: RegionLabelGeometry;
}

/**
 * Fills the grid, traces it, and takes the coarse grid and the label geometry from
 * it, in one call. The departure bound travels on the message, because this module
 * declares it and imports the 199 KiB region cell lookup.
 */
export function buildRegionData(
  bounds: Range = galaxyModel.bounds,
  size: number = REGION_GRID_SIZE,
): RegionData {
  const grid = fillRegionGrid(bounds, size);
  const field = buildClearanceField(grid);
  return {
    lines: traceRegionLines(grid),
    grid: buildCoarseRegionGrid(grid),
    geometry: buildRegionLabelGeometry(grid, field, REGION_DEPARTURE_LY),
  };
}

/** Fills the grid and traces it in one call. */
export function buildRegionLines(
  bounds: Range = galaxyModel.bounds,
  size: number = REGION_GRID_SIZE,
): RegionLines {
  return traceRegionLines(fillRegionGrid(bounds, size));
}
