import { describe, expect, test } from 'vitest';
import { FLIGHT_MS, flightAt, flightEase } from './flight';
import type { View } from './view';

const FROM: View = { cursor: [0, 0, 0], distance: 20000, yaw: 40, pitch: 60 };
const TO: View = { cursor: [400, 0, 0], distance: 500, yaw: 40, pitch: 60 };

describe('the flight ease', () => {
  test('runs from 0 to 1 and holds outside the flight', () => {
    expect(flightEase(0)).toBe(0);
    expect(flightEase(1)).toBe(1);
    expect(flightEase(-1)).toBe(0);
    expect(flightEase(2)).toBe(1);
  });
});

describe('the flight', () => {
  // The scenario "The flight holds its curve" of `system-selection`.
  test('holds its curve over the five readings of the spec', () => {
    expect(FLIGHT_MS).toBe(600);

    const parts = [0, 0.578125, 0.875, 0.984375, 1];
    const times = [0, 150, 300, 450, 600];

    for (let index = 0; index < times.length; index += 1) {
      const eased = parts[index] as number;
      const view = flightAt(FROM, TO, times[index] as number);
      expect(view.cursor[0]).toBeCloseTo(400 * eased, 9);
      expect(view.cursor[1]).toBeCloseTo(0, 9);
      expect(view.cursor[2]).toBeCloseTo(0, 9);
      expect(view.distance).toBeCloseTo(20000 * Math.pow(500 / 20000, eased), 6);
      expect(view.yaw).toBe(40);
      expect(view.pitch).toBe(60);
    }
  });

  test('gives the start view at 0 milliseconds', () => {
    const view = flightAt(FROM, TO, 0);
    expect(view.cursor).toEqual([0, 0, 0]);
    expect(view.distance).toBeCloseTo(20000, 9);
  });

  test('gives the end view exactly at the end of the flight', () => {
    for (const elapsed of [FLIGHT_MS, FLIGHT_MS + 1, 10000]) {
      const view = flightAt(FROM, TO, elapsed);
      expect(view.cursor).toEqual([400, 0, 0]);
      expect(view.distance).toBe(500);
      expect(view.yaw).toBe(40);
      expect(view.pitch).toBe(60);
    }
  });

  test('leaves the yaw and the pitch of the start view', () => {
    const turned: View = { cursor: [0, 0, 0], distance: 1000, yaw: 10, pitch: 20 };
    const other: View = { cursor: [0, 0, 0], distance: 1000, yaw: 300, pitch: 80 };
    const view = flightAt(turned, other, 100);
    expect(view.yaw).toBe(10);
    expect(view.pitch).toBe(20);
  });

  test('moves the distance by a constant factor for each unit of eased time', () => {
    const half = flightAt(FROM, TO, 300).distance;
    expect(half).toBeCloseTo(20000 * Math.pow(500 / 20000, 0.875), 6);
    // A linear distance would still be at 10,250 half way through.
    expect(half).toBeLessThan(2000);
  });
});
