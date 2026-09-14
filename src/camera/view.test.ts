import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  clampCursor,
  clampDistance,
  clampPitch,
  createDefaultView,
  MAX_DISTANCE,
  MIN_DISTANCE,
  normaliseView,
  wrapYaw,
} from './view';

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

  test('holds the pitch between 5 and 89 degrees', () => {
    expect(clampPitch(-10)).toBe(5);
    expect(clampPitch(335)).toBe(89);
    expect(clampPitch(35)).toBe(35);
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
