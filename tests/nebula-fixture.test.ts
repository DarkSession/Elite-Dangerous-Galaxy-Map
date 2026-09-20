// Holds the CPU reference generator to the map's own rules.
//
// `scripts/build-nebula-fixture.mjs` builds the fixture the browser test compares the
// marched frame against. It is a plain script, so it carries its own copy of the block
// decode, the selection and the rotation matrix rather than importing the TypeScript the
// map uses. A copy that drifted would move the fixture and the browser test would still
// pass, because both sides would have moved together.
//
// This test is what stops that: it runs both copies over the committed art and the
// committed records and holds the answers together. It also holds the committed fixture
// files to the record file they were built from.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  buildNebulaSet,
  nebulaFocalPixels,
  selectNebulae,
} from '../src/scene-data/nebulae';
import { decodeBC1, decodeBC4, readNebulaKtx2 } from '../src/render/nebula-volumes';
import { nebulaRotationMatrix } from '../src/render/nebula-pass';
import {
  cameraPosition,
  decodeBC1 as fixtureBC1,
  decodeBC4 as fixtureBC4,
  focalPixels as fixtureFocal,
  readAssets,
  readRecords,
  rotationMatrix as fixtureRotation,
  selectRecords,
} from '../scripts/build-nebula-fixture.mjs';
import type { FixtureInstance, FixtureView } from '../scripts/build-nebula-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const meta = JSON.parse(
  readFileSync(`${root}e2e/fixtures/nebula-fixtures.json`, 'utf8'),
) as {
  records_sha256: string;
  views: Record<
    string,
    { record: number; crop: number; drawn: number; view: FixtureView }
  >;
};

const recordFile = readFileSync(`${root}src/scene-data/nebulae.json`);
const set = buildNebulaSet(JSON.parse(recordFile.toString('utf8')));

describe('the nebula fixture generator', () => {
  test('was built from the committed record file', () => {
    expect(createHash('sha256').update(recordFile).digest('hex')).toBe(
      meta.records_sha256,
    );
  });

  test('writes one file of the crop it names, three bytes a pixel', () => {
    for (const [name, entry] of Object.entries(meta.views)) {
      const bytes = readFileSync(`${root}e2e/fixtures/nebula-${name}.bin`);
      expect(bytes.length, `${name} is the wrong size`).toBe(
        entry.crop * entry.crop * 3,
      );
      // An odd crop would put the middle of the frame between two pixels.
      expect(entry.crop % 2, `${name} crop is odd`).toBe(0);
      // The map's own closest zoom. A view below it would not be the view the map draws.
      expect(
        entry.view.distance,
        `${name} zooms past the map's limit`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  test('reads the same records the map reads', () => {
    const fixtureSet = readRecords();
    expect(fixtureSet.count).toBe(set.count);
    expect([...fixtureSet.assets]).toEqual([...set.assets]);
    expect([...fixtureSet.radii]).toEqual([...set.radii]);
    // The generator keeps the angles in `float32`, as the set does.
    expect([...fixtureSet.rotations]).toEqual([...set.rotations]);
  });

  test('decodes every block of every asset as the map decodes it', () => {
    const assets = readAssets();
    expect(assets).toHaveLength(33);
    for (const asset of assets) {
      const blocks = (file: string): Uint8Array =>
        readNebulaKtx2(readFileSync(`${root}src/render/nebula-art/${file}`), file)
          .blocks;
      // The density runs 32, 48 or 64 texels a side and the colour 8, 16 or 32.
      expect([32, 48, 64], `${asset.name} density side`).toContain(asset.densitySide);
      expect([8, 16, 32], `${asset.name} colour side`).toContain(asset.colourSide);
      expect(
        Buffer.from(asset.density).equals(
          Buffer.from(
            decodeBC4(blocks(`${asset.name}-density.ktx2`), asset.densitySide),
          ),
        ),
        `${asset.name} density differs`,
      ).toBe(true);
      expect(
        Buffer.from(asset.colour).equals(
          Buffer.from(decodeBC1(blocks(`${asset.name}-colour.ktx2`), asset.colourSide)),
        ),
        `${asset.name} colour differs`,
      ).toBe(true);
    }
  });

  test('holds the two block decoders together on a made-up block', () => {
    // A block of its own, so the check does not depend on the committed art holding
    // both interpolation modes. The first block takes `r0 > r1` and the second the
    // other mode.
    const side = 4;
    const density = new Uint8Array(8);
    density.set([200, 30, 0x88, 0x44, 0x22, 0x11, 0x99, 0x55]);
    expect([...fixtureBC4(density, side)]).toEqual([...decodeBC4(density, side)]);
    const colour = new Uint8Array(8);
    colour.set([0x12, 0x34, 0xab, 0xcd, 0x1b, 0x2e, 0x3f, 0x40]);
    expect([...fixtureBC1(colour, side)]).toEqual([...decodeBC1(colour, side)]);
  });

  test('builds the same rotation matrix the pass builds', () => {
    for (const rotation of [
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
      [0.31, -1.2, 2.7],
      [6.1596, 1.0448, 3.761],
    ] as [number, number, number][]) {
      const mine = [...fixtureRotation(rotation)];
      const theirs = [...nebulaRotationMatrix(rotation)];
      for (let at = 0; at < 9; at += 1) {
        expect(mine[at], `${rotation.join(',')} differs at ${at}`).toBeCloseTo(
          theirs[at] as number,
          6,
        );
      }
    }
  });

  test('selects the same records the map selects, at every fixture view', () => {
    for (const [name, entry] of Object.entries(meta.views)) {
      const view = entry.view;
      const camera = cameraPosition(view);
      const focal = nebulaFocalPixels(720, 60);
      expect(fixtureFocal(720, 60)).toBe(focal);

      const theirs = selectNebulae(set, {
        camera,
        distance: view.distance,
        focalPixels: focal,
        canvasHeightCss: 720,
        canvasWidthCss: 1280,
      });
      const mine = selectRecords(readRecords(), {
        camera,
        distance: view.distance,
        focalPixels: focal,
        canvasHeightCss: 720,
        canvasWidthCss: 1280,
      });

      expect(mine.weight, `${name} weight`).toBe(theirs.weight);
      expect(
        mine.instances.map((one) => one.index),
        `${name} order`,
      ).toEqual(theirs.instances.map((one) => one.index));
      expect(mine.instances.length, `${name} count`).toBe(entry.drawn);
      for (let at = 0; at < mine.instances.length; at += 1) {
        expect(
          (mine.instances[at] as FixtureInstance).fade,
          `${name} fade at ${at}`,
        ).toBeCloseTo((theirs.instances[at] as { fade: number }).fade, 12);
      }
    }
  });
});
