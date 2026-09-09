import { describe, expect, test } from 'vitest';
// The lookup grid is 199 KiB and worker only, so no module under `src/` outside
// `region-lines.ts` imports it. A test is not bundled, so it may read it directly.
import { findCodexRegionAt } from '@elite-dangerous-almanac/core/astro/codex-region-lookup';
import { NO_REGION_ID, REGION_COUNT, REGIONS, regionOfId } from './regions';

describe('the region list', () => {
  test('holds 42 regions with ids from 1 to 42 and a name each', () => {
    expect(REGIONS.length).toBe(REGION_COUNT);
    for (let index = 0; index < REGIONS.length; index += 1) {
      const region = REGIONS[index];
      if (region === undefined) throw new Error(`the list has a gap at ${index}`);
      expect(region.id).toBe(index + 1);
      expect(typeof region.name).toBe('string');
      expect(region.name.length).toBeGreaterThan(0);
    }
  });

  test('carries a footprint, bounds and a centroid for every region', () => {
    for (const region of REGIONS) {
      expect(region.area).toBeGreaterThan(0);
      expect(region.bounds.maxX).toBeGreaterThan(region.bounds.minX);
      expect(region.bounds.maxZ).toBeGreaterThan(region.bounds.minZ);
      expect(region.centroid[0]).toBeGreaterThanOrEqual(region.bounds.minX);
      expect(region.centroid[0]).toBeLessThanOrEqual(region.bounds.maxX);
      expect(region.centroid[1]).toBeGreaterThanOrEqual(region.bounds.minZ);
      expect(region.centroid[1]).toBeLessThanOrEqual(region.bounds.maxZ);
    }
  });

  test('reads a region back by its id', () => {
    expect(regionOfId(1)?.name).toBe('Galactic Centre');
    expect(regionOfId(18)?.name).toBe('Inner Orion Spur');
    expect(regionOfId(NO_REGION_ID)).toBeUndefined();
    expect(regionOfId(43)).toBeUndefined();
  });
});

describe('known positions', () => {
  test('resolve to the region the game names', () => {
    expect(findCodexRegionAt({ x: 0, y: 0, z: 0 })?.name).toBe('Inner Orion Spur');
    expect(findCodexRegionAt({ x: 15, y: -35, z: 25895 })?.name).toBe(
      'Galactic Centre',
    );
  });

  test('give the Inner Orion Spur the centroid the label rule reads', () => {
    const spur = regionOfId(18);
    expect(spur?.centroid[0]).toBeCloseTo(-2451.1, 1);
    expect(spur?.centroid[1]).toBeCloseTo(3802.0, 1);
  });
});
