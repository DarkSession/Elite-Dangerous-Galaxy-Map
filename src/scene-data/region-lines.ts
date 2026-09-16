// Traces the boundaries of the galactic codex regions onto the galactic plane.
//
// This module reads `astro/codex-region-lookup`, which carries the cell grid and is
// about 199 KiB. Only `region-lines.worker.ts` imports this file, so the grid stays
// out of the main bundle.
import {
  CODEX_REGION_MAP_LY_PER_CELL,
  findCodexRegionAt,
} from '@elite-dangerous-almanac/core/astro/codex-region-lookup';
import { galaxyModel } from '../galaxy-model/model';
import type { Range } from '../galaxy-model/types';
import {
  NO_REGION_ID,
  REGION_COUNT,
  REGION_FLOW_END,
  REGION_FLOW_STEPS,
  regionOfId,
} from './regions';
import type { CoarseRegionGrid, RegionLines } from './types';

/** The edge of one cell of the region grid, in light years. It is 4,096 / 83. */
export const REGION_CELL_LY = CODEX_REGION_MAP_LY_PER_CELL;

/** How many cells the grid holds per axis over the model bounds. */
export const REGION_GRID_SIZE = 2027;

/**
 * How far the drawn line may sit from the traced boundary, in light years. It is one
 * cell, which is the resolution the region data has.
 */
export const REGION_DEPARTURE_LY = REGION_CELL_LY;

/** How many average passes each chain takes. */
export const REGION_SMOOTH_PASSES = 2;

/** The largest number of cells per axis the coarse region grid holds. */
export const COARSE_REGION_GRID_MAX = 512;

/** How many points on each side of a point the average reads. */
export const REGION_SMOOTH_HALF_WIDTH = 3;

/**
 * How far a point may move from the node the trace put it on, in cells. It sits below
 * the one cell departure bound twice over: the departure is measured polyline to
 * polyline, so the line can bow between two capped points, and the corner rounding
 * below costs about 5.6 light years of departure of its own.
 */
export const REGION_MOVE_CAP = 0.75;

/**
 * The tolerance the vertex reduction takes, in cells. It sits far below the noise of
 * the raster, so it only drops a point that is nearly on the line through its two
 * neighbours. It does not put the wander back.
 */
export const REGION_SIMPLIFY_TOLERANCE = 0.1;

/** How many corner rounding passes each chain takes after the average. */
export const REGION_ROUND_PASSES = 4;

/**
 * How far a rounding cut reaches along a segment, in cells. The cut also never takes
 * more than a quarter of a segment, so a short segment is not cut away.
 */
export const REGION_ROUND_CAP = 0.3;

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
 * Drops the points of a chain that lie within a tolerance of the line that would
 * replace them, by Douglas-Peucker. The points and the tolerance are in cells.
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
      let gap: number;
      if (span === 0) {
        gap = Math.hypot(px, pz);
      } else {
        gap = Math.abs(px * dz - pz * dx) / Math.sqrt(span);
      }
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

/**
 * Averages a chain along its length by one box filter pass, with the two endpoints
 * held fixed. The window shrinks near an end so it stays symmetric about the point it
 * writes, which keeps the pass from pulling the chain toward its ends. The points and
 * the half width are in cells, and the point count does not change.
 */
export function averageChain(points: Float64Array, halfWidth: number): Float64Array {
  const count = points.length / 2;
  const out = new Float64Array(points.length);
  if (count === 0) return out;
  out[0] = points[0] as number;
  out[1] = points[1] as number;
  out[points.length - 2] = points[points.length - 2] as number;
  out[points.length - 1] = points[points.length - 1] as number;
  for (let index = 1; index < count - 1; index += 1) {
    const width = Math.min(halfWidth, index, count - 1 - index);
    let sumX = 0;
    let sumZ = 0;
    for (let read = index - width; read <= index + width; read += 1) {
      sumX += points[read * 2] as number;
      sumZ += points[read * 2 + 1] as number;
    }
    const taken = width * 2 + 1;
    out[index * 2] = sumX / taken;
    out[index * 2 + 1] = sumZ / taken;
  }
  return out;
}

/**
 * Holds every interior point of a chain within a cap of the point the same index has
 * in a reference chain. The reference is the traced chain and not the pass before, so
 * the cap bounds the whole departure and not the step of one pass.
 */
export function capChain(
  points: Float64Array,
  reference: Float64Array,
  cap: number,
): Float64Array {
  const count = points.length / 2;
  const out = points.slice();
  for (let index = 1; index < count - 1; index += 1) {
    const baseX = reference[index * 2] as number;
    const baseZ = reference[index * 2 + 1] as number;
    const dx = (points[index * 2] as number) - baseX;
    const dz = (points[index * 2 + 1] as number) - baseZ;
    const away = Math.hypot(dx, dz);
    if (away <= cap) continue;
    const scale = cap / away;
    out[index * 2] = baseX + dx * scale;
    out[index * 2 + 1] = baseZ + dz * scale;
  }
  return out;
}

/**
 * Rounds the corners of a chain by one pass of Chaikin's corner cut, with the two
 * endpoints held fixed. The cut is capped: a new point sits at most `cap` cells from
 * the corner it cuts, along the segment it lies on, and never further than a quarter of
 * that segment. Without the cap a corner loses a quarter of each of its two segments,
 * and a smoothed chain has long segments, so a single corner could lose many cells. The
 * pass gives two points per segment, so the point count doubles.
 */
export function roundChain(points: Float64Array, cap: number): Float64Array {
  const count = points.length / 2;
  if (count < 2) return points.slice();

  const out = new Float64Array(count * 4);
  out[0] = points[0] as number;
  out[1] = points[1] as number;
  let write = 2;
  for (let index = 0; index < count - 1; index += 1) {
    const ax = points[index * 2] as number;
    const az = points[index * 2 + 1] as number;
    const dx = (points[index * 2 + 2] as number) - ax;
    const dz = (points[index * 2 + 3] as number) - az;
    const length = Math.hypot(dx, dz);
    const t = length === 0 ? 0 : Math.min(0.25, cap / length);
    out[write] = ax + t * dx;
    out[write + 1] = az + t * dz;
    out[write + 2] = ax + (1 - t) * dx;
    out[write + 3] = az + (1 - t) * dz;
    write += 4;
  }
  out[write] = points[count * 2 - 2] as number;
  out[write + 1] = points[count * 2 - 1] as number;
  return out;
}

/** The nodes of a traced chain as a point list in cells. */
export function chainPoints(chain: TracedChain): Float64Array {
  return Float64Array.from(chain.nodes);
}

/**
 * Smooths a chain by an average along it, with the movement of every point capped,
 * and then reduces the vertex count.
 *
 * Each pass averages the chain and then holds every interior point within
 * `REGION_MOVE_CAP` cells of the node the trace put it on. The cap keeps a real corner
 * a corner, because an average alone rounds a genuine 90 degree turn as readily as it
 * removes the steps of the raster.
 *
 * The reduction then runs, by Douglas-Peucker at `REGION_SIMPLIFY_TOLERANCE`. That
 * tolerance is far below the size of one step of the raster, so it only drops a point
 * that is nearly collinear with its neighbours.
 *
 * The average leaves long straight runs that meet at hard corners, so the last stage
 * rounds those corners over `REGION_ROUND_PASSES` capped Chaikin passes. The first two
 * bounds of the spec measure the turn of the line against its length and cannot see a
 * corner, because a corner has turn with no length.
 */
export function smoothChain(
  points: Float64Array,
  passes: number = REGION_SMOOTH_PASSES,
  roundPasses: number = REGION_ROUND_PASSES,
): Float64Array {
  let out = points;
  for (let pass = 0; pass < passes; pass += 1) {
    out = capChain(
      averageChain(out, REGION_SMOOTH_HALF_WIDTH),
      points,
      REGION_MOVE_CAP,
    );
  }
  out = simplifyChain(out, REGION_SIMPLIFY_TOLERANCE);
  for (let pass = 0; pass < roundPasses; pass += 1) {
    out = roundChain(out, REGION_ROUND_CAP);
  }
  return out;
}

/**
 * Drops the nodes of a chain that lie inside a straight run. A node whose edge in and
 * edge out point the same way lies exactly on the line between its neighbours, so the
 * line through the nodes that are left passes through the same points as the trace. Both
 * ends stay, whatever their direction.
 *
 * The chain is a run of unit edges, so a direction is a pair of integers and the test is
 * an equality and not a tolerance. The departure of the packed line from the trace is
 * therefore 0 and not a small number.
 */
export function collapseChain(points: Float64Array): Float64Array {
  const count = points.length / 2;
  if (count <= 2) return points.slice();
  const kept: number[] = [points[0] as number, points[1] as number];
  for (let index = 1; index < count - 1; index += 1) {
    const inX = (points[index * 2] as number) - (points[index * 2 - 2] as number);
    const inZ = (points[index * 2 + 1] as number) - (points[index * 2 - 1] as number);
    const outX = (points[index * 2 + 2] as number) - (points[index * 2] as number);
    const outZ = (points[index * 2 + 3] as number) - (points[index * 2 + 1] as number);
    if (inX === outX && inZ === outZ) continue;
    kept.push(points[index * 2] as number, points[index * 2 + 1] as number);
  }
  kept.push(points[count * 2 - 2] as number, points[count * 2 - 1] as number);
  return Float64Array.from(kept);
}

/** Packs a list of chains, each in cells, into the boundary set the renderer reads. */
export function packChains(
  grid: RegionGrid,
  chains: readonly Float64Array[],
): RegionLines {
  let vertexCount = 0;
  for (const chain of chains) vertexCount += chain.length / 2;

  const cell = grid.cell;
  const xLow = grid.origin[0] as number;
  const zLow = grid.origin[1] as number;
  const positions = new Float32Array(vertexCount * 3);
  const first = new Uint32Array(chains.length);
  const last = new Uint32Array(chains.length);
  let vertex = 0;
  for (let index = 0; index < chains.length; index += 1) {
    const chain = chains[index] as Float64Array;
    first[index] = vertex;
    for (let read = 0; read < chain.length; read += 2) {
      positions[vertex * 3] = xLow + (chain[read] as number) * cell;
      positions[vertex * 3 + 1] = 0;
      positions[vertex * 3 + 2] = zLow + (chain[read + 1] as number) * cell;
      vertex += 1;
    }
    last[index] = vertex - 1;
  }

  return { chainCount: chains.length, vertexCount, positions, first, last };
}

/** Packs the smoothed chains of a trace into the boundary set the renderer reads. */
export function packRegionLines(
  grid: RegionGrid,
  trace: RegionTrace,
  passes: number = REGION_SMOOTH_PASSES,
  roundPasses: number = REGION_ROUND_PASSES,
): RegionLines {
  return packChains(
    grid,
    trace.chains.map((chain) => smoothChain(chainPoints(chain), passes, roundPasses)),
  );
}

/**
 * Packs the chains of a trace as they were traced, with the straight runs collapsed. The
 * result is the staircase the region data is: it departs from the trace by 0 and it keeps
 * every 90 degree turn.
 */
export function packTracedLines(grid: RegionGrid, trace: RegionTrace): RegionLines {
  return packChains(
    grid,
    trace.chains.map((chain) => collapseChain(chainPoints(chain))),
  );
}

/** Traces the grid and gives the smoothed boundary set. */
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

/**
 * The cell of each region the flow field walks out from, as an index into the coarse
 * grid, or -1 for a region the grid holds no cell of. Index `id` holds the root of the
 * region of that id, so index 0 is never a root.
 *
 * The root is the cell of the region nearest that region's own centroid. Where the
 * centroid's own cell is on the region that is the centroid's cell itself, because no
 * cell sits nearer to a point than the cell that holds it.
 */
export function regionFlowRoots(coarse: CoarseRegionGrid): Int32Array {
  const size = coarse.size;
  const roots = new Int32Array(REGION_COUNT + 1).fill(-1);
  const gaps = new Float64Array(REGION_COUNT + 1).fill(Number.POSITIVE_INFINITY);
  for (let iz = 0; iz < size; iz += 1) {
    const z = (coarse.origin[1] as number) + (iz + 0.5) * coarse.cell;
    for (let ix = 0; ix < size; ix += 1) {
      const id = coarse.ids[iz * size + ix] as number;
      if (id === NO_REGION_ID) continue;
      const region = regionOfId(id);
      if (region === undefined) continue;
      const x = (coarse.origin[0] as number) + (ix + 0.5) * coarse.cell;
      const gapX = x - (region.centroid[0] as number);
      const gapZ = z - (region.centroid[1] as number);
      const gap = gapX * gapX + gapZ * gapZ;
      if (gap < (gaps[id] as number)) {
        gaps[id] = gap;
        roots[id] = iz * size + ix;
      }
    }
  }
  return roots;
}

/**
 * Builds the flow field over the coarse region grid: one byte for each cell, naming the
 * step to take to come nearer that cell's own region centre while staying on the region.
 *
 * The walk is breadth-first over the eight-neighbourhood, one region at a time, from
 * that region's root cell. A cell the walk reaches writes the step **back** along the
 * edge the walk reached it by, so following the bytes from any reached cell walks the
 * tree to the root. The root writes the end-of-path byte, and so does every cell the
 * walk never reached, which is a patch of the region with no path to the centre.
 *
 * One field covers all 42 regions, because a cell holds exactly one region id and the
 * step it carries is a step inside that region. One array of 507 by 507 bytes is 251
 * KiB, against 42 of the same, which is 10.3 MB.
 *
 * The walk runs once over the 257,049 cells of the coarse grid. Its cost does not
 * follow the star systems the map holds.
 */
export function buildRegionFlow(coarse: CoarseRegionGrid): Uint8Array {
  const size = coarse.size;
  const ids = coarse.ids;
  const flow = new Uint8Array(size * size).fill(REGION_FLOW_END);
  const reached = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  const roots = regionFlowRoots(coarse);

  for (let id = 1; id <= REGION_COUNT; id += 1) {
    const root = roots[id] as number;
    if (root < 0) continue;
    reached[root] = 1;
    queue[0] = root;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const at = queue[head] as number;
      head += 1;
      const ix = at % size;
      const iz = (at - ix) / size;
      for (let step = 0; step < REGION_FLOW_STEPS.length; step += 1) {
        const move = REGION_FLOW_STEPS[step] as readonly [number, number];
        const nextX = ix + move[0];
        const nextZ = iz + move[1];
        if (nextX < 0 || nextZ < 0 || nextX >= size || nextZ >= size) continue;
        const next = nextZ * size + nextX;
        if (reached[next] === 1) continue;
        if ((ids[next] as number) !== id) continue;
        reached[next] = 1;
        // The step back to the cell the walk came from is the opposite of the step it
        // came by, and the eight steps run around the circle in order.
        flow[next] = (step + 4) & 7;
        queue[tail] = next;
        tail += 1;
      }
    }
  }
  return flow;
}

/** What one region worker run gives the main thread. */
export interface RegionData {
  /** The smoothed boundary set, which the `simplified` mode draws. */
  readonly lines: RegionLines;
  /** The traced boundary set, which the `accurate` mode draws. */
  readonly traced: RegionLines;
  /** The coarse region grid the label placement samples. */
  readonly grid: CoarseRegionGrid;
  /** The flow field over that grid, which a blocked label follows. */
  readonly flow: Uint8Array;
}

/**
 * Fills the grid, traces it and takes the coarse grid from it, in one call. One trace
 * serves both boundary sets, so the second set costs the region lookups nothing.
 */
export function buildRegionData(
  bounds: Range = galaxyModel.bounds,
  size: number = REGION_GRID_SIZE,
): RegionData {
  const grid = fillRegionGrid(bounds, size);
  const trace = traceRegionChains(grid);
  const coarse = buildCoarseRegionGrid(grid);
  return {
    lines: packRegionLines(grid, trace),
    traced: packTracedLines(grid, trace),
    grid: coarse,
    flow: buildRegionFlow(coarse),
  };
}

/** Fills the grid and traces it in one call. */
export function buildRegionLines(
  bounds: Range = galaxyModel.bounds,
  size: number = REGION_GRID_SIZE,
): RegionLines {
  return traceRegionLines(fillRegionGrid(bounds, size));
}
