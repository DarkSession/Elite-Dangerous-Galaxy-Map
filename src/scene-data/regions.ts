// The 42 galactic codex regions, as the map reads them, and the reader of the coarse
// region grid.
//
// This module reads `astro/codex-region` only, which is the region metadata and about
// 9 KiB. The cell grid that resolves a position to a region lives in
// `astro/codex-region-lookup`, which is 199 KiB; `region-lines.ts` reads that one, and
// only a worker imports it, so it never reaches the main bundle. The label sweep runs
// on the main thread and reads the coarse grid, so `coarseRegionIdAt` lives here and
// not beside the trace.
import { CODEX_REGIONS } from '@elite-dangerous-almanac/core/astro/codex-region';
import type { CoarseRegionGrid } from './types';

/** How many galactic codex regions the game has. */
export const REGION_COUNT = 42;

/** Axis-aligned bounds of a region on the galactic plane, in light years. */
export interface RegionBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** One galactic codex region. */
export interface Region {
  /** The region id, 1 to 42. */
  readonly id: number;
  /** The region name, for example `Inner Orion Spur`. */
  readonly name: string;
  /** The footprint area on the galactic plane, in square light years. */
  readonly area: number;
  /** The axis-aligned bounds on the galactic plane, in light years. */
  readonly bounds: RegionBounds;
  /** The centroid on the galactic plane, in light years, as `x` and `z`. */
  readonly centroid: readonly [number, number];
}

/** The id a position outside the mapped region grid takes. */
export const NO_REGION_ID = 0;

/** The 42 regions, in order of id. Index `i` holds the region of id `i + 1`. */
export const REGIONS: readonly Region[] = CODEX_REGIONS.map((region) => ({
  id: region.id,
  name: region.name,
  area: region.areaLy2,
  bounds: {
    minX: region.bounds.minX,
    maxX: region.bounds.maxX,
    minZ: region.bounds.minZ,
    maxZ: region.bounds.maxZ,
  },
  centroid: [region.centroid.x, region.centroid.z] as const,
}));

/** The region of an id, or undefined for an id outside 1 to 42. */
export function regionOfId(id: number): Region | undefined {
  return REGIONS[id - 1];
}

/** The cell index of a plane point on one axis of the coarse grid. */
function coarseCell(grid: CoarseRegionGrid, value: number, axis: 0 | 1): number {
  return Math.floor((value - (grid.origin[axis] as number)) / grid.cell);
}

/**
 * True when a plane point lies inside the box the coarse grid covers. The label sweep
 * counts only the samples that land inside it, because a sample outside the box and a
 * cell that holds no region both read as the id 0.
 */
export function insideCoarseRegionGrid(
  grid: CoarseRegionGrid,
  x: number,
  z: number,
): boolean {
  const ix = coarseCell(grid, x, 0);
  const iz = coarseCell(grid, z, 1);
  return ix >= 0 && iz >= 0 && ix < grid.size && iz < grid.size;
}

/**
 * The region id at a plane point, from the coarse grid. A point outside the grid
 * takes the id 0, as a point outside the mapped region grid does.
 */
export function coarseRegionIdAt(grid: CoarseRegionGrid, x: number, z: number): number {
  if (!insideCoarseRegionGrid(grid, x, z)) return NO_REGION_ID;
  const ix = coarseCell(grid, x, 0);
  const iz = coarseCell(grid, z, 1);
  return grid.ids[iz * grid.size + ix] as number;
}
