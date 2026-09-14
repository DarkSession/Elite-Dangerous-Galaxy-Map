import { describe, expect, test } from 'vitest';
import { createFrameAccumulator } from './renderer';

describe('the frame time accumulator', () => {
  test('reads the count, the mean and the worst over 10 frames', () => {
    const frames = createFrameAccumulator();
    expect(frames.read()).toEqual({ frames: 0, meanMs: 0, worstMs: 0 });

    const times = [4, 6, 5, 21, 3, 7, 8, 2, 9, 5];
    for (const ms of times) frames.add(ms);
    const stats = frames.read();
    expect(stats.frames).toBe(10);
    expect(stats.meanMs).toBeCloseTo(7, 9);
    expect(stats.worstMs).toBe(21);
  });

  test('starts the count again on a reset', () => {
    const frames = createFrameAccumulator();
    frames.add(30);
    frames.reset();
    expect(frames.read()).toEqual({ frames: 0, meanMs: 0, worstMs: 0 });
    frames.add(4);
    frames.add(6);
    expect(frames.read()).toEqual({ frames: 2, meanMs: 5, worstMs: 6 });
  });
});
