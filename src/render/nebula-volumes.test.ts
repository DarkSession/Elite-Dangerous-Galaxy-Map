import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createNebulaVolumeTextures,
  loadNebulaVolumes,
  decodeBC1,
  decodeBC4,
  nebulaAssetUrl,
  nebulaAssetUrlCount,
  nebulaBlockFormats,
  NEBULA_KTX2_BC1,
  NEBULA_KTX2_BC4,
  NEBULA_KTX2_HEADER_BYTES,
  NEBULA_TRANSFER_BYTES,
  NEBULA_TRANSFER_ENTRIES,
} from './nebula-volumes';
import type { NebulaVolumeEntry, NebulaVolumeSet } from './nebula-volumes';
import {
  VK_FORMAT_BC1_RGB_UNORM_BLOCK,
  VK_FORMAT_BC4_UNORM_BLOCK,
  writeNebulaKtx2,
} from '../../scripts/ktx2.mjs';

const artDir = fileURLToPath(new URL('./nebula-art/', import.meta.url));
const index = JSON.parse(readFileSync(`${artDir}nebula-volumes.json`, 'utf8')) as {
  assets: NebulaVolumeEntry[];
};

/** The digests of the committed art, which ship in no build. */
const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../tests/fixtures/nebulae.json', import.meta.url)),
    'utf8',
  ),
) as { volume_blocks_sha256: Record<string, string> };

/** The two volumes of one asset, and the `vkFormat` each one takes. */
const KINDS = [
  { kind: 'density', format: NEBULA_KTX2_BC4 },
  { kind: 'colour', format: NEBULA_KTX2_BC1 },
] as const;

/** One call the upload made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** The `COMPRESSED_RED_RGTC1_EXT` the stub reports, which carries the density. */
const STUB_BC4 = 0x8dbb;

/** The `COMPRESSED_RGB_S3TC_DXT1_EXT` the stub reports, which carries the colour. */
const STUB_BC1 = 0x83f0;

/** What a test asks the stub context to do beyond answering every call. */
interface FakeOptions {
  /**
   * The block formats whose `texStorage3D` on a `TEXTURE_2D_ARRAY` raises
   * `INVALID_OPERATION`, which is what Firefox does with `COMPRESSED_RED_RGTC1`. A test
   * names one format and leaves the other accepted, so the probe of each format is
   * read on its own.
   *
   * The probe reads any error as a refusal, so the code the stub raises does not change
   * what it does. The name is here because it is the fact this change records.
   */
  readonly refuse?: readonly number[];
  /**
   * Puts one error in the queue before the map runs. `getError` reports one error and
   * clears it, so a probe that does not drain the queue reads this error as its own.
   */
  readonly errorBefore?: boolean;
}

/**
 * A context that answers every call and gives every constant its own number.
 *
 * `textureLimit` makes `createTexture` give `null` from that call on, which is what a
 * context out of memory does. `blockFormats` makes it report the two compressed-texture
 * extensions. `options` refuses a format or raises an error before the probe.
 *
 * The context answers `getError` and `getParameter`, because the block-format probe
 * reads both. Every `SCREAMING_CASE` key reads an auto-numbered constant, so `NO_ERROR`
 * is not 0 and the probe compares against `gl.NO_ERROR` and not against a literal.
 */
function fakeContext(
  textureLimit = Number.POSITIVE_INFINITY,
  blockFormats = false,
  options: FakeOptions = {},
): {
  gl: WebGL2RenderingContext;
  of(name: string): Call[];
  /** The textures the context made and the code did not delete. */
  live(): unknown[];
} {
  const calls: Call[] = [];
  let textures = 0;
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {};
  const constantOf = (key: string): number => {
    const held = constants.get(key);
    if (held !== undefined) return held;
    const next = constants.size + 1;
    constants.set(key, next);
    return next;
  };
  const alive = new Set<unknown>();
  const refused = new Set<number>(options.refuse ?? []);
  const errors: number[] =
    options.errorBefore === true ? [constantOf('INVALID_OPERATION')] : [];
  let boundArray: unknown = null;
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_state, key): unknown {
      if (typeof key !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) return constantOf(key);
      return (...args: unknown[]): unknown => {
        calls.push({ name: key, args });
        if (key === 'createTexture') {
          textures += 1;
          if (textures > textureLimit) return null;
          const texture = { name: key, at: textures };
          alive.add(texture);
          return texture;
        }
        if (key === 'deleteTexture') {
          alive.delete(args[0]);
          return null;
        }
        if (key === 'bindTexture') {
          if (args[0] === constantOf('TEXTURE_2D_ARRAY')) boundArray = args[1] ?? null;
          return null;
        }
        if (key === 'texStorage3D') {
          if (
            args[0] === constantOf('TEXTURE_2D_ARRAY') &&
            refused.has(args[2] as number)
          ) {
            errors.push(constantOf('INVALID_OPERATION'));
          }
          return null;
        }
        if (key === 'getError') return errors.shift() ?? constantOf('NO_ERROR');
        if (key === 'getParameter') {
          return args[0] === constantOf('TEXTURE_BINDING_2D_ARRAY') ? boundArray : null;
        }
        if (key === 'getExtension') {
          if (!blockFormats) return null;
          if (args[0] === 'EXT_texture_compression_rgtc') {
            return { COMPRESSED_RED_RGTC1_EXT: STUB_BC4 };
          }
          if (args[0] === 'WEBGL_compressed_texture_s3tc') {
            return { COMPRESSED_RGB_S3TC_DXT1_EXT: STUB_BC1 };
          }
          return null;
        }
        return key.startsWith('create') ? { name: key } : null;
      };
    },
  };
  return {
    gl: new Proxy(state, handler) as unknown as WebGL2RenderingContext,
    of: (name) => calls.filter((call) => call.name === name),
    live: () => [...alive],
  };
}

/** One BC4 block: two endpoints and 16 three-bit indices. */
function bc4Block(r0: number, r1: number, indices: readonly number[]): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = r0;
  out[1] = r1;
  let low = 0;
  let high = 0;
  for (let i = 0; i < 8; i += 1) low |= (indices[i] as number) << (3 * i);
  for (let i = 8; i < 16; i += 1) high |= (indices[i] as number) << (3 * (i - 8));
  for (let byte = 0; byte < 3; byte += 1) {
    out[2 + byte] = (low >> (8 * byte)) & 255;
    out[5 + byte] = (high >> (8 * byte)) & 255;
  }
  return out;
}

/** One BC1 block: two 565 endpoints and 16 two-bit indices. */
function bc1Block(c0: number, c1: number, indices: readonly number[]): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = c0 & 255;
  out[1] = (c0 >> 8) & 255;
  out[2] = c1 & 255;
  out[3] = (c1 >> 8) & 255;
  let bits = 0;
  for (let i = 0; i < 16; i += 1) bits |= (indices[i] as number) << (2 * i);
  for (let byte = 0; byte < 4; byte += 1) out[4 + byte] = (bits >>> (8 * byte)) & 255;
  return out;
}

describe('the BC4 decode', () => {
  // `r0 > r1` gives eight levels: the two endpoints and six between them.
  test('reads the eight-level mode', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];
    const texels = decodeBC4(bc4Block(210, 70, indices), 4);
    expect(texels).toHaveLength(64);
    expect(texels[0]).toBe(210);
    expect(texels[1]).toBe(70);
    expect(texels[2]).toBe(Math.trunc((6 * 210 + 70) / 7));
    expect(texels[7]).toBe(Math.trunc((1 * 210 + 6 * 70) / 7));
    // One block fills one slice. The slices above it read the blocks after it, which
    // this input does not hold, so they stay 0.
    expect(texels[16]).toBe(0);
  });

  // `r0 <= r1` gives six levels, then 0 and 255.
  test('reads the six-level mode, with 0 and 255 at the ends', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0];
    const texels = decodeBC4(bc4Block(70, 210, indices), 4);
    expect(texels[0]).toBe(70);
    expect(texels[1]).toBe(210);
    expect(texels[2]).toBe(Math.trunc((4 * 70 + 210) / 5));
    expect(texels[6]).toBe(0);
    expect(texels[7]).toBe(255);
  });

  // The 16 indices fill a 4 by 4 patch, row after row.
  test('lays the 16 indices out row after row', () => {
    const indices = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1];
    const texels = decodeBC4(bc4Block(200, 10, indices), 4);
    expect(Array.from(texels.subarray(0, 4))).toEqual([200, 200, 200, 200]);
    expect(Array.from(texels.subarray(4, 8))).toEqual([10, 10, 10, 10]);
  });
});

describe('the BC1 decode', () => {
  const RED = 0xf800;
  const BLUE = 0x001f;

  // `c0 > c1` gives four colours: the two endpoints and two thirds between them.
  test('reads the four-colour mode', () => {
    const indices = [0, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const texels = decodeBC1(bc1Block(RED, BLUE, indices), 4);
    expect(texels).toHaveLength(64 * 4);
    expect(Array.from(texels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(texels.subarray(4, 8))).toEqual([0, 0, 255, 255]);
    expect(texels[8]).toBe(Math.trunc((2 * 255) / 3));
    expect(texels[10]).toBe(Math.trunc(255 / 3));
    expect(texels[12]).toBe(Math.trunc(255 / 3));
    expect(texels[14]).toBe(Math.trunc((2 * 255) / 3));
  });

  // `c0 <= c1` gives three colours and a fourth slot this decode writes as black.
  test('reads the three-colour mode', () => {
    const indices = [0, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const texels = decodeBC1(bc1Block(BLUE, RED, indices), 4);
    expect(Array.from(texels.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(texels.subarray(4, 8))).toEqual([255, 0, 0, 255]);
    expect(texels[8]).toBe(Math.trunc(255 / 2));
    expect(texels[10]).toBe(Math.trunc(255 / 2));
    expect(Array.from(texels.subarray(12, 16))).toEqual([0, 0, 0, 255]);
  });
});

describe('the asset URLs', () => {
  // 33 density volumes, 33 colour volumes, the transfer file and the index.
  test('name all 68 files of the art directory', () => {
    expect(nebulaAssetUrlCount()).toBe(68);
    expect(nebulaAssetUrlCount()).toBe(index.assets.length * 2 + 2);
    for (const asset of index.assets) {
      expect(nebulaAssetUrl(`${asset.name}-density.ktx2`)).toContain(asset.name);
      expect(nebulaAssetUrl(`${asset.name}-colour.ktx2`)).toContain(asset.name);
    }
    expect(nebulaAssetUrl('transfer.bin')).toContain('transfer');
    expect(nebulaAssetUrl('nebula-volumes.json')).toContain('nebula-volumes');
  });

  test('refuse a file the directory does not hold', () => {
    expect(() => nebulaAssetUrl('no-such-asset-density.ktx2')).toThrow();
  });
});

describe('the upload', () => {
  /** How many bytes of blocks a volume of this side holds. */
  const blockBytes = (side: number): number => (side / 4) * (side / 4) * side * 8;

  /** A set of one asset whose two volumes are different sizes. */
  function oneAsset(densitySide: number, colourSide: number): NebulaVolumeSet {
    return {
      assets: [
        {
          name: 'one',
          densitySide,
          colourSide,
          density: new Uint8Array(blockBytes(densitySide)),
          colour: new Uint8Array(blockBytes(colourSide)),
          transfer: new Float32Array(NEBULA_TRANSFER_ENTRIES * 4),
        },
      ],
    };
  }

  // The sides come from the file, so a repacked set of another size is a drop-in.
  test('takes the sides from the file and not from the code', () => {
    const context = fakeContext();
    createNebulaVolumeTextures(context.gl, oneAsset(16, 4));
    const storage = context.of('texStorage3D');
    expect(storage).toHaveLength(2);
    expect(storage[0]?.args.slice(3)).toEqual([16, 16, 16]);
    expect(storage[1]?.args.slice(3)).toEqual([4, 4, 4]);
  });

  test('gives every asset a density, a colour and a transfer texture', () => {
    const context = fakeContext();
    const textures = createNebulaVolumeTextures(context.gl, oneAsset(8, 4));
    expect(textures.assets).toHaveLength(1);
    expect(context.of('createTexture')).toHaveLength(3);
    // One 2D table of 256 by 1, which the march reads with `texelFetch`.
    const table = context.of('texStorage2D');
    expect(table).toHaveLength(1);
    expect(table[0]?.args.slice(3)).toEqual([NEBULA_TRANSFER_ENTRIES, 1]);
    textures.dispose();
    expect(context.of('deleteTexture')).toHaveLength(3);
  });

  // A context that runs out part way through leaves the caller no handle to the textures
  // already made, so the upload frees them itself. `src/nebulae/index.ts` says the
  // `createDraw` chain frees whatever a failed call had made, and this is that promise.
  test('frees the textures already made when the upload throws', () => {
    // Four textures answer and the fifth does not, so the second asset throws on its
    // density volume with four already made.
    const context = fakeContext(4);
    const set = oneAsset(8, 4);
    const two = { assets: [set.assets[0], set.assets[0]] } as NebulaVolumeSet;
    expect(() => createNebulaVolumeTextures(context.gl, two)).toThrow(
      /gave no texture/,
    );
    expect(context.of('createTexture')).toHaveLength(5);
    expect(
      context.of('deleteTexture').map((call) => (call.args[0] as { at: number }).at),
    ).toEqual([1, 2, 3, 4]);
  });

  // The march walks out of the box at both ends of every axis. The layer axis carries
  // no wrap mode, because the shader picks the layer itself and clamps it itself.
  test('clamps the two filtered axes to the edge', () => {
    const context = fakeContext();
    const gl = context.gl;
    createNebulaVolumeTextures(gl, oneAsset(8, 4));
    const wraps = context
      .of('texParameteri')
      .filter((call) => call.args[0] === gl.TEXTURE_2D_ARRAY)
      .filter((call) => call.args[2] === gl.CLAMP_TO_EDGE)
      .map((call) => call.args[1]);
    expect(new Set(wraps)).toEqual(new Set([gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]));
  });

  // Both paths take the array target, so the march reads one sampler type and the
  // renderer compiles one program.
  test('uploads both volumes to a 2D array on both paths', () => {
    for (const blocks of [false, true]) {
      const context = fakeContext(Number.POSITIVE_INFINITY, blocks);
      const gl = context.gl;
      createNebulaVolumeTextures(gl, oneAsset(8, 4));
      // The block-format probe allocates on the same target before the upload does, so
      // the two the upload made are the last two.
      //
      // The **count** is read as well as the targets. The probe allocates twice where
      // both extensions are there, so a fast path that allocated nothing would still
      // leave two calls and the last two would read the array target. That is the shape
      // of the fault this change answers: a path whose textures are never specified.
      const allocations = context.of('texStorage3D');
      expect(allocations, `blocks ${String(blocks)}`).toHaveLength(blocks ? 4 : 2);
      const targets = allocations.slice(-2).map((call) => call.args[0]);
      expect(targets, `blocks ${String(blocks)}`).toEqual([
        gl.TEXTURE_2D_ARRAY,
        gl.TEXTURE_2D_ARRAY,
      ]);
    }
  });

  // The fast path: both extensions are there, so the blocks reach the card unchanged
  // and the load does no decode at all.
  test('uploads the blocks with no decode where both extensions are there', () => {
    const context = fakeContext(Number.POSITIVE_INFINITY, true);
    createNebulaVolumeTextures(context.gl, oneAsset(8, 4));
    const compressed = context.of('compressedTexSubImage3D');
    expect(compressed).toHaveLength(2);
    // All layers in one call, and the format the storage took.
    expect(compressed[0]?.args.slice(5, 9)).toEqual([8, 8, 8, 0x8dbb]);
    expect(compressed[1]?.args.slice(5, 9)).toEqual([4, 4, 4, 0x83f0]);
    expect(context.of('texSubImage3D')).toHaveLength(0);
  });

  // The fallback: one extension or neither, so both volumes decode and upload plain.
  test('decodes and uploads plain where an extension is missing', () => {
    const context = fakeContext();
    const gl = context.gl;
    createNebulaVolumeTextures(gl, oneAsset(8, 4));
    expect(context.of('compressedTexSubImage3D')).toHaveLength(0);
    const plain = context.of('texSubImage3D');
    expect(plain).toHaveLength(2);
    expect(plain[0]?.args[8]).toBe(gl.RED);
    expect(plain[1]?.args[8]).toBe(gl.RGBA);
    const storage = context.of('texStorage3D').map((call) => call.args[2]);
    expect(storage).toEqual([gl.R8, gl.RGBA8]);
  });

  // The spec's scenario **A refused format takes both volumes to the decode path**.
  //
  // A present extension is not proof. Firefox carries `EXT_texture_compression_rgtc`
  // and refuses `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY`, so `texStorage3D`
  // fails and every volume stays unspecified. The refusal is read twice, once for each
  // format, because a renderer that probed the first and trusted the second would keep
  // the fault.
  for (const refused of [
    { what: 'the density format', format: STUB_BC4 },
    { what: 'the colour format', format: STUB_BC1 },
  ]) {
    test(`decodes both volumes where the context refuses ${refused.what}`, () => {
      const context = fakeContext(Number.POSITIVE_INFINITY, true, {
        refuse: [refused.format],
      });
      const gl = context.gl;

      expect(nebulaBlockFormats(gl)).toBeNull();
      // The probe leaves no texture bound and none allocated.
      expect(context.live()).toEqual([]);
      expect(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY)).toBeNull();

      createNebulaVolumeTextures(gl, oneAsset(8, 4));
      expect(context.of('compressedTexSubImage3D')).toHaveLength(0);
      const plain = context.of('texSubImage3D');
      expect(plain).toHaveLength(2);
      expect(plain[0]?.args[8]).toBe(gl.RED);
      expect(plain[1]?.args[8]).toBe(gl.RGBA);
    });
  }

  // A function that reports a capability does not change the context it reports on.
  test('leaves the context as the probe found it', () => {
    const context = fakeContext(Number.POSITIVE_INFINITY, true);
    const gl = context.gl;

    expect(nebulaBlockFormats(gl)).toEqual({ density: STUB_BC4, colour: STUB_BC1 });
    // One texture a format, and both deleted.
    expect(context.of('createTexture')).toHaveLength(2);
    expect(context.of('deleteTexture')).toHaveLength(2);
    expect(context.live()).toEqual([]);
    expect(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY)).toBeNull();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  // `getError` reports one error and clears it, so a probe that does not drain the
  // queue first reads an error raised elsewhere as its own refusal.
  test('does not read an error raised before it as a refusal', () => {
    const context = fakeContext(Number.POSITIVE_INFINITY, true, { errorBefore: true });
    expect(nebulaBlockFormats(context.gl)).toEqual({
      density: STUB_BC4,
      colour: STUB_BC1,
    });
  });

  // A side that is not a multiple of 4 cannot be a block texture at all.
  test('refuses a side the blocks cannot cover', () => {
    const context = fakeContext(Number.POSITIVE_INFINITY, true);
    const set = oneAsset(8, 4);
    const odd = {
      assets: [
        { ...(set.assets[0] as NebulaVolumeSet['assets'][number]), colourSide: 6 },
      ],
    };
    expect(() => createNebulaVolumeTextures(context.gl, odd)).toThrow(
      /holds no blocks/,
    );
  });
});

describe('the committed set', () => {
  const files = [
    ...index.assets.flatMap((asset) => [
      `${asset.name}-density.ktx2`,
      `${asset.name}-colour.ktx2`,
    ]),
    'transfer.bin',
    'nebula-volumes.json',
  ];

  // Four different totals, each with a bound of its own. The committed readings are
  // 1.11, 2.78, 2.76 and 6.03 MiB.
  //
  // The two video-memory figures differ because the block path holds half a byte a
  // texel where the decoding path holds one byte for the density and four for the
  // colour. Both are read, because a context that carries fewer than both extensions
  // still pays the second one.
  //
  // The test takes its own timeout, because it brotli-compresses the whole art set at
  // the default quality of 11. That reads 3.7 seconds on the development machine, which
  // is inside the 5 second default, and longer than 5 seconds on a two-core pipeline
  // runner, which is not. The quality does not fall to make the test quick: the reading
  // is the wire budget this capability states, and a different quality states a
  // different figure.
  test('holds its budget over the wire, on disk and in video memory', () => {
    const MIB = 1024 * 1024;
    let wire = 0;
    let disk = 0;
    for (const file of files) {
      const bytes = readFileSync(`${artDir}${file}`);
      disk += bytes.byteLength;
      wire += brotliCompressSync(bytes).byteLength;
    }
    // The transfer tables sit in video memory on both paths: one table of 256 entries
    // of four `float32` an asset.
    const tables = index.assets.length * NEBULA_TRANSFER_BYTES;
    // The block path holds what the files hold, less their headers.
    let blocks = tables;
    for (const asset of index.assets) {
      for (const { kind } of KINDS) {
        blocks +=
          readFileSync(`${artDir}${asset.name}-${kind}.ktx2`).byteLength -
          NEBULA_KTX2_HEADER_BYTES;
      }
    }
    // The decoding path uploads the density as `R8` and the colour as `RGBA8`.
    let decoded = tables;
    for (const asset of index.assets) {
      decoded += asset.density.size ** 3 + asset.colour.size ** 3 * 4;
    }
    console.log('the volume set', {
      wire: wire / MIB,
      disk: disk / MIB,
      blocks: blocks / MIB,
      decoded: decoded / MIB,
    });
    expect(wire).toBeLessThanOrEqual(1.3 * MIB);
    expect(disk).toBeLessThanOrEqual(3.0 * MIB);
    expect(blocks).toBeLessThanOrEqual(3.0 * MIB);
    expect(decoded).toBeLessThanOrEqual(6.5 * MIB);
  }, 120000);

  // `AGENTS.md` and `README.md` both state the disk total, because it is what a host
  // pays to take the nebulae. Neither is generated, so a repack would leave them
  // behind without this.
  test('matches the disk total the documentation states', () => {
    let disk = 0;
    for (const file of files) disk += readFileSync(`${artDir}${file}`).byteLength;
    expect(files).toHaveLength(68);
    expect(disk).toBe(2_918_185);
    for (const doc of ['AGENTS.md', 'README.md']) {
      const text = readFileSync(
        fileURLToPath(new URL(`../../${doc}`, import.meta.url)),
        'utf8',
      );
      expect(text, `${doc} states another total`).toContain('2,918,185');
    }
  });

  // The spec's scenario **Every shipped file holds the shape the spec fixes**. The
  // reader takes one shape and one only, and this says every committed file is that
  // shape. The 208-byte header is what fixes the on-disk total.
  test('holds a KTX2 array of the shape the spec fixes', () => {
    for (const asset of index.assets) {
      for (const { kind, format } of KINDS) {
        const side = asset[kind].size;
        const file = `${asset.name}-${kind}.ktx2`;
        const bytes = readFileSync(`${artDir}${file}`);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(view.getUint32(12, true), `${file} vkFormat`).toBe(format);
        expect(view.getUint32(20, true), `${file} pixelWidth`).toBe(side);
        expect(view.getUint32(24, true), `${file} pixelHeight`).toBe(side);
        expect(view.getUint32(28, true), `${file} pixelDepth`).toBe(0);
        expect(view.getUint32(32, true), `${file} layerCount`).toBe(side);
        expect(view.getUint32(36, true), `${file} faceCount`).toBe(1);
        expect(view.getUint32(40, true), `${file} levelCount`).toBe(1);
        expect(view.getUint32(44, true), `${file} supercompression`).toBe(0);
        // The one level starts right after the header and runs to the end of the file.
        expect(Number(view.getBigUint64(80, true)), `${file} level offset`).toBe(
          NEBULA_KTX2_HEADER_BYTES,
        );
        expect(bytes.byteLength, `${file} length`).toBe(
          NEBULA_KTX2_HEADER_BYTES + (side / 4) * (side / 4) * side * 8,
        );
      }
    }
  });

  // The spec's scenario **The blocks are the blocks that were packed**. A block payload
  // has no container, so the digest recorded for the `.dds` file the art arrived in is
  // the digest the `.ktx2` file carries. This is what makes the conversion provable.
  test('holds the blocks that were packed', () => {
    const wanted = fixture.volume_blocks_sha256;
    expect(Object.keys(wanted)).toHaveLength(index.assets.length * 2);
    for (const asset of index.assets) {
      for (const { kind } of KINDS) {
        const name = `${asset.name}-${kind}`;
        const blocks = readFileSync(`${artDir}${name}.ktx2`).subarray(
          NEBULA_KTX2_HEADER_BYTES,
        );
        expect(createHash('sha256').update(blocks).digest('hex'), name).toBe(
          wanted[name],
        );
      }
    }
  });
});

describe('a failed load', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A fetch that answers every request the same way. */
  function stubFetch(answer: () => Response): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(answer())),
    );
  }

  // The nebulae are not part of the first frame, so a failure here is reported and
  // dropped. The typed error is what tells the drop path a nebula load failed.
  test('throws a typed error when the server refuses the index', async () => {
    stubFetch(() => new Response('', { status: 404 }));
    await expect(loadNebulaVolumes()).rejects.toThrow(/did not load/);
    await expect(loadNebulaVolumes()).rejects.toHaveProperty('name', 'NebulaError');
  });

  test('throws a typed error on an index that does not parse', async () => {
    stubFetch(() => new Response('not json'));
    await expect(loadNebulaVolumes()).rejects.toThrow(/did not parse/);
  });

  test('throws a typed error on an index that names no asset', async () => {
    stubFetch(() => new Response('{"assets":[]}'));
    await expect(loadNebulaVolumes()).rejects.toThrow(/names no asset/);
  });

  // The transfer file resolves by position, so a file of the wrong length would slice
  // every table at the wrong offset rather than fail.
  test('refuses a transfer file of the wrong length', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? new Response('{"assets":[{"name":"one"}]}')
            : new Response(new ArrayBuffer(8)),
        );
      }),
    );
    await expect(loadNebulaVolumes()).rejects.toThrow(/transfer file holds/);
  });

  /** Answers the index, the transfer file and then one volume file of `volume`. */
  function stubSet(volume: Uint8Array, density = 8, colour = 4): void {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve(
            new Response(
              `{"assets":[{"name":"barnards-loop","density":{"size":${density}},` +
                `"colour":{"size":${colour}}}]}`,
            ),
          );
        }
        if (call === 2) {
          return Promise.resolve(new Response(new ArrayBuffer(NEBULA_TRANSFER_BYTES)));
        }
        return Promise.resolve(new Response(volume.slice().buffer));
      }),
    );
  }

  test('refuses a volume file that is not a KTX2 file', async () => {
    stubSet(new Uint8Array(512));
    await expect(loadNebulaVolumes()).rejects.toThrow(/not a KTX2 file/);
  });

  // The spec's scenario **A file that disagrees with the index is refused**. The
  // renderer takes every side from the index, so a file of another size would draw at
  // the wrong scale rather than fail.
  test('refuses a volume whose container disagrees with the index', async () => {
    stubSet(
      writeNebulaKtx2({
        format: VK_FORMAT_BC4_UNORM_BLOCK,
        side: 16,
        blocks: new Uint8Array(16 * 4 * 4 * 8),
      }),
    );
    await expect(loadNebulaVolumes()).rejects.toThrow(/not the 8 a side/);
  });

  // The density volume is BC4 and the colour volume BC1, and the index says which is
  // which. A file of the other format would read the wrong channel count.
  test('refuses a volume whose format is not the one its channel count needs', async () => {
    stubSet(
      writeNebulaKtx2({
        format: VK_FORMAT_BC1_RGB_UNORM_BLOCK,
        side: 8,
        blocks: new Uint8Array(8 * 2 * 2 * 8),
      }),
    );
    await expect(loadNebulaVolumes()).rejects.toThrow(/channel count needs/);
  });
});
