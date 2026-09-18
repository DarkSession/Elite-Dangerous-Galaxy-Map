import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  AUTO_MARGIN_LY,
  clampCursor,
  clampDistance,
  clampPitch,
  createDefaultView,
  farZoomLimit,
  MAX_DISTANCE,
  MIN_DISTANCE,
  normaliseView,
  readBounds,
  resolveBounds,
  unrestrictedBounds,
  wrapYaw,
} from './view';
import type { SystemBox } from './view';

describe('the view state', () => {
  test('starts at Sol, 60,000 light years away, pitch 35 and yaw 0', () => {
    expect(createDefaultView()).toEqual({
      cursor: [0, 0, 0],
      distance: 60000,
      yaw: 0,
      pitch: 35,
    });
  });

  test('holds the cursor inside the model bounds', () => {
    const clamped = clampCursor([60000, 0, 0]);
    expect(clamped[0]).toBe(galaxyModel.bounds.x[1]);
    expect(clampCursor([-60000, 0, 0])[0]).toBe(galaxyModel.bounds.x[0]);
    expect(clampCursor([0, 90000, 0])[1]).toBe(galaxyModel.bounds.y[1]);
    expect(clampCursor([0, 0, -90000])[2]).toBe(galaxyModel.bounds.z[0]);
  });

  // The scenario "Pitch clamp" of `map-navigation`. The range runs through 0, so the
  // camera goes under the galactic disk and looks up at it.
  test('holds the pitch between -89 and 89 degrees', () => {
    expect(clampPitch(-1000)).toBe(-89);
    expect(clampPitch(335)).toBe(89);
    expect(clampPitch(35)).toBe(35);
    expect(clampPitch(-35)).toBe(-35);
    // 0 is inside the range and is not a special value: the camera lies in the plane.
    expect(clampPitch(0)).toBe(0);
  });

  test('wraps the yaw into 0 to 360 degrees', () => {
    expect(wrapYaw(-30)).toBe(330);
    expect(wrapYaw(400)).toBe(40);
    expect(wrapYaw(0)).toBe(0);
  });

  test('holds the distance between 10 and 120,000 light years', () => {
    expect(MIN_DISTANCE).toBe(10);
    expect(clampDistance(1)).toBe(MIN_DISTANCE);
    expect(clampDistance(1e9)).toBe(MAX_DISTANCE);
    expect(clampDistance(50)).toBe(50);
    expect(clampDistance(20000)).toBe(20000);
  });

  test('applies every limit at once', () => {
    const view = normaliseView({
      cursor: [60000, 0, 0],
      distance: 1,
      yaw: -30,
      pitch: 200,
    });
    expect(view.cursor[0]).toBe(galaxyModel.bounds.x[1]);
    expect(view.distance).toBe(MIN_DISTANCE);
    expect(view.yaw).toBe(330);
    expect(view.pitch).toBe(89);
  });
});

describe('the browsable bounds', () => {
  const emptyBox: SystemBox = { min: [0, 0, 0], max: [0, 0, 0], empty: true };
  const box = (
    min: [number, number, number],
    max: [number, number, number],
  ): SystemBox => ({ min, max, empty: false });

  // The scenario "A sphere bound caps the zoom" of `map-navigation` reads the same rule.
  test('the far zoom limit is twice the radius, floored at 10 and capped at 120,000', () => {
    // `R / sin(30 degrees)` is `2 * R`. `sin` and not `tan`: `tan` would give 1.73 * R
    // and hide the edge of the space.
    expect(farZoomLimit(3000)).toBeCloseTo(6000, 6);
    expect(farZoomLimit(1000)).toBeCloseTo(2000, 6);
    // The floor holds the far limit at or above the close limit for a tiny space.
    expect(farZoomLimit(1)).toBe(MIN_DISTANCE);
    // The cap holds it at the map's own limit for a space wider than the model.
    expect(farZoomLimit(200000)).toBe(MAX_DISTANCE);
  });

  test('a sphere moves an outside cursor to its nearest surface point', () => {
    const bounds = resolveBounds(
      { mode: 'sphere', centre: [0, 0, 0], radiusLy: 1000 },
      emptyBox,
    );
    expect(clampCursor([3000, 0, 0], bounds)).toEqual([1000, 0, 0]);
    // A cursor inside the sphere is left where it is.
    expect(clampCursor([100, 200, 300], bounds)).toEqual([100, 200, 300]);
    // The move is to the nearest point and not to an axis, so a drag along the edge
    // slides rather than stops.
    const corner = clampCursor([3000, 3000, 3000], bounds);
    expect(Math.hypot(corner[0], corner[1], corner[2])).toBeCloseTo(1000, 6);
    expect(corner[0]).toBeCloseTo(corner[1], 6);
  });

  test('an empty auto box resolves to unrestricted', () => {
    const bounds = resolveBounds({ mode: 'auto' }, emptyBox);
    expect(bounds).toEqual(unrestrictedBounds());
    expect(bounds.maxDistanceLy).toBe(MAX_DISTANCE);
    // An empty box would otherwise pin the camera to a point.
    expect(clampCursor([40000, 0, 0], bounds)[0]).toBe(40000);
  });

  test('an auto box grows by the margin and gives its own far limit', () => {
    const bounds = resolveBounds({ mode: 'auto' }, box([-500, 0, -500], [500, 0, 500]));
    expect(bounds.kind).toBe('box');
    expect(clampCursor([5000, 0, 0], bounds)[0]).toBe(500 + AUTO_MARGIN_LY);
    // The half diagonal of a 3,000 by 2,000 by 3,000 box.
    const half = Math.hypot(3000, 2000, 3000) / 2;
    expect(bounds.maxDistanceLy).toBeCloseTo(farZoomLimit(half), 6);
  });

  test('a named margin replaces the default', () => {
    const bounds = resolveBounds(
      { mode: 'auto', marginLy: 0 },
      box([-500, 0, -500], [500, 0, 500]),
    );
    expect(clampCursor([5000, 0, 0], bounds)[0]).toBe(500);
  });

  test('normaliseView takes the cursor clamp and the far limit together', () => {
    const bounds = resolveBounds(
      { mode: 'sphere', centre: [0, 0, 0], radiusLy: 1000 },
      emptyBox,
    );
    const view = normaliseView(
      { cursor: [9000, 0, 0], distance: 100000, yaw: 0, pitch: 35 },
      bounds,
    );
    expect(view.cursor).toEqual([1000, 0, 0]);
    expect(view.distance).toBeCloseTo(2000, 6);
  });

  test('clampDistance takes the far limit it is given', () => {
    expect(clampDistance(100000, 6000)).toBe(6000);
    expect(clampDistance(1, 6000)).toBe(MIN_DISTANCE);
    // With no limit given it takes the map's own.
    expect(clampDistance(100000)).toBe(100000);
    expect(clampDistance(1e9)).toBe(MAX_DISTANCE);
  });

  describe('reading a host setting', () => {
    test('reads the three modes', () => {
      expect(readBounds({ mode: 'unrestricted' })).toEqual({ mode: 'unrestricted' });
      expect(readBounds({ mode: 'auto' })).toEqual({ mode: 'auto' });
      expect(readBounds({ mode: 'auto', marginLy: 25 })).toEqual({
        mode: 'auto',
        marginLy: 25,
      });
      expect(readBounds({ mode: 'sphere', centre: [1, 2, 3], radiusLy: 10 })).toEqual({
        mode: 'sphere',
        centre: [1, 2, 3],
        radiusLy: 10,
      });
    });

    test('rejects what it cannot read', () => {
      expect(readBounds(null)).toBeNull();
      expect(readBounds('sphere')).toBeNull();
      expect(readBounds({ mode: 'ball' })).toBeNull();
      expect(readBounds({ mode: 'auto', marginLy: -1 })).toBeNull();
      expect(readBounds({ mode: 'auto', marginLy: Number.NaN })).toBeNull();
      // A radius of 0 or less leaves no space to browse.
      expect(readBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy: 0 })).toBeNull();
      expect(
        readBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy: -5 }),
      ).toBeNull();
      expect(readBounds({ mode: 'sphere', centre: [0, 0], radiusLy: 5 })).toBeNull();
      expect(
        readBounds({ mode: 'sphere', centre: [0, Number.NaN, 0], radiusLy: 5 }),
      ).toBeNull();
    });
  });
});
