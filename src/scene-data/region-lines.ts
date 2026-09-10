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
 * Packs the simplified chains of a trace into the boundary set the renderer reads.
 * The tolerance is in light years, and the pack converts it to cells of the grid.
 */
export function packRegionLines(
  grid: RegionGrid,
  trace: RegionTrace,
  toleranceLy: number = REGION_FIT_TOLERANCE_LY,
): RegionLines {
  const simplified = trace.chains.map((chain) =>
    simplifyChain(chainPoints(chain), toleranceLy / grid.cell),
  );
  let vertexCount = 0;
  for (const chain of simplified) vertexCount += chain.length / 2;

  const cell = grid.cell;
  const xLow = grid.origin[0] as number;
  const zLow = grid.origin[1] as number;
  const positions = new Float32Array(vertexCount * 3);
  const first = new Uint32Array(simplified.length);
  const last = new Uint32Array(simplified.length);
  const pairs = new Uint8Array(simplified.length * 2);
  let vertex = 0;
  for (let index = 0; index < simplified.length; index += 1) {
    const chain = simplified[index] as Float64Array;
    first[index] = vertex;
    for (let read = 0; read < chain.length; read += 2) {
      positions[vertex * 3] = xLow + (chain[read] as number) * cell;
      positions[vertex * 3 + 1] = 0;
      positions[vertex * 3 + 2] = zLow + (chain[read + 1] as number) * cell;
      vertex += 1;
    }
    last[index] = vertex - 1;
    const pair = chainPair(grid, trace.chains[index] as TracedChain);
    pairs[index * 2] = pair[0];
    pairs[index * 2 + 1] = pair[1];
  }

  return { chainCount: simplified.length, vertexCount, positions, first, last, pairs };
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
