import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeDetailGrid, DETAIL_SIZE } from './detail';
import type { SurfaceDetailGrid } from './detail';
import parameters from './galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from './model';
import type { GalaxyModel } from './model';
import { buildPng } from './png-fixture';

const pngPath = fileURLToPath(new URL('./galaxy-detail.png', import.meta.url));
const fixturePath = fileURLToPath(
  new URL('../../tests/fixtures/galaxy-detail.json', import.meta.url),
);

interface DetailFixturePoint {
  x: number;
  z: number;
  detail: number;
  detailed_surface_density: number;
}

interface DetailFixture {
  detail_sha256: string;
  size: number;
  scale: number;
  points: DetailFixturePoint[];
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as DetailFixture;
const pngBytes = new Uint8Array(readFileSync(pngPath));

let grid: SurfaceDetailGrid;
let model: GalaxyModel;

beforeAll(async () => {
  grid = await decodeDetailGrid(pngBytes);
  model = createGalaxyModel(parameters, grid);
});

/** True when a value is within 1e-6 relative, or 1e-6 absolute below 1. */
function agrees(value: number, expected: number): boolean {
  const scale = Math.max(Math.abs(expected), 1);
  return Math.abs(value - expected) <= 1e-6 * scale;
}

describe('the detail grid', () => {
  test('decodes the committed PNG to the fixture hash', () => {
    expect(grid.size).toBe(DETAIL_SIZE);
    expect(grid.scale).toBe(fixture.scale);
    expect(grid.values.length).toBe(DETAIL_SIZE * DETAIL_SIZE);
    const hash = createHash('sha256').update(grid.values).digest('hex');
    expect(hash).toBe(fixture.detail_sha256);
  });

  test('rejects an image that is not 1024 by 1024', async () => {
    const small = await buildPng(
      [
        [10, 200],
        [45, 255],
      ],
      [0, 0],
    );
    await expect(decodeDetailGrid(small)).rejects.toThrow(/1024 by 1024/);
  });

  test('matches the fixture detail at every point', () => {
    for (const point of fixture.points) {
      const value = model.detail(point.x, point.z);
      expect(agrees(value, point.detail), `detail at ${point.x}, ${point.z}`).toBe(
        true,
      );
    }
  });

  test('matches the fixture detailed surface density at every point', () => {
    for (const point of fixture.points) {
      const value = model.detailedSurfaceDensity(point.x, point.z);
      expect(
        agrees(value, point.detailed_surface_density),
        `density at ${point.x}, ${point.z}`,
      ).toBe(true);
    }
  });

  test('gives the first arm more texture than the corrected model does', () => {
    let detailedLow = Number.POSITIVE_INFINITY;
    let detailedHigh = 0;
    let correctedLow = Number.POSITIVE_INFINITY;
    let correctedHigh = 0;
    for (let radius = 24000; radius <= 27000; radius += 100) {
      const point = model.armPoint(0, radius);
      const detailed = model.detailedSurfaceDensity(point.x, point.z);
      const corrected = model.correctedSurfaceDensity(point.x, point.z);
      detailedLow = Math.min(detailedLow, detailed);
      detailedHigh = Math.max(detailedHigh, detailed);
      correctedLow = Math.min(correctedLow, corrected);
      correctedHigh = Math.max(correctedHigh, corrected);
    }
    expect(detailedHigh / detailedLow).toBeGreaterThan(3);
    expect(correctedHigh / correctedLow).toBeLessThan(2.5);
  });

  test('moves the mass-code-0 budget at Sol', () => {
    const budget = model.document.calibration.mc0_budget_msun_per_ly3_per_unit;
    const detailed = model.detailedMassDensity(0, 0, 0);
    const corrected = model.massDensity(0, 0, 0);
    expect(Math.abs(detailed - 7.9125e-4) / 7.9125e-4).toBeLessThan(1e-3);
    expect(Math.abs(corrected - 7.56e-4) / 7.56e-4).toBeLessThan(1e-3);
    const product = model.detailedVolumeDensity(0, 0, 0) * budget;
    expect(Math.abs(detailed - product) / product).toBeLessThan(1e-12);
  });

  test('gives no detail without a grid', () => {
    const plain = createGalaxyModel(parameters);
    expect(plain.detail(0, 0)).toBe(0);
    expect(plain.detailedSurfaceDensity(0, 0)).toBe(
      plain.correctedSurfaceDensity(0, 0),
    );
    expect(plain.detailedVolumeDensity(0, 0, 0)).toBe(plain.volumeDensity(0, 0, 0));
    expect(plain.detailedMassDensity(0, 0, 0)).toBe(plain.massDensity(0, 0, 0));
  });
});
