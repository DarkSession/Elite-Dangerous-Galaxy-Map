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
import { NO_REGION_ID } from './regions';
import type { RegionLines } from './types';

/** The edge of one cell of the region grid, in light years. It is 4,096 / 83. */
export const REGION_CELL_LY = CODEX_REGION_MAP_LY_PER_CELL;

/** How many cells the grid holds per axis over the model bounds. */
export const REGION_GRID_SIZE = 2027;

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
 * Emits a line on every edge between two neighbouring cells that hold different ids,
 * and merges collinear neighbouring lines into one run. The runs are on the plane
 * `y = 0`, in game coordinates.
 */
export function traceRegionLines(grid: RegionGrid): RegionLines {
  const size = grid.size;
  const cell = grid.cell;
  const xLow = grid.origin[0] as number;
  const zLow = grid.origin[1] as number;
  const ids = grid.ids;
  const ends: number[] = [];

  const emit = (fromX: number, fromZ: number, toX: number, toZ: number): void => {
    ends.push(fromX, 0, fromZ, toX, 0, toZ);
  };

  // The edges that run along `z`, between the cell at `ix - 1` and the one at `ix`.
  for (let ix = 1; ix < size; ix += 1) {
    const x = xLow + ix * cell;
    let start = -1;
    for (let iz = 0; iz < size; iz += 1) {
      const row = iz * size;
      const different = ids[row + ix - 1] !== ids[row + ix];
      if (different && start < 0) start = iz;
      if (!different && start >= 0) {
        emit(x, zLow + start * cell, x, zLow + iz * cell);
        start = -1;
      }
    }
    if (start >= 0) emit(x, zLow + start * cell, x, zLow + size * cell);
  }

  // The edges that run along `x`, between the cell at `iz - 1` and the one at `iz`.
  for (let iz = 1; iz < size; iz += 1) {
    const z = zLow + iz * cell;
    const row = iz * size;
    const above = row - size;
    let start = -1;
    for (let ix = 0; ix < size; ix += 1) {
      const different = ids[above + ix] !== ids[row + ix];
      if (different && start < 0) start = ix;
      if (!different && start >= 0) {
        emit(xLow + start * cell, z, xLow + ix * cell, z);
        start = -1;
      }
    }
    if (start >= 0) emit(xLow + start * cell, z, xLow + size * cell, z);
  }

  return { count: ends.length / 6, positions: new Float32Array(ends) };
}

/** Fills the grid and traces it in one call. */
export function buildRegionLines(
  bounds: Range = galaxyModel.bounds,
  size: number = REGION_GRID_SIZE,
): RegionLines {
  return traceRegionLines(fillRegionGrid(bounds, size));
}
