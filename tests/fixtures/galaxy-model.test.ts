import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const parameterPath = fileURLToPath(
  new URL(
    '../../packages/galaxy-map/src/galaxy-model/galaxy-model.json',
    import.meta.url,
  ),
);
const fixturePath = fileURLToPath(new URL('./galaxy-model.json', import.meta.url));

interface FixturePoint {
  x: number;
  y: number;
  z: number;
}

interface Fixture {
  parameters_sha256: string;
  points: FixturePoint[];
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
const parameters = JSON.parse(readFileSync(parameterPath, 'utf8')) as {
  centre: [number, number, number];
  vertical: { max_height_ly: number };
};

describe('the committed fixture', () => {
  test('pins the parameter file by its hash', () => {
    const hash = createHash('sha256').update(readFileSync(parameterPath)).digest('hex');
    expect(fixture.parameters_sha256).toBe(hash);
  });

  test('holds at least 200 points', () => {
    expect(fixture.points.length).toBeGreaterThanOrEqual(200);
  });

  test('holds Sol, the galactic centre and Colonia', () => {
    const has = (x: number, y: number, z: number): boolean =>
      fixture.points.some((p) => p.x === x && p.y === y && p.z === z);
    expect(has(0, 0, 0)).toBe(true);
    expect(has(parameters.centre[0], parameters.centre[1], parameters.centre[2])).toBe(
      true,
    );
    expect(has(-9530, -910, 19808)).toBe(true);
  });

  test('holds a point beyond the maximum height', () => {
    const beyond = fixture.points.filter(
      (p) => Math.abs(p.y - parameters.centre[1]) > parameters.vertical.max_height_ly,
    );
    expect(beyond.length).toBeGreaterThan(0);
  });
});
