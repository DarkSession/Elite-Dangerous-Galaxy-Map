// Pins the surface of `@elite-dangerous-almanac/core` that the map depends on. The
// package is pre-1.0, so a release can change an export. The version is pinned
// exactly, and this test fails the suite if a new pin moves either constant.
import { describe, expect, test } from 'vitest';
import {
  GALAXY_ORIGIN,
  SECTOR_EDGE_LY,
} from '@elite-dangerous-almanac/core/astro/galaxy-grid';
import {
  BASE_BOXEL_LY,
  boxelEdgeLy,
} from '@elite-dangerous-almanac/core/astro/mass-code';

describe('the almanac package', () => {
  test('puts the galaxy origin at (-49,985, -40,985, -24,105)', () => {
    expect(GALAXY_ORIGIN.x).toBe(-49985);
    expect(GALAXY_ORIGIN.y).toBe(-40985);
    expect(GALAXY_ORIGIN.z).toBe(-24105);
  });

  test('gives a sector edge of 1,280 light years', () => {
    expect(SECTOR_EDGE_LY).toBe(1280);
  });

  test('doubles the boxel edge from 10 light years to the sector', () => {
    expect(BASE_BOXEL_LY).toBe(10);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(boxelEdgeLy)).toEqual([
      10, 20, 40, 80, 160, 320, 640, 1280,
    ]);
    expect(boxelEdgeLy(7)).toBe(SECTOR_EDGE_LY);
  });
});
