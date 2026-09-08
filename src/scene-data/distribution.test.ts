// Compares the point cloud against numeric integrals of the model. The integrals use
// polar cells, which the sampler does not, so the two paths stay independent.
import { beforeAll, describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { buildSurfaceTable, generatePointCloud } from './point-cloud';
import type { SurfaceTable } from './point-cloud';
import type { PointCloud } from './types';

const SAMPLE_COUNT = 200000;

let cloud: PointCloud;

beforeAll(() => {
  const table: SurfaceTable = buildSurfaceTable();
  cloud = generatePointCloud(galaxyModel, {
    count: SAMPLE_COUNT,
    seed: 11,
    table,
  });
}, 120000);

/** The fraction of the model's plane mass inside a radius, by polar integration. */
function massFractionInside(radius: number): number {
  const [centreX, , centreZ] = galaxyModel.centre;
  const stepRadius = 50;
  const steps = 1000;
  const azimuths = 360;
  let inside = 0;
  let total = 0;
  for (let index = 0; index < steps; index += 1) {
    const ring = (index + 0.5) * stepRadius;
    let sum = 0;
    for (let a = 0; a < azimuths; a += 1) {
      const angle = ((a + 0.5) * 2 * Math.PI) / azimuths;
      sum += galaxyModel.correctedSurfaceDensity(
        centreX + ring * Math.cos(angle),
        centreZ + ring * Math.sin(angle),
      );
    }
    const mass = ((sum * 2 * Math.PI) / azimuths) * ring * stepRadius;
    total += mass;
    if (ring < radius) inside += mass;
  }
  return inside / total;
}

/** The fraction of a column's mass within a height, by numeric integration. */
function columnFractionWithin(radius: number, height: number): number {
  const step = 0.05;
  let inside = 0;
  let total = 0;
  for (let y = -3000 + step / 2; y < 3000; y += step) {
    const value = galaxyModel.verticalProfile(y, radius) * step;
    total += value;
    if (Math.abs(y) < height) inside += value;
  }
  return inside / total;
}

describe('the point cloud distribution', () => {
  test('matches the model radially inside 10,000 light years', () => {
    const [centreX, , centreZ] = galaxyModel.centre;
    let inside = 0;
    for (let index = 0; index < cloud.count; index += 1) {
      const base = index * 3;
      const radius = Math.hypot(
        (cloud.positions[base] as number) - centreX,
        (cloud.positions[base + 2] as number) - centreZ,
      );
      if (radius < 10000) inside += 1;
    }
    const sampled = inside / cloud.count;
    const expected = massFractionInside(10000);
    expect(Math.abs(sampled - expected)).toBeLessThan(0.03);
  }, 120000);

  test('matches the model vertically at 20,000 light years', () => {
    const [centreX, centreY, centreZ] = galaxyModel.centre;
    let inRing = 0;
    let inSlab = 0;
    for (let index = 0; index < cloud.count; index += 1) {
      const base = index * 3;
      const radius = Math.hypot(
        (cloud.positions[base] as number) - centreX,
        (cloud.positions[base + 2] as number) - centreZ,
      );
      if (radius < 19000 || radius > 21000) continue;
      inRing += 1;
      if (Math.abs((cloud.positions[base + 1] as number) - centreY) < 210) inSlab += 1;
    }
    expect(inRing).toBeGreaterThan(500);
    const sampled = inSlab / inRing;
    const expected = columnFractionWithin(20000, 210);
    expect(Math.abs(sampled - expected)).toBeLessThan(0.03);
  }, 120000);
});
