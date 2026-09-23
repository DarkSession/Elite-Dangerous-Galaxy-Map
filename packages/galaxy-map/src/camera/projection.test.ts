import { mat4 } from 'gl-matrix';
import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  cameraPosition,
  inverseViewProjection,
  nearPlane,
  planePoint,
  planePointFrom,
  project,
  projectWith,
  rayDirectionFrom,
  relativeToCamera,
  toWorld,
  viewProjectionMatrix,
} from './projection';
import { ZOOM_PER_NOTCH } from './controls';
import { createDefaultView, MAX_DISTANCE, MIN_DISTANCE } from './view';
import type { View } from './view';

const viewport = { width: 1920, height: 1080 };

describe('the projection with a held matrix', () => {
  test('reads the same as the one that builds its own', () => {
    const view = createDefaultView();
    view.distance = 4000;
    view.pitch = 25;
    view.yaw = 40;
    view.cursor = [120, -30, 25895];
    const matrix = viewProjectionMatrix(view, viewport);
    const camera = cameraPosition(view);
    const points: [number, number, number][] = [
      [0, 0, 0],
      [120, -30, 25895],
      [1000, 0, 25895],
      [-1000, 0, 25895],
      [120, 500, 25895],
      [120, -500, 25895],
      [120, -30, 20000],
      [120, -30, 40000],
      [25000, 0, -20000],
      [-25000, 1000, 60000],
    ];
    for (const point of points) {
      const held = projectWith(matrix, camera, point, viewport);
      const built = project(view, point, viewport);
      expect(held.x).toBeCloseTo(built.x, 6);
      expect(held.y).toBeCloseTo(built.y, 6);
      expect(held.inFront).toBe(built.inFront);
    }
  });
});

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

  // The scenario "The camera under the plane looks at the cursor" of `map-navigation`.
  test('looks at the cursor from under the plane', () => {
    const view: View = {
      cursor: [1000, 0, -2000],
      distance: 4000,
      yaw: 30,
      pitch: -45,
    };
    const camera = cameraPosition(view);
    console.log('the camera under the plane sits at', camera);

    expect(camera[1]).toBeLessThan(view.cursor[1]);
    const screen = project(view, view.cursor, viewport);
    expect(Math.abs(screen.x - viewport.width / 2)).toBeLessThan(1);
    expect(Math.abs(screen.y - viewport.height / 2)).toBeLessThan(1);
    expect(screen.inFront).toBe(true);
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
    // The limits are -89 and 89 degrees, and 0 is the plane the camera passes through.
    for (const pitch of [-89, 0, 89]) {
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

describe('the inverse the region overlay unprojects with', () => {
  // The renderer builds one inverse a frame and gives it to the volume pass, the grid
  // pass and the region composite. Each of the three unprojects a pixel with it, so the
  // inverse and the matrix it came from must multiply to the identity.
  test('multiplies with its own matrix to the identity', () => {
    const views: View[] = [
      { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 },
      { cursor: [425, 0, -21391], distance: 20000, yaw: 90, pitch: 89 },
      { cursor: [-9530, -910, 19808], distance: 3000, yaw: 217.5, pitch: 5 },
      { cursor: [15, -35, 25895], distance: MIN_DISTANCE, yaw: 40, pitch: 89 },
      { cursor: [0, 0, 0], distance: MAX_DISTANCE, yaw: 0, pitch: 60 },
    ];
    for (const view of views) {
      const matrix = viewProjectionMatrix(view, viewport);
      const inverse = inverseViewProjection(view, viewport);
      const product = mat4.create();
      mat4.multiply(product, matrix, inverse);
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const held = product[column * 4 + row] as number;
          expect(held).toBeCloseTo(row === column ? 1 : 0, 4);
        }
      }
    }
  });

  test('takes a pixel of the frame back to the ray it came from', () => {
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 30, pitch: 35 };
    const inverse = inverseViewProjection(view, viewport);
    const point: [number, number, number] = [1200, 0, -4300];
    const screen = project(view, point, viewport);
    expect(screen.inFront).toBe(true);
    const direction = rayDirectionFrom(inverse, { x: screen.x, y: screen.y }, viewport);
    const camera = cameraPosition(view);
    const along = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]];
    const span = Math.hypot(along[0], along[1], along[2]);
    const reach = Math.hypot(direction[0], direction[1], direction[2]);
    for (let axis = 0; axis < 3; axis += 1) {
      expect((direction[axis] as number) / reach).toBeCloseTo(
        (along[axis] as number) / span,
        4,
      );
    }
  });
});
