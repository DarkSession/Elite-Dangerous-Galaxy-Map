// The march on the CPU, over the committed assets.
//
// `shaders/nebulae.frag` applies no upper clamp to the transmittance, because five of
// the 33 assets carry a negative extinction channel and clamping changes what they draw.
// Without a clamp the transmittance can rise above 1, and the output alpha is that
// transmittance, so a value above 1 would raise the light of the scene behind a nebula.
// This file marches the committed art and reads the range.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  decodeBC4,
  NEBULA_DDS_HEADER_BYTES,
  NEBULA_TRANSFER_BYTES,
  NEBULA_TRANSFER_ENTRIES,
} from './nebula-volumes';
import type { NebulaVolumeEntry } from './nebula-volumes';
import { nebulaRotationMatrix } from './nebula-pass';

const artDir = fileURLToPath(new URL('./nebula-art/', import.meta.url));
const index = JSON.parse(readFileSync(`${artDir}nebula-volumes.json`, 'utf8')) as {
  assets: NebulaVolumeEntry[];
};
const transferFile = readFileSync(`${artDir}transfer.bin`);

/** One decoded asset, as the upload would hold it. */
interface Marched {
  readonly name: string;
  readonly side: number;
  readonly density: Uint8Array;
  readonly transfer: Float32Array;
  /** The colour volume, where the march reads emission as well as alpha. */
  readonly colour?: { readonly side: number; readonly data: Uint8Array };
}

function assetOf(entry: NebulaVolumeEntry, slot: number): Marched {
  const side = entry.density.size;
  const blocks = readFileSync(`${artDir}${entry.name}-density.dds`).subarray(
    NEBULA_DDS_HEADER_BYTES,
  );
  const at = slot * NEBULA_TRANSFER_BYTES;
  return {
    name: entry.name,
    side,
    density: decodeBC4(blocks, side),
    transfer: new Float32Array(
      transferFile.buffer.slice(
        transferFile.byteOffset + at,
        transferFile.byteOffset + at + NEBULA_TRANSFER_BYTES,
      ),
    ),
  };
}

/** One channel at a point of a unit volume, filtered as `LINEAR` filters it. */
function sample(
  data: Uint8Array,
  stride: number,
  channel: number,
  side: number,
  u: number,
  v: number,
  w: number,
): number {
  const at = (value: number): [number, number, number] => {
    const texel = Math.min(Math.max(value * side - 0.5, 0), side - 1);
    const low = Math.floor(texel);
    const high = Math.min(low + 1, side - 1);
    return [low, high, texel - low];
  };
  const [x0, x1, fx] = at(u);
  const [y0, y1, fy] = at(v);
  const [z0, z1, fz] = at(w);
  const read = (x: number, y: number, z: number): number =>
    (data[((z * side + y) * side + x) * stride + channel] as number) / 255;
  const mix = (a: number, b: number, f: number): number => a + (b - a) * f;
  return mix(
    mix(
      mix(read(x0, y0, z0), read(x1, y0, z0), fx),
      mix(read(x0, y1, z0), read(x1, y1, z0), fx),
      fy,
    ),
    mix(
      mix(read(x0, y0, z1), read(x1, y0, z1), fx),
      mix(read(x0, y1, z1), read(x1, y1, z1), fx),
      fy,
    ),
    fz,
  );
}

/**
 * One ray, as `shaders/nebulae.frag` marches it: the slab test with the near end clamped
 * at 0, the four-channel recurrence with no upper clamp, the emission after the step and
 * the same early exit. The output alpha is the running alpha transmittance, which is
 * what the shader writes and what the pass multiplies the accumulated alpha by.
 */
function marchOf(
  asset: Marched,
  eye: readonly [number, number, number],
  dir: readonly [number, number, number],
  steps: number,
  gain: readonly [number, number, number] = [0, 0, 0],
): { colour: [number, number, number]; transmittance: number } {
  const low = [0, 0, 0];
  const high = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const inverse = 1 / (dir[axis] as number);
    const first = (-1 - (eye[axis] as number)) * inverse;
    const second = (1 - (eye[axis] as number)) * inverse;
    low[axis] = Math.min(first, second);
    high[axis] = Math.max(first, second);
  }
  const near = Math.max(low[0] as number, low[1] as number, low[2] as number, 0);
  const far = Math.min(high[0] as number, high[1] as number, high[2] as number);
  // A ray that misses the box draws nothing, so it takes no light from the scene.
  if (far <= near) return { colour: [0, 0, 0], transmittance: 1 };

  const count = Math.min(Math.max(Math.ceil((far - near) * steps), 1), 256);
  const step = (far - near) / count;
  const transmittance = [1, 1, 1, 1];
  const emission: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < count; index += 1) {
    const along = near + (index + 0.5) * step;
    const u = ((eye[0] as number) + (dir[0] as number) * along) * 0.5 + 0.5;
    const v = ((eye[1] as number) + (dir[1] as number) * along) * 0.5 + 0.5;
    const w = ((eye[2] as number) + (dir[2] as number) * along) * 0.5 + 0.5;
    const density = sample(asset.density, 1, 0, asset.side, u, 1 - v, w);
    const entry = Math.min(
      Math.max(Math.trunc(density * 255), 0),
      NEBULA_TRANSFER_ENTRIES - 1,
    );
    for (let channel = 0; channel < 4; channel += 1) {
      const extinction = asset.transfer[entry * 4 + channel] as number;
      // The shader clamps the factor, not the product, so a negative channel stops the
      // ray rather than turning the transmittance around.
      const held = Math.max(0, 1 - extinction * density * step);
      transmittance[channel] = (transmittance[channel] as number) * held;
    }
    const art = asset.colour;
    if (art) {
      for (let channel = 0; channel < 3; channel += 1) {
        emission[channel] +=
          sample(art.data, 4, channel, art.side, u, 1 - v, w) *
          (gain[channel] as number) *
          (transmittance[channel] as number) *
          density *
          step;
      }
    }
    if (transmittance.every((held) => held < 0.01)) break;
  }
  return { colour: emission, transmittance: transmittance[3] as number };
}

/** Rays into the box, from outside it, along each axis and across a small grid. */
function* raysOf(): Generator<{
  eye: [number, number, number];
  dir: [number, number, number];
}> {
  const offsets = [-0.75, -0.25, 0.25, 0.75];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [1, -1]) {
      for (const a of offsets) {
        for (const b of offsets) {
          const eye: [number, number, number] = [0, 0, 0];
          const dir: [number, number, number] = [0, 0, 0];
          eye[axis] = -2 * side;
          dir[axis] = side;
          eye[(axis + 1) % 3] = a;
          eye[(axis + 2) % 3] = b;
          yield { eye, dir };
        }
      }
    }
  }
}

describe('the marched alpha', () => {
  // The three rates are the default and the two the design offers either side of it.
  const RATES = [25, 32, 64];

  test('stays in range on every asset, at every step rate', () => {
    const assets = index.assets.map(assetOf);
    expect(assets).toHaveLength(33);

    let lowest = 1;
    let highest = 0;
    let worst = '';
    for (const asset of assets) {
      for (const steps of RATES) {
        for (const ray of raysOf()) {
          const alpha = marchOf(asset, ray.eye, ray.dir, steps).transmittance;
          expect(
            Number.isFinite(alpha),
            `${asset.name} at ${steps} steps gave ${alpha}`,
          ).toBe(true);
          if (alpha < lowest) {
            lowest = alpha;
            worst = `${asset.name} at ${steps}`;
          }
          if (alpha > highest) highest = alpha;
          expect(
            alpha,
            `${asset.name} at ${steps} steps gave an alpha of ${alpha}`,
          ).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(1);
        }
      }
    }
    console.log('the marched alpha', { lowest, highest, worst });
  });

  // Five assets carry a negative extinction channel, so the recurrence is not monotone.
  // The reading above is what makes the missing clamp safe, and this names the five.
  test('names the five assets that can raise the transmittance above 1', () => {
    const negative: string[] = [];
    for (let slot = 0; slot < index.assets.length; slot += 1) {
      const at = slot * NEBULA_TRANSFER_BYTES;
      const table = new Float32Array(
        transferFile.buffer.slice(
          transferFile.byteOffset + at,
          transferFile.byteOffset + at + NEBULA_TRANSFER_BYTES,
        ),
      );
      if (table.some((value) => value < 0)) {
        negative.push(index.assets[slot]?.name as string);
      }
    }
    expect(negative.sort()).toEqual([
      'cats-eye',
      'fine-ring',
      'orion',
      'planetary-01',
      'pleiades',
    ]);
  });
});

// The integral itself, on a pair the arithmetic can be worked out by hand. The test
// above reads the committed art, where the density changes at every step and no closed
// form exists. This one holds the recurrence: a flat volume makes every step the same,
// so the transmittance is one number raised to the step count and the emission is the
// sum of its powers.
describe('the march integral', () => {
  /** 128 over 255, the density a flat volume of 128 gives at every point and every edge. */
  const DENSITY = 128 / 255;
  /** The one extinction the flat transfer table holds, in all four channels. */
  const EXTINCTION = 0.5;
  /** 64 over 255, the colour a flat volume of 64 gives. */
  const COLOUR = 64 / 255;
  const GAIN: [number, number, number] = [2, 3, 4];

  /** A volume of one density, one colour and one extinction, four texels a side. */
  function flatAsset(): Marched {
    const side = 4;
    const texels = side * side * side;
    const colour = new Uint8Array(texels * 4);
    for (let at = 0; at < texels; at += 1) {
      colour[at * 4] = 64;
      colour[at * 4 + 1] = 64;
      colour[at * 4 + 2] = 64;
      colour[at * 4 + 3] = 255;
    }
    return {
      name: 'flat',
      side,
      density: new Uint8Array(texels).fill(128),
      transfer: new Float32Array(NEBULA_TRANSFER_ENTRIES * 4).fill(EXTINCTION),
      colour: { side, data: colour },
    };
  }

  /** The hand-computed pair for `count` steps of `step` units through the flat volume. */
  function byHand(
    count: number,
    step: number,
  ): { colour: [number, number, number]; transmittance: number } {
    const held = 1 - EXTINCTION * DENSITY * step;
    let powers = 0;
    for (let index = 1; index <= count; index += 1) powers += held ** index;
    const of = (channel: number): number =>
      COLOUR * (GAIN[channel] as number) * DENSITY * step * powers;
    return { colour: [of(0), of(1), of(2)], transmittance: held ** count };
  }

  test('matches the hand-computed result on a ray across the box', () => {
    // The eye sits two units back on z and looks along it, so the slab gives a near of 1
    // and a far of 3. At one step over a unit the march takes two steps of one unit.
    const marched = marchOf(flatAsset(), [0, 0, -2], [0, 0, 1], 1, GAIN);
    const wanted = byHand(2, 1);
    // (1 - 0.5 * 128/255) ** 2, which is 0.56103037... The shader wrote one minus this
    // before the blend changed, so the figure is the same reading the other way.
    expect(wanted.transmittance).toBeCloseTo(0.56103037, 8);
    expect(marched.transmittance).toBeCloseTo(wanted.transmittance, 12);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(marched.colour[channel], `channel ${channel}`).toBeCloseTo(
        wanted.colour[channel] as number,
        12,
      );
    }
  });

  test('starts the march at the eye when the camera is inside the box', () => {
    // The near end clamps at 0, so the segment runs from the eye to the far face: one
    // unit, and four steps of a quarter at a rate of four.
    const marched = marchOf(flatAsset(), [0, 0, 0], [0, 0, 1], 4, GAIN);
    const wanted = byHand(4, 0.25);
    // (1 - 0.5 * 128/255 * 0.25) ** 4, which is 0.77166869... The shader wrote one minus
    // this before the blend changed.
    expect(wanted.transmittance).toBeCloseTo(0.77166869, 8);
    expect(marched.transmittance).toBeCloseTo(wanted.transmittance, 12);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(marched.colour[channel], `channel ${channel}`).toBeCloseTo(
        wanted.colour[channel] as number,
        12,
      );
    }
  });
});

// How much of a turned volume the box leaves out.
//
// `shaders/nebulae.vert` draws a box that is axis-aligned in the world frame, and
// `uRotation` turns the volume the march samples inside it. A texel of the volume is
// reached only where its pre-image under the rotation falls back inside the box, so a
// turned volume loses its corners. The spec delta bounds that loss at 1 percent of the
// volume's density mass, and this reads it over every record that carries a rotation.
describe('the turned volume', () => {
  const records = (
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../scene-data/nebulae.json', import.meta.url)),
        'utf8',
      ),
    ) as { records: (number | string)[][] }
  ).records;

  test('loses under 1 percent of the density mass on every turned record', () => {
    const turned = records.filter(
      (row) => row[5] !== 0 || row[6] !== 0 || row[7] !== 0,
    );
    // Five records of 358 carry a rotation. A sixth would change the reading below.
    expect(turned).toHaveLength(5);

    const shares: { name: string; share: number }[] = [];
    for (const row of turned) {
      const slot = row[4] as number;
      const entry = index.assets[slot] as NebulaVolumeEntry;
      const asset = assetOf(entry, slot);
      const matrix = nebulaRotationMatrix([
        row[5] as number,
        row[6] as number,
        row[7] as number,
      ]);
      const side = asset.side;
      let total = 0;
      let lost = 0;
      for (let z = 0; z < side; z += 1) {
        const qz = ((z + 0.5) / side) * 2 - 1;
        for (let y = 0; y < side; y += 1) {
          // The stored volume runs opposite to object-space y, as the march reads it.
          const qy = -(((y + 0.5) / side) * 2 - 1);
          for (let x = 0; x < side; x += 1) {
            const qx = ((x + 0.5) / side) * 2 - 1;
            const mass = asset.density[(z * side + y) * side + x] as number;
            if (mass === 0) continue;
            total += mass;
            // The rotation is orthonormal, so its transpose takes a volume point back
            // to the object point that samples it.
            const px =
              (matrix[0] as number) * qx +
              (matrix[1] as number) * qy +
              (matrix[2] as number) * qz;
            const py =
              (matrix[3] as number) * qx +
              (matrix[4] as number) * qy +
              (matrix[5] as number) * qz;
            const pz =
              (matrix[6] as number) * qx +
              (matrix[7] as number) * qy +
              (matrix[8] as number) * qz;
            if (Math.abs(px) > 1 || Math.abs(py) > 1 || Math.abs(pz) > 1) lost += mass;
          }
        }
      }
      shares.push({ name: `${row[8] ?? slot}`, share: total === 0 ? 0 : lost / total });
    }
    console.log('the turned volume', shares);

    for (const one of shares) {
      expect(one.share, `${one.name} loses too much`).toBeLessThan(0.01);
    }
  });
});

// The spec's scenario **The layer interpolation matches a trilinear filter**.
//
// A `sampler2DArray` filters inside a layer and not across layers, so the march reads
// two layers and mixes them itself. `shaders/nebulae.frag` states the arithmetic below
// in GLSL, and this is the same arithmetic in TypeScript.
//
// **This test is not an oracle for the shader.** Vitest cannot run GLSL, so it cannot
// see what the shader does; what it catches is a wrong half-texel offset or a wrong
// clamp in the arithmetic itself. What holds the shader to this arithmetic is the CPU
// fixture comparison of `e2e/nebulae.spec.ts`, which marches the real shader on the GPU
// against a reference that filters trilinearly. The two together are the check; neither
// alone is.
describe('the layer interpolation', () => {
  const SIDE = 8;

  /** A volume whose every texel differs, so a wrong layer reads a wrong number. */
  const volume = new Uint8Array(SIDE * SIDE * SIDE);
  for (let z = 0; z < SIDE; z += 1) {
    for (let y = 0; y < SIDE; y += 1) {
      for (let x = 0; x < SIDE; x += 1) {
        volume[(z * SIDE + y) * SIDE + x] = (x * 13 + y * 29 + z * 53) % 256;
      }
    }
  }

  /**
   * The march's own read: the layer axis carries a half-texel offset and clamps at both
   * ends, and each layer is filtered inside itself, as the texture unit filters it.
   */
  function arrayRead(u: number, v: number, w: number): number {
    const t = Math.min(Math.max(w * SIDE - 0.5, 0), SIDE - 1);
    const low = Math.floor(t);
    const high = Math.min(low + 1, SIDE - 1);
    const centre = (layer: number): number =>
      sample(volume, 1, 0, SIDE, u, v, (layer + 0.5) / SIDE);
    const first = centre(low);
    const second = centre(high);
    return first + (second - first) * (t - low);
  }

  test('reads what a trilinear filter of the same data reads', () => {
    // Between layer centres, at both faces and past both ends of the axis.
    const points = [
      0.5 / SIDE,
      1 / SIDE,
      1.5 / SIDE,
      0.3,
      0.5,
      0.7,
      (SIDE - 0.5) / SIDE,
      0,
      1,
      -0.2,
      1.3,
    ];
    for (const w of points) {
      for (const [u, v] of [
        [0.5, 0.5],
        [0.125, 0.875],
        [0.31, 0.62],
        [0, 1],
      ] as const) {
        expect(arrayRead(u, v, w), `at w ${w}`).toBeCloseTo(
          sample(volume, 1, 0, SIDE, u, v, w),
          4,
        );
      }
    }
  });

  // The half-texel offset is what makes a sample at the volume's face read that face
  // and not a blend with nothing. Without it the whole volume shifts by half a texel.
  test('reads the end layers flat at the faces and past them', () => {
    for (const w of [-0.5, 0, 0.5 / SIDE]) {
      expect(arrayRead(0.5, 0.5, w)).toBeCloseTo(
        sample(volume, 1, 0, SIDE, 0.5, 0.5, 0.5 / SIDE),
        6,
      );
    }
    for (const w of [(SIDE - 0.5) / SIDE, 1, 1.5]) {
      expect(arrayRead(0.5, 0.5, w)).toBeCloseTo(
        sample(volume, 1, 0, SIDE, 0.5, 0.5, (SIDE - 0.5) / SIDE),
        6,
      );
    }
  });
});
