import { describe, expect, it } from 'vitest';
import { clamp, smoothStep } from './math';

describe('smoothStep', () => {
  it('reads two equal edges as a step and not as NaN', () => {
    expect(smoothStep(1, 1, 1)).toBe(1);
    expect(smoothStep(1, 1, 0.5)).toBe(0);
  });

  it('reads an inverted band as a step at the high edge', () => {
    expect(smoothStep(2, 1, 1.5)).toBe(1);
    expect(smoothStep(2, 1, 0)).toBe(0);
  });

  it('holds the two ends and the middle of a band', () => {
    expect(smoothStep(0, 10, -1)).toBe(0);
    expect(smoothStep(0, 10, 11)).toBe(1);
    expect(smoothStep(0, 10, 5)).toBeCloseTo(0.5, 12);
  });
});

describe('clamp', () => {
  it('holds a value between the two edges', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
