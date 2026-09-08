import { describe, expect, test } from 'vitest';
import { SeededRandom } from './random';

describe('SeededRandom', () => {
  test('gives the same first five values for seed 7', () => {
    const random = new SeededRandom(7);
    const values = [0, 1, 2, 3, 4].map(() => random.float());
    expect(values).toEqual([
      0.011704753153026104, 0.06195825757458806, 0.97690763277933, 0.6990287057124078,
      0.5214452685322613,
    ]);
  });

  test('stays inside [0, 1)', () => {
    const random = new SeededRandom(1234);
    for (let index = 0; index < 100000; index += 1) {
      const value = random.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('repeats the sequence for the same seed', () => {
    const first = new SeededRandom(7);
    const second = new SeededRandom(7);
    for (let index = 0; index < 20; index += 1) {
      expect(first.float()).toBe(second.float());
    }
  });
});
