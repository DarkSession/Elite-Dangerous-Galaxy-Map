// Emulates the vertex transform in `float32` with `Math.fround`, so the precision of
// camera-relative drawing can be measured without a GPU.
//
// The renderer subtracts the camera position from the chunk origin in `float64` on the
// CPU, uploads the result as one `vec3`, and the vertex shader adds the `float32`
// position that the chunk stores. The addition is exact: both terms are multiples of
// 2^-7 at 75,000 light years, and their sum near 2,000 light years is a `float32`
// value. The error that is left comes from the matrix multiply, and it is the
// `float32` limit: at distance 2,000 the separation of 1/32 light year is 2^-16 of
// the coordinate, which leaves 8 mantissa bits, so one rounding is about 4e-3 of the
// separation. The bound grows in proportion to the distance.
import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { cameraPosition, viewProjectionMatrix } from './projection';
import { clampCursor, MAX_DISTANCE, MIN_DISTANCE } from './view';
import type { View } from './view';
import { mat4 } from 'gl-matrix';

const round = Math.fround;

/** The largest relative error allowed at the closest zoom distance. */
export const PRECISION_LIMIT_AT_MIN_DISTANCE = 1e-2;

/** The relative error allowed at a distance. */
export function precisionLimit(distance: number): number {
  return (PRECISION_LIMIT_AT_MIN_DISTANCE * distance) / MIN_DISTANCE;
}

const viewport = { width: 1920, height: 1080 };
const SEPARATION = 1 / 32;
const YAWS = [0, 37, 120, 199, 275, 350];
const PITCHES = [5, 20, 35, 60, 89];
const DISTANCES = [MIN_DISTANCE, 20000, MAX_DISTANCE];

/** The cursors the sweep visits: Sol, the centre, the far corner and the bounds. */
function sweepCursors(): [number, number, number][] {
  const bounds = galaxyModel.bounds;
  const candidates: [number, number, number][] = [
    [0, 0, 0],
    [galaxyModel.centre[0], galaxyModel.centre[1], galaxyModel.centre[2]],
    [50000, 0, 75000],
    [bounds.x[0], 0, bounds.z[0]],
    [bounds.x[0], 0, bounds.z[1]],
    [bounds.x[1], 0, bounds.z[0]],
    [bounds.x[1], bounds.y[1], bounds.z[1]],
  ];
  return candidates.map((cursor) => clampCursor(cursor));
}

/** The vertex transform as the card runs it, with a rounding after every operation. */
function transform32(matrix: mat4, relative: readonly number[]): number[] {
  const clip: number[] = [];
  for (let row = 0; row < 4; row += 1) {
    let sum = round((matrix[row] as number) * (relative[0] as number));
    sum = round(sum + round((matrix[4 + row] as number) * (relative[1] as number)));
    sum = round(sum + round((matrix[8 + row] as number) * (relative[2] as number)));
    sum = round(sum + (matrix[12 + row] as number));
    clip.push(sum);
  }
  return clip;
}

/** The same transform in `float64`. */
function transform64(matrix: mat4, relative: readonly number[]): number[] {
  const clip: number[] = [];
  for (let row = 0; row < 4; row += 1) {
    clip.push(
      (matrix[row] as number) * (relative[0] as number) +
        (matrix[4 + row] as number) * (relative[1] as number) +
        (matrix[8 + row] as number) * (relative[2] as number) +
        (matrix[12 + row] as number),
    );
  }
  return clip;
}

function separation(first: readonly number[], second: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < 4; index += 1) {
    const difference = (first[index] as number) - (second[index] as number);
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

/**
 * The relative error of the clip-space separation of two points 1/32 light year
 * apart at the cursor, with the chunk origin at Sol.
 */
function relativeError(view: View, axis: number): number {
  const matrix = viewProjectionMatrix(view, viewport);
  const camera = cameraPosition(view);
  // The chunk origin is Sol. The renderer subtracts in `float64` and uploads `float32`.
  const offset = [round(0 - camera[0]), round(0 - camera[1]), round(-(0 - camera[2]))];

  const first = [view.cursor[0], view.cursor[1], -view.cursor[2]];
  const second = [...first];
  second[axis] = (second[axis] as number) + SEPARATION;

  const relative32 = (p: readonly number[]): number[] => [
    round((offset[0] as number) + round(p[0] as number)),
    round((offset[1] as number) + round(p[1] as number)),
    round((offset[2] as number) + round(p[2] as number)),
  ];
  const relative64 = (p: readonly number[]): number[] => [
    (offset[0] as number) + (p[0] as number),
    (offset[1] as number) + (p[1] as number),
    (offset[2] as number) + (p[2] as number),
  ];

  const measured = separation(
    transform32(matrix, relative32(first)),
    transform32(matrix, relative32(second)),
  );
  const exact = separation(
    transform64(matrix, relative64(first)),
    transform64(matrix, relative64(second)),
  );
  return Math.abs(measured - exact) / exact;
}

/** The worst relative error over every yaw, pitch and axis at one cursor and distance. */
function worstError(cursor: [number, number, number], distance: number): number {
  let worst = 0;
  for (const yaw of YAWS) {
    for (const pitch of PITCHES) {
      const view: View = { cursor, distance, yaw, pitch };
      for (const axis of [0, 1, 2]) {
        worst = Math.max(worst, relativeError(view, axis));
      }
    }
  }
  return worst;
}

describe('camera-relative drawing', () => {
  test('keeps a separation of 1/32 light year at the far corner at 2,000', () => {
    expect(worstError([50000, 0, 75000], MIN_DISTANCE)).toBeLessThan(
      PRECISION_LIMIT_AT_MIN_DISTANCE,
    );
  });

  test('keeps the distance-scaled bound at every cursor and zoom distance', () => {
    for (const cursor of sweepCursors()) {
      for (const distance of DISTANCES) {
        expect(
          worstError(cursor, distance),
          `cursor ${cursor.join(',')} at ${distance}`,
        ).toBeLessThan(precisionLimit(distance));
      }
    }
  });

  test('is far better than a transform that keeps the camera in the matrix', () => {
    const cursor: [number, number, number] = [50000, 0, 75000];
    const view: View = { cursor, distance: MIN_DISTANCE, yaw: 0, pitch: 35 };
    const camera = cameraPosition(view);

    // Without camera-relative drawing the vertex shader would multiply the world
    // position by a matrix that carries the camera translation. The products then run
    // to about 100,000 light years, where the `float32` step is 1/128 light year.
    const naiveMatrix = mat4.create();
    mat4.translate(naiveMatrix, viewProjectionMatrix(view, viewport), [
      -camera[0],
      -camera[1],
      camera[2],
    ]);

    const world = [round(cursor[0]), round(cursor[1]), round(-cursor[2])];
    const shifted = [
      world[0] as number,
      world[1] as number,
      round((world[2] as number) + SEPARATION),
    ];
    const exactWorld = [cursor[0], cursor[1], -cursor[2]];
    const exactShifted = [cursor[0], cursor[1], -cursor[2] + SEPARATION];

    const measured = separation(
      transform32(naiveMatrix, world),
      transform32(naiveMatrix, shifted),
    );
    const exact = separation(
      transform64(naiveMatrix, exactWorld),
      transform64(naiveMatrix, exactShifted),
    );
    const naiveError = Math.abs(measured - exact) / exact;

    expect(naiveError).toBeGreaterThan(PRECISION_LIMIT_AT_MIN_DISTANCE);
    expect(relativeError(view, 2)).toBeLessThan(naiveError / 10);
  });
});
