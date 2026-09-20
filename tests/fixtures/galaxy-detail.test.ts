import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const pngPath = fileURLToPath(
  new URL(
    '../../packages/galaxy-map/src/galaxy-model/galaxy-detail.png',
    import.meta.url,
  ),
);
const fixturePath = fileURLToPath(new URL('./galaxy-detail.json', import.meta.url));
const parameterPath = fileURLToPath(
  new URL(
    '../../packages/galaxy-map/src/galaxy-model/galaxy-model.json',
    import.meta.url,
  ),
);

interface DetailFixturePoint {
  x: number;
  z: number;
  detail: number;
  detailed_surface_density: number;
}

interface DetailFixture {
  format: string;
  png_sha256: string;
  detail_sha256: string;
  size: number;
  scale: number;
  points: DetailFixturePoint[];
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as DetailFixture;
const parameters = JSON.parse(readFileSync(parameterPath, 'utf8')) as {
  bounds: { x: [number, number]; z: [number, number] };
};

describe('the committed detail fixture', () => {
  test('pins the detail PNG by its hash', () => {
    const hash = createHash('sha256').update(readFileSync(pngPath)).digest('hex');
    expect(fixture.png_sha256).toBe(hash);
  });

  test('holds at least 200 points', () => {
    expect(fixture.points.length).toBeGreaterThanOrEqual(200);
  });

  test('holds Sol, the galactic centre and Colonia', () => {
    const has = (x: number, z: number): boolean =>
      fixture.points.some((point) => point.x === x && point.z === z);
    expect(has(0, 0)).toBe(true);
    expect(has(15, 25895)).toBe(true);
    expect(has(-9530, 19808)).toBe(true);
  });

  test('holds a point outside the model bounds', () => {
    const bounds = parameters.bounds;
    const outside = fixture.points.filter(
      (point) =>
        point.x < bounds.x[0] ||
        point.x > bounds.x[1] ||
        point.z < bounds.z[0] ||
        point.z > bounds.z[1],
    );
    expect(outside.length).toBeGreaterThan(0);
  });
});
