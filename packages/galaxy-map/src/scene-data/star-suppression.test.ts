import { describe, expect, test } from 'vitest';
import {
  baseSizeClass,
  boxelEdge,
  boxelIndexAt,
  boxelOrigin,
  listDrawnBoxels,
  starPosition,
} from './boxel';
import type { BoxelIndex, DrawnBoxel } from './boxel';
import { createSystemSet, SUPPRESSION_RADIUS_LY } from './real-systems';
import type { RealSystemSet } from './real-systems';
import {
  buildSuppressionIndex,
  createStarSuppression,
  MASK_WORDS,
  sweepBoxel,
} from './star-suppression';

/** A set that holds the positions a test names, each in its own category. */
function setOf(positions: readonly [number, number, number][]): RealSystemSet {
  const set = createSystemSet();
  set.addCategories([{ name: 'A', color: [1, 2, 3] }]);
  set.addSystems(
    positions.map((position, slot) => ({
      name: `s${slot}`,
      coords: { x: position[0], y: position[1], z: position[2] },
      categories: ['A'],
      id64: slot + 1,
    })),
  );
  return set;
}

/** The star indices a mask holds. */
function maskStars(words: Uint32Array, offset: number): number[] {
  const stars: number[] = [];
  for (let star = 0; star < MASK_WORDS * 32; star += 1) {
    const word = words[offset + (star >> 5)] as number;
    if ((word & (1 << (star & 31))) !== 0) stars.push(star);
  }
  return stars;
}

/** The boxel of a size class that holds a position. */
function boxelAt(position: [number, number, number], sizeClass: number): BoxelIndex {
  return boxelIndexAt(position, sizeClass);
}

describe('the suppression index', () => {
  test('puts a system in each of the 8 boxels its grown box touches', () => {
    const sizeClass = 1;
    // A system on a corner of a boxel reaches the 8 boxels around that corner.
    const corner = boxelAt([0, 0, 0], sizeClass);
    const origin = boxelOrigin(corner, sizeClass);
    const index = buildSuppressionIndex(setOf([origin]), sizeClass);

    expect(index.size).toBe(8);
    for (let dx = -1; dx <= 0; dx += 1) {
      for (let dy = -1; dy <= 0; dy += 1) {
        for (let dz = -1; dz <= 0; dz += 1) {
          const key = `${corner[0] + dx},${corner[1] + dy},${corner[2] + dz}`;
          expect(index.get(key), key).toEqual([0]);
        }
      }
    }
  });
});

describe('the sweep of one boxel', () => {
  test('drops a star inside the radius and keeps one outside', () => {
    const sizeClass = 1;
    const placed = 30;
    const index = boxelAt([0, 0, 0], sizeClass);
    const stars: [number, number, number][] = [];
    for (let star = 0; star < placed; star += 1) {
      stars.push(starPosition(index, sizeClass, star));
    }
    const target = stars[0] as [number, number, number];

    const onStar = setOf([target]);
    const words = new Uint32Array(MASK_WORDS);
    const first = sweepBoxel(index, sizeClass, placed, [0], onStar.positions, words, 0);
    // The system sits on star 0, and it may also fall inside the radius of a
    // neighbour, so the reading must hold star 0 rather than hold it alone.
    expect(first).toBeGreaterThanOrEqual(1);
    expect(maskStars(words, 0)).toContain(0);

    // The system moves 4 light years away, along an axis that keeps it clear of every
    // other star of the boxel.
    const step = 4;
    const clear = (point: [number, number, number]): boolean =>
      stars.every(
        (star) =>
          Math.hypot(star[0] - point[0], star[1] - point[1], star[2] - point[2]) >
          SUPPRESSION_RADIUS_LY,
      );
    const moved = (
      [
        [step, 0, 0],
        [-step, 0, 0],
        [0, step, 0],
        [0, -step, 0],
        [0, 0, step],
        [0, 0, -step],
      ] as [number, number, number][]
    )
      .map((offset): [number, number, number] => [
        target[0] + offset[0],
        target[1] + offset[1],
        target[2] + offset[2],
      ])
      .find(clear);
    expect(moved, 'no direction keeps the system clear of every star').toBeDefined();

    const away = setOf([moved as [number, number, number]]);
    const second = sweepBoxel(index, sizeClass, placed, [0], away.positions, words, 0);
    expect(second).toBe(0);
    expect(maskStars(words, 0)).toEqual([]);
  });

  test('gives the same set from 20 camera positions that all draw the boxel', () => {
    const distance = 500;
    const sizeClass = baseSizeClass(distance);
    const placed = 30;
    const systems = setOf(
      Array.from({ length: 200 }, (_ignored, slot): [number, number, number] => {
        const angle = (slot * 2 * Math.PI) / 200;
        const radius = 4 + (slot % 7) * 3;
        return [
          radius * Math.cos(angle),
          ((slot % 11) - 5) * 2,
          radius * Math.sin(angle),
        ];
      }),
    );
    const boxel = boxelAt([0, 0, 0], sizeClass);
    const edge = boxelEdge(sizeClass);

    const readings: string[] = [];
    for (let step = 0; step < 20; step += 1) {
      const camera: [number, number, number] = [
        ((step % 5) - 2) * edge * 0.4,
        (((step / 5) | 0) - 1) * edge * 0.4,
        ((step % 3) - 1) * edge * 0.4,
      ];
      const drawn = listDrawnBoxels(camera, distance);
      const found = drawn.some(
        (one: DrawnBoxel) =>
          one.sizeClass === sizeClass &&
          one.index[0] === boxel[0] &&
          one.index[1] === boxel[1] &&
          one.index[2] === boxel[2],
      );
      expect(found, `camera ${camera.join(',')} does not draw the boxel`).toBe(true);

      const suppression = createStarSuppression(systems);
      suppression.begin(sizeClass);
      const words = new Uint32Array(MASK_WORDS);
      suppression.write(boxel, sizeClass, placed, words, 0);
      readings.push(maskStars(words, 0).join(','));
    }

    expect(new Set(readings).size).toBe(1);
    expect(readings[0]?.length).toBeGreaterThan(0);
  });
});

describe('the sweep over a drawn set', () => {
  test('suppresses in the base class alone', () => {
    const distance = 1000;
    const base = baseSizeClass(distance);
    expect(base).toBe(2);
    const camera: [number, number, number] = [0, 0, 0];
    const drawn = listDrawnBoxels(camera, distance);

    // One system at the first placed star of one boxel of each drawn class.
    const chosen: DrawnBoxel[] = [];
    for (let sizeClass = base; sizeClass < base + 4; sizeClass += 1) {
      const one = drawn.find((boxel) => boxel.sizeClass === sizeClass);
      expect(one, `no boxel of class ${sizeClass}`).toBeDefined();
      chosen.push(one as DrawnBoxel);
    }
    const systems = setOf(
      chosen.map((boxel) => starPosition(boxel.index, boxel.sizeClass, 0)),
    );

    const suppression = createStarSuppression(systems);
    suppression.begin(base);
    const words = new Uint32Array(MASK_WORDS * chosen.length);
    const counts = chosen.map((boxel, slot) =>
      suppression.write(boxel.index, boxel.sizeClass, 30, words, slot * MASK_WORDS),
    );

    expect(counts[0]).toBeGreaterThanOrEqual(1);
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBe(0);
    expect(counts[3]).toBe(0);
  });

  test('computes only the boxels a camera move brought in', () => {
    const distance = 1000;
    const base = baseSizeClass(distance);
    const edge = boxelEdge(base);
    const camera: [number, number, number] = [0, 0, 0];
    const block = listDrawnBoxels(camera, distance).filter(
      (boxel) => boxel.sizeClass === base,
    );
    expect(block.length).toBe(512);

    // 10,000 systems spread evenly over the base class block and 2 base boxels past
    // it on each side, so every boxel the move brings in holds one too and a boxel the
    // sweep skips is a boxel it kept rather than one with nothing in it.
    const corner = boxelOrigin(block[0]?.index as BoxelIndex, base);
    const span = 12 * edge;
    const low = [
      (corner[0] as number) - 2 * edge,
      (corner[1] as number) - 2 * edge,
      (corner[2] as number) - 2 * edge,
    ];
    const systems = setOf(
      Array.from({ length: 10000 }, (_ignored, slot): [number, number, number] => [
        (low[0] as number) + ((slot % 25) + 0.5) * (span / 25),
        (low[1] as number) + ((((slot / 25) | 0) % 20) + 0.5) * (span / 20),
        (low[2] as number) + ((((slot / 500) | 0) % 20) + 0.5) * (span / 20),
      ]),
    );

    const suppression = createStarSuppression(systems);
    const words = new Uint32Array(MASK_WORDS * 512);
    const keysOf = (from: readonly [number, number, number]): Set<string> =>
      new Set(
        listDrawnBoxels(from, distance)
          .filter((boxel) => boxel.sizeClass === base)
          .map((boxel) => boxel.index.join(',')),
      );
    const build = (from: readonly [number, number, number]): number => {
      const boxels = listDrawnBoxels(from, distance).filter(
        (boxel) => boxel.sizeClass === base,
      );
      suppression.begin(base);
      boxels.forEach((boxel, slot) => {
        suppression.write(boxel.index, boxel.sizeClass, 30, words, slot * MASK_WORDS);
      });
      return suppression.sweptCount;
    };

    expect(build(camera)).toBe(512);

    // `buildBoxelBlocks` takes the base low from the four boxels the class above
    // drops, so the base block moves in steps of two base boxels. A camera step of one
    // base boxel therefore brings in either no boxel or two planes of 64. The sweep
    // computes a set for exactly the boxels that entered, and for no other.
    let previous = keysOf(camera);
    const entered: number[] = [];
    for (let step = 1; step <= 2; step += 1) {
      const from: [number, number, number] = [
        camera[0] + step * edge,
        camera[1],
        camera[2],
      ];
      const swept = build(from);
      const next = keysOf(from);
      const fresh = [...next].filter((key) => !previous.has(key)).length;
      expect(swept, `step ${step}`).toBe(fresh);
      entered.push(swept);
      previous = next;
    }
    expect(entered.some((count) => count === 0)).toBe(true);
    expect(Math.max(...entered)).toBeLessThanOrEqual(128);
  });
});
