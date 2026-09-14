import { describe, expect, test } from 'vitest';
import { cameraPosition } from '../camera/projection';
import type { View } from '../camera/view';
import { createSystemSet, MODEL_BOUNDS } from '../scene-data/real-systems';
import { SeededRandom } from '../scene-data/random';
import {
  buildMarkerColors,
  markerCssSize,
  MAX_MARKER_CSS,
  MIN_MARKER_CSS,
  rebasePositions,
  RING_COLOR,
} from './system-pass';

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
  };
}

/** 1,000 positions spread over the model bounds. */
function spreadPositions(seed: number): Float64Array {
  const random = new SeededRandom(seed);
  const axes = [MODEL_BOUNDS.x, MODEL_BOUNDS.y, MODEL_BOUNDS.z] as const;
  const positions = new Float64Array(1000 * 3);
  for (let index = 0; index < 1000; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const span = axes[axis] as readonly [number, number];
      positions[index * 3 + axis] = span[0] + random.float() * (span[1] - span[0]);
    }
  }
  return positions;
}

describe('the marker rebase', () => {
  test('matches the float64 subtraction over 1,000 positions', () => {
    const positions = spreadPositions(7);
    const camera: [number, number, number] = [1234.5, -67.25, 25895.125];
    const out = new Float32Array(1000 * 3);
    rebasePositions(positions, 1000, camera, out);
    for (let index = 0; index < 1000; index += 1) {
      const base = index * 3;
      expect(out[base]).toBe(Math.fround((positions[base] as number) - camera[0]));
      expect(out[base + 1]).toBe(
        Math.fround((positions[base + 1] as number) - camera[1]),
      );
      expect(out[base + 2]).toBe(
        Math.fround(camera[2] - (positions[base + 2] as number)),
      );
    }
  });
});

describe('a drawn marker position', () => {
  test('stays within 0.01 light years of the float64 position', () => {
    const cursors: [number, number, number][] = [
      [50000, 0, 75000],
      [0, 0, 0],
    ];
    const positions = spreadPositions(11);
    const out = new Float32Array(1000 * 3);
    let worst = 0;
    for (const cursor of cursors) {
      for (const distance of [500, 20000, 120000]) {
        const view: View = { cursor, distance, yaw: 37, pitch: 35 };
        const camera = cameraPosition(view);
        rebasePositions(positions, 1000, camera, out);
        for (let index = 0; index < 1000; index += 1) {
          const base = index * 3;
          const exact = [
            (positions[base] as number) - camera[0],
            (positions[base + 1] as number) - camera[1],
            camera[2] - (positions[base + 2] as number),
          ];
          for (let axis = 0; axis < 3; axis += 1) {
            worst = Math.max(
              worst,
              Math.abs((out[base + axis] as number) - (exact[axis] as number)),
            );
          }
        }
      }
    }
    expect(worst).toBeLessThan(0.01);
  });
});

describe('the marker colour buffer', () => {
  test('reads the category of each system', () => {
    const set = createSystemSet();
    set.addCategories([
      { name: 'Empire', color: [0, 180, 255] },
      { name: 'Alliance', color: [0, 255, 120] },
    ]);
    set.addSystems([
      record('One', [0, 0, 0], 'Empire'),
      record('Two', [10, 0, 0], 'Alliance'),
      record('Three', [20, 0, 0], 'Empire'),
    ]);
    const colors = new Float32Array(9);
    buildMarkerColors(set, colors);
    expect(Array.from(colors.subarray(0, 3))).toEqual([0, Math.fround(180 / 255), 1]);
    expect(Array.from(colors.subarray(3, 6))).toEqual([0, 1, Math.fround(120 / 255)]);
    expect(Array.from(colors.subarray(6, 9))).toEqual([0, Math.fround(180 / 255), 1]);
  });

  test('takes the new colour after a category is replaced under the same name', () => {
    const set = createSystemSet();
    set.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    set.addSystems([record('One', [0, 0, 0], 'Empire')]);
    const colors = new Float32Array(3);
    buildMarkerColors(set, colors);
    expect(colors[2]).toBe(1);

    const report = set.addCategories([{ name: 'Empire', color: [255, 40, 40] }]);
    expect(report.replaced).toBe(1);
    buildMarkerColors(set, colors);
    expect(Array.from(colors)).toEqual([
      1,
      Math.fround(40 / 255),
      Math.fround(40 / 255),
    ]);
  });
});

describe('the marker size', () => {
  test('falls to the floor and rises to the cap', () => {
    // The browser suite renders 720 rows at a 60 degree field of view, so the focal
    // length is 623.5 CSS pixels per light year at one light year of range.
    const focalCss = 720 / (2 * Math.tan((60 * Math.PI) / 360));
    expect(markerCssSize(focalCss, 120000)).toBe(MIN_MARKER_CSS);
    expect(markerCssSize(focalCss, 500)).toBe(MAX_MARKER_CSS);
    // The cap boundary sits near 1,040 light years of range.
    expect(markerCssSize(focalCss, 1040)).toBeCloseTo(MAX_MARKER_CSS, 1);
    // The floor boundary sits near 1,780 light years of range.
    expect(markerCssSize(focalCss, 1500)).toBeGreaterThan(MIN_MARKER_CSS);
    expect(markerCssSize(focalCss, 1500)).toBeLessThan(MAX_MARKER_CSS);
  });
});

describe('the ring colour', () => {
  test('matches the three numbers the fragment shader carries', () => {
    expect(RING_COLOR).toEqual([0.02, 0.04, 0.1]);
  });
});
