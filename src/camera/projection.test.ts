import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  cameraPosition,
  inverseViewProjection,
  nearPlane,
  planePoint,
  planePointFrom,
  project,
  rayDirection,
  rayDirectionFrom,
  relativeToCamera,
  toWorld,
  viewProjectionMatrix,
} from './projection';
import { ZOOM_PER_NOTCH } from './controls';
import { createDefaultView, MAX_DISTANCE, MIN_DISTANCE } from './view';
import type { View } from './view';

const viewport = { width: 1920, height: 1080 };

describe('the projection', () => {
  test('flips z from game coordinates to the world frame', () => {
    expect(toWorld([1, 2, 3])).toEqual([1, 2, -3]);
  });

  test('puts the camera on the -z side of the cursor at yaw 0', () => {
    const camera = cameraPosition(createDefaultView());
    expect(camera[0]).toBeCloseTo(0, 6);
    expect(camera[1]).toBeGreaterThan(0);
    expect(camera[2]).toBeLessThan(0);
  });

  test('turns clockwise seen from +y, so yaw 90 puts the camera on the -x side', () => {
    const view = createDefaultView();
    view.yaw = 90;
    const camera = cameraPosition(view);
    expect(camera[0]).toBeLessThan(0);
    expect(Math.abs(camera[2])).toBeLessThan(1e-6);
  });

  test('puts the cursor at the centre of the screen within 1 pixel', () => {
    const views: View[] = [
      createDefaultView(),
      { cursor: [-9530, -910, 19808], distance: 8000, yaw: 120, pitch: 50 },
      { cursor: [30000, 500, 60000], distance: 120000, yaw: 275, pitch: 5 },
      { cursor: [0, 0, 25895], distance: 2000, yaw: 89, pitch: 89 },
    ];
    for (const view of views) {
      const screen = project(view, view.cursor, viewport);
      expect(Math.abs(screen.x - viewport.width / 2)).toBeLessThan(1);
      expect(Math.abs(screen.y - viewport.height / 2)).toBeLessThan(1);
    }
  });

  test('draws the galactic centre above Sol at the default view', () => {
    const view = createDefaultView();
    const sol = project(view, [0, 0, 0], viewport);
    const centre = project(view, galaxyModel.centre, viewport);
    // Screen y grows downward, so a smaller value is higher on the screen.
    expect(centre.y).toBeLessThan(sol.y);
    expect(centre.inFront).toBe(true);
  });

  test('draws plus x to the right of Sol at the default view', () => {
    const view = createDefaultView();
    const sol = project(view, [0, 0, 0], viewport);
    const right = project(view, [10000, 0, 0], viewport);
    expect(right.x).toBeGreaterThan(sol.x);
  });

  test('finds the plane point under the centre pixel at the cursor', () => {
    const view = createDefaultView();
    const point = planePoint(
      view,
      { x: viewport.width / 2, y: viewport.height / 2 },
      viewport,
      view.cursor[1],
    );
    expect(point).not.toBeNull();
    expect(Math.abs((point as number[])[0] as number)).toBeLessThan(1);
    expect(Math.abs((point as number[])[2] as number)).toBeLessThan(1);
  });
});

describe('the reused inverse', () => {
  const view = createDefaultView();
  const pixels = [
    { x: 0, y: 0 },
    { x: viewport.width, y: viewport.height },
    { x: viewport.width / 2, y: viewport.height / 2 },
    { x: 137, y: 911 },
  ];

  // `rayDirection` inverts the matrix on every call and the label sweep cannot pay
  // that 2,000 times a frame, so the sweep uses `rayDirectionFrom` with one inverse.
  // This test is what says the two give the same answer.
  test('gives the same ray as the call that inverts the matrix itself', () => {
    const inverse = inverseViewProjection(view, viewport);
    for (const pixel of pixels) {
      const shared = rayDirectionFrom(inverse, pixel, viewport);
      const alone = rayDirection(view, pixel, viewport);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(shared[axis]).toBe(alone[axis]);
      }
    }
  });

  test('gives the same plane point as the call that inverts the matrix itself', () => {
    const inverse = inverseViewProjection(view, viewport);
    const origin = cameraPosition(view);
    for (const pixel of pixels) {
      const shared = planePointFrom(inverse, origin, pixel, viewport, 0);
      const alone = planePoint(view, pixel, viewport, 0);
      expect(shared === null).toBe(alone === null);
      if (shared === null || alone === null) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        expect(shared[axis]).toBe(alone[axis]);
      }
    }
  });
});

describe('the near plane', () => {
  test('is a tenth of the zoom distance under 100 light years and 10 above', () => {
    const distances = [10, 50, 100, 500, 20000, 120000];
    const expected = [1, 5, 10, 10, 10, 10];
    for (let index = 0; index < distances.length; index += 1) {
      expect(nearPlane(distances[index] as number)).toBeCloseTo(
        expected[index] as number,
        9,
      );
    }
  });

  // The cursor sits exactly one zoom distance from the camera, so a fixed near plane of
  // 10 light years would clip it at the closest zoom.
  test('never clips the cursor, at any zoom distance and either pitch limit', () => {
    const viewport = { width: 1920, height: 1080 };
    for (const pitch of [5, 89]) {
      let distance = MAX_DISTANCE;
      let steps = 0;
      for (;;) {
        const view: View = { cursor: [0, 0, 0], distance, yaw: 40, pitch };
        const screen = project(view, view.cursor, viewport);
        expect(screen.inFront).toBe(true);
        // The clip `w` is the distance along the view axis, and the near plane cuts at
        // `nearPlane(distance)`, so the cursor is in front of it when `w` is larger.
        const relative = relativeToCamera(view, view.cursor);
        const matrix = viewProjectionMatrix(view, viewport);
        const clipW =
          matrix[3] * relative[0] +
          matrix[7] * relative[1] +
          matrix[11] * relative[2] +
          matrix[15];
        expect(clipW).toBeGreaterThan(nearPlane(distance));
        expect(Math.abs(screen.x - viewport.width / 2)).toBeLessThan(1);
        expect(Math.abs(screen.y - viewport.height / 2)).toBeLessThan(1);
        if (distance <= MIN_DISTANCE) break;
        distance = Math.max(MIN_DISTANCE, distance / ZOOM_PER_NOTCH);
        steps += 1;
        expect(steps).toBeLessThan(200);
      }
      expect(steps).toBe(68);
    }
  });
});
