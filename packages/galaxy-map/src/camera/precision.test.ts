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
// separation. The bound grows in proportion to the distance, so the limit at the
// closest zoom distance of 10 light years is a two-hundredth of the limit at 2,000.
//
// The near plane is part of the projection matrix, so it moves the reading. The sweep
// therefore runs against the near plane the view gives it, which is a tenth of the zoom
// distance below 100 light years.
import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  cameraPosition,
  projectionMatrix,
  viewMatrix,
  viewProjectionMatrix,
} from './projection';
import { clampCursor, MAX_DISTANCE, MIN_DISTANCE } from './view';
import type { View } from './view';
import { mat4 } from 'gl-matrix';

const round = Math.fround;

/**
 * The largest relative error allowed at the closest zoom distance. It is the bound
 * `1e-2 * distance / 2,000` read at `MIN_DISTANCE`, so it moved with the closest zoom.
 */
export const PRECISION_LIMIT_AT_MIN_DISTANCE = 5e-5;

/** The distance the spec states the relative error bound of 1e-2 at, in light years. */
const REFERENCE_DISTANCE = 2000;

/** The relative error allowed at a distance, which is `1e-2 * distance / 2,000`. */
export function precisionLimit(distance: number): number {
  return (PRECISION_LIMIT_AT_MIN_DISTANCE * distance) / MIN_DISTANCE;
}

const viewport = { width: 1920, height: 1080 };
const SEPARATION = 1 / 32;
const YAWS = [0, 37, 120, 199, 275, 350];
const PITCHES = [5, 20, 35, 60, 89];
// `MIN_DISTANCE` now supplies the 10, so 500 stands as its own entry: it is the zoom
// distance the map stopped at before this change.
const DISTANCES = [MIN_DISTANCE, 500, REFERENCE_DISTANCE, 20000, MAX_DISTANCE];

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
    expect(worstError([50000, 0, 75000], REFERENCE_DISTANCE)).toBeLessThan(
      precisionLimit(REFERENCE_DISTANCE),
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
    const view: View = { cursor, distance: REFERENCE_DISTANCE, yaw: 0, pitch: 35 };
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

    expect(naiveError).toBeGreaterThan(precisionLimit(REFERENCE_DISTANCE));
    expect(relativeError(view, 2)).toBeLessThan(naiveError / 10);
  });
});

// The volume pass reconstructs the ray of each pixel from the inverse of the view and
// projection matrix. The emulation below runs that reconstruction in `float32`. The
// rule the pass uses can then be measured without a GPU.
//
// `mat4.create` gives a `Float32Array`. The matrix and its inverse therefore hold
// `float32` values here exactly as they do on the card. gl-matrix leaves a rounding of
// about 5e-9 in the first two entries of the inverse's `w` row. The exact answer there
// is zero.
//
// The far point's `w` is the difference of the two large entries of that row. It
// cancels down to `1 / far plane`. The rounding is then 1 to 3 per cent of it at a
// corner of the triangle. The interpolated direction reaches 2.1 degrees from the
// `float64` answer at the pixel below, and 2.6 degrees over a grid of pixels. The near
// point's `w` is the sum of the same two entries, so the same rounding is 3e-8 relative
// to it.

/** The view the volume ray scenarios read. It is the view the reader reported. */
const RAY_VIEW: View = {
  cursor: [-4.15271, -50.71937, -152.73213],
  distance: 146.35196,
  yaw: 19.66992,
  pitch: 34.56875,
};

/** The frame the volume ray scenarios read. */
const RAY_VIEWPORT = { width: 1600, height: 1000 };

/** The pixel the emulation reads. It sits in the band the browser sweeps measure. */
const RAY_PIXEL = { x: 800, y: 15 };

/** The near planes the sweep reads, in light years. */
const RAY_NEAR_PLANES = Array.from({ length: 13 }, (_, index) => 1.8 + 0.02 * index);

/**
 * The corners of the full-screen triangle, in normalised device coordinates. The
 * vertex shader builds them from `gl_VertexID`, so a corner reaches 3 on each axis.
 */
const TRIANGLE: [number, number][] = [
  [-1, -1],
  [3, -1],
  [-1, 3],
];

/** The pixel's normalised device coordinate, taken at the centre of the pixel. */
const RAY_NDC: [number, number] = [
  ((RAY_PIXEL.x + 0.5) / RAY_VIEWPORT.width) * 2 - 1,
  1 - ((RAY_PIXEL.y + 0.5) / RAY_VIEWPORT.height) * 2,
];

/** The view and projection matrix of the ray view at one near plane. */
function rayViewProjection(near: number): mat4 {
  const matrix = mat4.create();
  mat4.multiply(
    matrix,
    projectionMatrix(RAY_VIEW, RAY_VIEWPORT, near),
    viewMatrix(RAY_VIEW),
  );
  return matrix;
}

/** The `float32` inverse, as gl-matrix builds it and as the renderer uploads it. */
function rayInverse32(near: number): mat4 {
  const inverse = mat4.create();
  mat4.invert(inverse, rayViewProjection(near));
  return inverse;
}

/** The same inverse in `float64`, which is the answer the emulation is measured against. */
function rayInverse64(near: number): mat4 {
  const inverse = new Float64Array(16) as unknown as mat4;
  mat4.invert(inverse, rayViewProjection(near));
  return inverse;
}

/** Unprojects one normalised device coordinate, with a rounding after every operation. */
function unproject32(inverse: mat4, x: number, y: number, z: number): number[] {
  const point = transform32(inverse, [x, y, z]);
  const w = point[3] as number;
  return [
    round((point[0] as number) / w),
    round((point[1] as number) / w),
    round((point[2] as number) / w),
  ];
}

/** The same unprojection in `float64`. */
function unproject64(inverse: mat4, x: number, y: number, z: number): number[] {
  const point = transform64(inverse, [x, y, z]);
  const w = point[3] as number;
  return [(point[0] as number) / w, (point[1] as number) / w, (point[2] as number) / w];
}

/** The angle between two directions, in degrees. */
function angleDegrees(first: readonly number[], second: readonly number[]): number {
  const length = (v: readonly number[]): number =>
    Math.hypot(v[0] as number, v[1] as number, v[2] as number);
  const a = first.map((value) => value / length(first));
  const b = second.map((value) => value / length(second));
  const cross = [
    (a[1] as number) * (b[2] as number) - (a[2] as number) * (b[1] as number),
    (a[2] as number) * (b[0] as number) - (a[0] as number) * (b[2] as number),
    (a[0] as number) * (b[1] as number) - (a[1] as number) * (b[0] as number),
  ];
  const dot =
    (a[0] as number) * (b[0] as number) +
    (a[1] as number) * (b[1] as number) +
    (a[2] as number) * (b[2] as number);
  return (Math.atan2(length(cross), dot) * 180) / Math.PI;
}

/**
 * The reconstruction the volume pass uses: the unprojected near plane point of the
 * pixel, taken for the fragment. The camera sits at the origin of this frame, so that
 * point is already the direction of the ray.
 */
function nearPointDirection32(inverse: mat4): number[] {
  return unproject32(inverse, RAY_NDC[0], RAY_NDC[1], -1);
}

/**
 * The reconstruction the volume pass used before this change: the far point less the
 * near point at each corner of the triangle, carried across it as a varying. The
 * rasteriser mixes the three corner rays by the barycentric weights of the pixel. Every
 * corner has a clip `w` of 1, so the weights need no perspective correction.
 */
function interpolatedDifference32(inverse: mat4): number[] {
  const rays = TRIANGLE.map(([x, y]) => {
    const near = unproject32(inverse, x, y, -1);
    const far = unproject32(inverse, x, y, 1);
    return [
      round((far[0] as number) - (near[0] as number)),
      round((far[1] as number) - (near[1] as number)),
      round((far[2] as number) - (near[2] as number)),
    ];
  });
  const second = round((RAY_NDC[0] + 1) / 4);
  const third = round((RAY_NDC[1] + 1) / 4);
  const first = round(round(1 - second) - third);
  const weights = [first, second, third];
  return [0, 1, 2].map((axis) => {
    let sum = round(weights[0] * ((rays[0] as number[])[axis] as number));
    sum = round(sum + round(weights[1] * ((rays[1] as number[])[axis] as number)));
    sum = round(sum + round(weights[2] * ((rays[2] as number[])[axis] as number)));
    return sum;
  });
}

/** The largest angle either reconstruction leaves over the sweep, in degrees. */
function worstRayAngle(reconstruct: (inverse: mat4) => number[]): number {
  let worst = 0;
  for (const near of RAY_NEAR_PLANES) {
    const exact = unproject64(rayInverse64(near), RAY_NDC[0], RAY_NDC[1], -1);
    worst = Math.max(worst, angleDegrees(reconstruct(rayInverse32(near)), exact));
  }
  return worst;
}

describe('the volume pass ray', () => {
  test('holds its direction against the near plane', () => {
    expect(worstRayAngle(nearPointDirection32)).toBeLessThan(1e-3);
  });

  test('does not hold its direction as a difference carried across the triangle', () => {
    expect(worstRayAngle(interpolatedDifference32)).toBeGreaterThan(0.1);
  });
});
