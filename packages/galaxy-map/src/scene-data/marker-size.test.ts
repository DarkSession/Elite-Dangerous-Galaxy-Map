import { describe, expect, test } from 'vitest';
import {
  MARKER_SIZE_RANGES,
  MARKER_SIZE_VALUES,
  markerCssSize,
  MAX_MARKER_CSS,
  MIN_MARKER_CSS,
} from './marker-size';

describe('the marker size curve', () => {
  test('reads the stop table at the ranges the spec names', () => {
    expect(markerCssSize(10)).toBeCloseTo(16, 6);
    expect(markerCssSize(20)).toBeCloseTo(14.28, 2);
    expect(markerCssSize(50)).toBeCloseTo(12, 6);
    expect(markerCssSize(1000)).toBeCloseTo(12, 6);
    expect(markerCssSize(2000)).toBeCloseTo(10.49, 2);
    expect(markerCssSize(4000)).toBeCloseTo(8.99, 2);
    expect(markerCssSize(10000)).toBeCloseTo(7, 6);
  });

  test('holds its end value outside the ends of the table', () => {
    expect(markerCssSize(1)).toBe(MAX_MARKER_CSS);
    expect(markerCssSize(0)).toBe(MAX_MARKER_CSS);
    expect(markerCssSize(120000)).toBe(MIN_MARKER_CSS);
  });

  test('gives the stop value at every range of the table', () => {
    for (let stop = 0; stop < MARKER_SIZE_RANGES.length; stop += 1) {
      const range = MARKER_SIZE_RANGES[stop] as number;
      expect(markerCssSize(range)).toBeCloseTo(MARKER_SIZE_VALUES[stop] as number, 6);
    }
  });

  // The scenario "The size curve is continuous" of `real-systems`.
  test('is continuous and never rises over 1 to 200,000 light years', () => {
    const steps = 1000;
    const readings: number[] = [];
    for (let step = 0; step < steps; step += 1) {
      const part = step / (steps - 1);
      const range = Math.exp(Math.log(1) + part * (Math.log(200000) - Math.log(1)));
      readings.push(markerCssSize(range));
    }

    let largest = -Infinity;
    let smallest = Infinity;
    for (let index = 0; index < readings.length; index += 1) {
      const reading = readings[index] as number;
      largest = Math.max(largest, reading);
      smallest = Math.min(smallest, reading);
      if (index === 0) continue;
      const before = readings[index - 1] as number;
      expect(Math.abs(reading - before)).toBeLessThanOrEqual(0.05);
      expect(reading).toBeLessThanOrEqual(before);
    }

    expect(largest).toBeCloseTo(16, 6);
    expect(smallest).toBeCloseTo(7, 6);
  });
});
