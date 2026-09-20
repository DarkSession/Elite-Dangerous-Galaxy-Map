import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import { DEFAULT_CLOUD_COUNT, generateCloudSet } from '../scene-data/cloud-set';
import type { CloudSet } from '../scene-data/types';
import { CLOUD_RATIO_CEILING, CLOUD_RATIO_FLOOR } from './cloud-pass';

const pngPath = fileURLToPath(
  new URL('../galaxy-model/galaxy-detail.png', import.meta.url),
);

let set: CloudSet;

beforeAll(async () => {
  const grid = await decodeDetailGrid(new Uint8Array(readFileSync(pngPath)));
  const model = createGalaxyModel(parameters, grid);
  set = generateCloudSet(model, { count: DEFAULT_CLOUD_COUNT, seed: 7 });
}, 120000);

describe('the cloud pass', () => {
  test('holds the ratio of a known share of the set', () => {
    let below = 0;
    let above = 0;
    for (let index = 0; index < set.count; index += 1) {
      const ratio = set.ratios[index] as number;
      if (ratio < CLOUD_RATIO_FLOOR) below += 1;
      if (ratio > CLOUD_RATIO_CEILING) above += 1;
    }

    // The set reads 0.263 at the floor and 0.515 at the ceiling. The bands hold the
    // two shares that the brightness rule rests on: about a quarter of the sprites
    // light the outer disc and the rim at the floor, and about half the sprites hold
    // one brightness over the inner disc.
    expect(below / set.count).toBeGreaterThanOrEqual(0.2);
    expect(below / set.count).toBeLessThanOrEqual(0.32);
    expect(above / set.count).toBeGreaterThanOrEqual(0.45);
    expect(above / set.count).toBeLessThanOrEqual(0.58);
  });
});
