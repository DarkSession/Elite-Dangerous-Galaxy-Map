import { describe, expect, test } from 'vitest';
import {
  createNearestKeep,
  labelTopCss,
  MAX_NAME_LABELS,
  MIN_RING_CSS,
  offerNearest,
  PIN_HEIGHT_CSS,
  pinTopCss,
  resetNearest,
  ringCssSize,
} from './markers';

describe('the 64 nearest labels', () => {
  test('keep the 64 smallest ranges of 10,000, in order', () => {
    const keep = createNearestKeep(MAX_NAME_LABELS);
    // A repeatable pseudo-random sequence, so a failure is the same on every run.
    let seed = 12345;
    const ranges: number[] = [];
    for (let index = 0; index < 10000; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const range = seed / 2147483648;
      ranges.push(range);
      offerNearest(keep, index, range);
    }

    const wanted = [...ranges].sort((first, second) => first - second).slice(0, 64);
    const kept = Array.from(keep.ranges.subarray(0, keep.count));
    expect(keep.count).toBe(64);
    expect(kept).toEqual(wanted);
    for (let slot = 0; slot < keep.count; slot += 1) {
      expect(ranges[keep.indices[slot] as number]).toBe(keep.ranges[slot]);
    }
  });

  test('hold fewer than the limit when fewer are offered', () => {
    const keep = createNearestKeep(MAX_NAME_LABELS);
    offerNearest(keep, 7, 30);
    offerNearest(keep, 3, 10);
    offerNearest(keep, 5, 20);

    expect(keep.count).toBe(3);
    expect(Array.from(keep.indices.subarray(0, 3))).toEqual([3, 5, 7]);
  });

  test('refuse a candidate no nearer than the worst kept one', () => {
    const keep = createNearestKeep(2);
    offerNearest(keep, 0, 1);
    offerNearest(keep, 1, 2);
    offerNearest(keep, 2, 3);

    expect(Array.from(keep.indices.subarray(0, 2))).toEqual([0, 1]);
  });

  test('start again on a reset', () => {
    const keep = createNearestKeep(2);
    offerNearest(keep, 0, 1);
    resetNearest(keep);

    expect(keep.count).toBe(0);
  });
});

describe('the mark placement', () => {
  test('puts a name label half a marker and 6 pixels below its centre', () => {
    expect(labelTopCss(300, 7)).toBe(300 + 3.5 + 6);
    expect(labelTopCss(300, 12)).toBe(300 + 6 + 6);
  });

  test('puts the tip of the pin half a marker and 2 pixels above its centre', () => {
    expect(pinTopCss(300, 7) + PIN_HEIGHT_CSS).toBe(300 - 3.5 - 2);
    expect(pinTopCss(300, 12) + PIN_HEIGHT_CSS).toBe(300 - 6 - 2);
  });

  test('takes the ring to 3.2 times the marker, with a floor of 24', () => {
    expect(ringCssSize(7)).toBe(MIN_RING_CSS);
    expect(ringCssSize(10)).toBe(32);
    expect(ringCssSize(12)).toBeCloseTo(38.4, 9);
  });
});
