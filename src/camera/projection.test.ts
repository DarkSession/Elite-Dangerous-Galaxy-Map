import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { cameraPosition, planePoint, project, toWorld } from './projection';
import { createDefaultView } from './view';
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
