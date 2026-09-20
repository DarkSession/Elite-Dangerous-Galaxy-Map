import { describe, expect, test } from 'vitest';
import { generateCloudShapes, SHAPE_COLUMNS, shapeAtlasSide } from './cloud-shapes';
import type { CloudShapes } from './cloud-shapes';
import { TIMED_TEST } from '../../../../tests/timed';

const shapes = generateCloudShapes();

/** Reads one texel of one shape. */
function texel(set: CloudShapes, shape: number, x: number, y: number): number {
  const atlas = shapeAtlasSide(set);
  const column = shape % SHAPE_COLUMNS;
  const row = (shape - column) / SHAPE_COLUMNS;
  return set.data[(row * set.side + y) * atlas + column * set.side + x] as number;
}

/** The largest value of one shape. */
function peakOf(set: CloudShapes, shape: number): number {
  let peak = 0;
  for (let y = 0; y < set.side; y += 1) {
    for (let x = 0; x < set.side; x += 1) {
      peak = Math.max(peak, texel(set, shape, x, y));
    }
  }
  return peak;
}

describe('the cloud shapes', () => {
  test('gives one atlas of the stated size', () => {
    expect(shapes.count).toBe(16);
    expect(shapes.side).toBe(64);
    expect(shapes.data.length).toBe(shapeAtlasSide(shapes) ** 2);
    for (let shape = 0; shape < shapes.count; shape += 1) {
      expect(peakOf(shapes, shape)).toBe(255);
    }
  });

  test('is zero outside the inscribed disc', () => {
    for (let shape = 0; shape < shapes.count; shape += 1) {
      for (let y = 0; y < shapes.side; y += 1) {
        const dy = (2 * (y + 0.5)) / shapes.side - 1;
        for (let x = 0; x < shapes.side; x += 1) {
          const dx = (2 * (x + 0.5)) / shapes.side - 1;
          if (dx * dx + dy * dy > 1) {
            expect(texel(shapes, shape, x, y)).toBe(0);
          }
        }
      }
    }
  });

  test('has an irregular outline', () => {
    const directions = 32;
    for (let shape = 0; shape < shapes.count; shape += 1) {
      const quarter = 255 / 4;
      const radii: number[] = [];
      for (let step = 0; step < directions; step += 1) {
        const angle = (2 * Math.PI * step) / directions;
        let largest = 0;
        // The half side is the largest radius the inscribed disc holds.
        for (let radius = 0; radius <= shapes.side / 2; radius += 0.25) {
          const x = Math.floor(shapes.side / 2 + radius * Math.cos(angle));
          const y = Math.floor(shapes.side / 2 + radius * Math.sin(angle));
          if (x < 0 || y < 0 || x >= shapes.side || y >= shapes.side) break;
          if (texel(shapes, shape, x, y) >= quarter) largest = radius;
        }
        radii.push(largest);
      }
      const mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
      const variance =
        radii.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
        radii.length;
      expect(Math.sqrt(variance) / mean).toBeGreaterThanOrEqual(0.15);
    }
  });

  test('holds shapes that differ from one another', () => {
    const inside: [number, number][] = [];
    for (let y = 0; y < shapes.side; y += 1) {
      const dy = (2 * (y + 0.5)) / shapes.side - 1;
      for (let x = 0; x < shapes.side; x += 1) {
        const dx = (2 * (x + 0.5)) / shapes.side - 1;
        if (dx * dx + dy * dy <= 1) inside.push([x, y]);
      }
    }

    for (let first = 0; first < shapes.count; first += 1) {
      for (let second = first + 1; second < shapes.count; second += 1) {
        let sum = 0;
        for (const [x, y] of inside) {
          sum += Math.abs(texel(shapes, first, x, y) - texel(shapes, second, x, y));
        }
        expect(sum / inside.length / 255).toBeGreaterThanOrEqual(0.05);
      }
    }
  });

  test('is soft and holds light', () => {
    for (let shape = 0; shape < shapes.count; shape += 1) {
      let sum = 0;
      let cells = 0;
      for (let y = 0; y < shapes.side; y += 1) {
        const dy = (2 * (y + 0.5)) / shapes.side - 1;
        for (let x = 0; x < shapes.side; x += 1) {
          const dx = (2 * (x + 0.5)) / shapes.side - 1;
          if (dx * dx + dy * dy > 1) continue;
          sum += texel(shapes, shape, x, y);
          cells += 1;
        }
      }
      const mean = sum / cells / 255;
      expect(mean).toBeGreaterThanOrEqual(0.1);
      expect(mean).toBeLessThanOrEqual(0.35);
    }
  });

  test('repeats byte for byte with the same seed', () => {
    const first = generateCloudShapes();
    const second = generateCloudShapes();
    expect(Buffer.from(first.data.buffer)).toEqual(Buffer.from(second.data.buffer));
  });

  test('builds in under 50 ms', TIMED_TEST, () => {
    const start = performance.now();
    generateCloudShapes();
    const elapsed = performance.now() - start;
    console.log('cloud shape build', elapsed, 'ms');
    expect(elapsed).toBeLessThan(50);
  });
});
