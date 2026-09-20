import { describe, expect, test } from 'vitest';
import { distanceFromSol, rangeFromCursor } from './geometry';
import type { MapView } from '../app/create-map';

/** A view at a cursor, which the yaw and the pitch turn the camera around. */
function at(
  cursor: [number, number, number],
  yaw: number,
  pitch = 35,
  distance = 500,
): MapView {
  return { cursor, distance, yaw, pitch };
}

describe('the HUD range', () => {
  test('measures from the cursor', () => {
    expect(rangeFromCursor(at([0, 0, 0], 0), [300, 0, 400])).toBeCloseTo(500, 9);
    expect(rangeFromCursor(at([100, 0, 0], 0), [400, 0, 400])).toBeCloseTo(500, 9);
  });

  // The reading the `map-hud` delta states: an orbit moves the camera and not the cursor.
  test('holds over an orbit and over a zoom', () => {
    const point: [number, number, number] = [400, 0, 0];
    const readings = [0, 90, 180, 270].map((yaw) =>
      rangeFromCursor(at([0, 0, 0], yaw), point),
    );
    for (const reading of readings) expect(reading).toBeCloseTo(400, 9);
    expect(rangeFromCursor(at([0, 0, 0], 0, 35, 20000), point)).toBeCloseTo(400, 9);
    expect(rangeFromCursor(at([0, 0, 0], 0, -89, 10), point)).toBeCloseTo(400, 9);
  });

  // The owner accepted this reading: a selection that has landed puts the cursor on the
  // system, so the field reads 0 LY.
  test('reads 0 where the cursor is on the point', () => {
    expect(rangeFromCursor(at([1, 2, 3], 40), [1, 2, 3])).toBe(0);
  });

  test('measures Sol from the origin of the frame', () => {
    expect(distanceFromSol([0, 0, 0])).toBe(0);
    expect(distanceFromSol([3, 4, 0])).toBeCloseTo(5, 9);
  });
});
