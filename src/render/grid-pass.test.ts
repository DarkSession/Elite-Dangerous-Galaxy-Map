import { describe, expect, test } from 'vitest';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import { MODEL_BOUNDS } from '../scene-data/real-systems';
import {
  buildGridVertices,
  GRID_HALF_LINES,
  GRID_LINES_PER_AXIS,
  GRID_MAJOR_EVERY,
  GRID_MAX_VERTICES,
  GRID_MIN_CSS,
  gridCentreLine,
  gridScreenSpacing,
  gridSpacing,
} from './grid-pass';

/** The CSS pixels per light year at one light year of range, for a viewport height. */
function focalCss(rows: number): number {
  return rows / (2 * Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360));
}

describe('the grid spacing', () => {
  test('follows the zoom through the 1-2-5 sequence', () => {
    const focal = focalCss(1080);

    expect(gridSpacing(focal, 10)).toBe(1);
    expect(gridSpacing(focal, 100)).toBe(5);
    expect(gridSpacing(focal, 1000)).toBe(50);
    expect(gridSpacing(focal, 10000)).toBe(500);
    expect(gridSpacing(focal, 120000)).toBe(10000);
  });

  test('holds the spacing on the screen inside 40 to 100 CSS pixels', () => {
    for (const rows of [1080, 400]) {
      const focal = focalCss(rows);
      for (let step = 0; step <= 200; step += 1) {
        const distance = 10 + (step * (120000 - 10)) / 200;
        const spacing = gridSpacing(focal, distance);
        const onScreen = gridScreenSpacing(focal, distance, spacing);

        expect(onScreen).toBeGreaterThanOrEqual(GRID_MIN_CSS);
        expect(onScreen).toBeLessThan(100);
      }
    }
  });
});

describe('the middle line', () => {
  test('is the multiple of the spacing nearest the coordinate', () => {
    expect(gridCentreLine(0, 50)).toBe(0);
    expect(gridCentreLine(1240, 50)).toBe(1250);
    expect(gridCentreLine(-1240, 50)).toBe(-1250);
  });
});

describe('the grid line set', () => {
  test('draws 129 lines on each axis in at most 516 vertices', () => {
    const offsets = new Float32Array(GRID_MAX_VERTICES * 3);
    const planes = new Float32Array(GRID_MAX_VERTICES * 3);
    const count = buildGridVertices(
      [0, 0, 0],
      [0, 1000, -2000],
      50,
      MODEL_BOUNDS,
      offsets,
      planes,
    );

    expect(count).toBe(GRID_LINES_PER_AXIS * 2 * 2);
    expect(count).toBeLessThanOrEqual(GRID_MAX_VERTICES);
  });

  test('leaves out a line beyond the model bounds on its own axis', () => {
    const offsets = new Float32Array(GRID_MAX_VERTICES * 3);
    const planes = new Float32Array(GRID_MAX_VERTICES * 3);
    const cursor: [number, number, number] = [MODEL_BOUNDS.x[1], 0, 0];
    const count = buildGridVertices(
      cursor,
      [cursor[0], 0, 0],
      10000,
      MODEL_BOUNDS,
      offsets,
      planes,
    );

    expect(count).toBeLessThan(GRID_MAX_VERTICES);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const x = (offsets[vertex * 3] as number) + cursor[0];
      expect(x).toBeLessThanOrEqual(MODEL_BOUNDS.x[1] + 1e-6);
    }
  });

  test('marks every fifth line from the middle', () => {
    const offsets = new Float32Array(GRID_MAX_VERTICES * 3);
    const planes = new Float32Array(GRID_MAX_VERTICES * 3);
    const count = buildGridVertices(
      [0, 0, 0],
      [0, 0, 0],
      50,
      MODEL_BOUNDS,
      offsets,
      planes,
    );

    let major = 0;
    for (let vertex = 0; vertex < count; vertex += 2) {
      if ((planes[vertex * 3 + 2] as number) > 0.5) major += 1;
    }
    const perAxis = 1 + 2 * Math.floor(GRID_HALF_LINES / GRID_MAJOR_EVERY);

    expect(major).toBe(perAxis * 2);
  });

  test('holds the plane offset in spacings, so the fade reads it', () => {
    const offsets = new Float32Array(GRID_MAX_VERTICES * 3);
    const planes = new Float32Array(GRID_MAX_VERTICES * 3);
    const count = buildGridVertices(
      [0, 0, 0],
      [0, 0, 0],
      50,
      MODEL_BOUNDS,
      offsets,
      planes,
    );

    let widest = 0;
    for (let vertex = 0; vertex < count; vertex += 1) {
      const planeX = planes[vertex * 3] as number;
      const planeZ = planes[vertex * 3 + 1] as number;
      widest = Math.max(widest, Math.abs(planeX), Math.abs(planeZ));
    }

    expect(widest).toBeCloseTo(GRID_HALF_LINES, 6);
  });
});
