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
  NEBULA_DDS_HEADER_BYTES,
  NEBULA_TRANSFER_BYTES,
  NEBULA_TRANSFER_ENTRIES,
} from './nebula-volumes';
import type { NebulaVolumeEntry, NebulaVolumeSet } from './nebula-volumes';

const artDir = fileURLToPath(new URL('./nebula-art/', import.meta.url));
const index = JSON.parse(readFileSync(`${artDir}nebula-volumes.json`, 'utf8')) as {
  assets: NebulaVolumeEntry[];
};

/** One call the upload made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records its calls and gives every constant its own number. */
/**
 * A context that answers every call. `textureLimit` makes `createTexture` give `null`
 * from that call on, which is what a context out of memory does.
 */
function fakeContext(textureLimit = Number.POSITIVE_INFINITY): {
  gl: WebGL2RenderingContext;
  of(name: string): Call[];
} {
  const calls: Call[] = [];
  let textures = 0;
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_state, key): unknown {
      if (typeof key !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        const held = constants.get(key);
        if (held !== undefined) return held;
        const next = constants.size + 1;
        constants.set(key, next);
        return next;
      }
      return (...args: unknown[]): unknown => {
        calls.push({ name: key, args });
        if (key === 'createTexture') {
          textures += 1;
          return textures > textureLimit ? null : { name: key, at: textures };
        }
        return key.startsWith('create') ? { name: key } : null;
      };
    },
  };
  return {
    gl: new Proxy(state, handler) as unknown as WebGL2RenderingContext,
    of: (name) => calls.filter((call) => call.name === name),
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
      expect(nebulaAssetUrl(`${asset.name}-density.dds`)).toContain(asset.name);
      expect(nebulaAssetUrl(`${asset.name}-colour.dds`)).toContain(asset.name);
    }
    expect(nebulaAssetUrl('transfer.bin')).toContain('transfer');
    expect(nebulaAssetUrl('nebula-volumes.json')).toContain('nebula-volumes');
  });

  test('refuse a file the directory does not hold', () => {
    expect(() => nebulaAssetUrl('no-such-asset-density.dds')).toThrow();
  });
});

describe('the upload', () => {
  /** A set of one asset whose two volumes are different sizes. */
  function oneAsset(densitySide: number, colourSide: number): NebulaVolumeSet {
    return {
      assets: [
        {
          name: 'one',
          densitySide,
          colourSide,
          density: new Uint8Array(densitySide ** 3),
          colour: new Uint8Array(colourSide ** 3 * 4),
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

  // The march walks out of the box at both ends of every axis.
  test('clamps every axis to the edge', () => {
    const context = fakeContext();
    const gl = context.gl;
    createNebulaVolumeTextures(gl, oneAsset(8, 4));
    const wraps = context
      .of('texParameteri')
      .filter((call) => call.args[0] === gl.TEXTURE_3D)
      .filter((call) => call.args[2] === gl.CLAMP_TO_EDGE)
      .map((call) => call.args[1]);
    expect(new Set(wraps)).toEqual(
      new Set([gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]),
    );
  });
});

describe('the committed set', () => {
  const files = [
    ...index.assets.flatMap((asset) => [
      `${asset.name}-density.dds`,
      `${asset.name}-colour.dds`,
    ]),
    'transfer.bin',
    'nebula-volumes.json',
  ];

  // Three different totals, each with a bound of its own. The committed readings are
  // 1.05, 2.77 and 6.03 MiB.
  test('holds its budget over the wire, on disk and in video memory', () => {
    const MIB = 1024 * 1024;
    let wire = 0;
    let disk = 0;
    for (const file of files) {
      const bytes = readFileSync(`${artDir}${file}`);
      disk += bytes.byteLength;
      wire += brotliCompressSync(bytes).byteLength;
    }
    // The density uploads as `R8` and the colour as `RGBA8`, plus one transfer table
    // of 256 entries of four `float32` an asset.
    let decoded = index.assets.length * NEBULA_TRANSFER_BYTES;
    for (const asset of index.assets) {
      decoded += asset.density.size ** 3 + asset.colour.size ** 3 * 4;
    }
    console.log('the volume set', {
      wire: wire / MIB,
      disk: disk / MIB,
      decoded: decoded / MIB,
    });
    expect(wire).toBeLessThanOrEqual(1.3 * MIB);
    expect(disk).toBeLessThanOrEqual(3.0 * MIB);
    expect(decoded).toBeLessThanOrEqual(6.5 * MIB);
  });

  // `AGENTS.md` and `README.md` both state the disk total, because it is what a host
  // pays to take the nebulae. Neither is generated, so a repack would leave them
  // behind without this.
  test('matches the disk total the documentation states', () => {
    let disk = 0;
    for (const file of files) disk += readFileSync(`${artDir}${file}`).byteLength;
    expect(files).toHaveLength(68);
    expect(disk).toBe(2_914_225);
    for (const doc of ['AGENTS.md', 'README.md']) {
      const text = readFileSync(
        fileURLToPath(new URL(`../../${doc}`, import.meta.url)),
        'utf8',
      );
      expect(text, `${doc} states another total`).toContain('2,914,225');
    }
  });

  // Every `.dds` is a DX10 file whose payload is 8 bytes a block of 4 by 4 by 1 texels.
  test('holds a DX10 .dds of the size its side implies', () => {
    for (const asset of index.assets) {
      for (const [kind, side] of [
        ['density', asset.density.size],
        ['colour', asset.colour.size],
      ] as const) {
        const bytes = readFileSync(`${artDir}${asset.name}-${kind}.dds`);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('DDS ');
        expect(bytes.byteLength).toBe(
          NEBULA_DDS_HEADER_BYTES + (side / 4) * (side / 4) * side * 8,
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

  test('refuses a volume file shorter than its side needs', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve(
            new Response(
              '{"assets":[{"name":"barnards-loop","density":{"size":8},' +
                '"colour":{"size":4}}]}',
            ),
          );
        }
        if (call === 2) {
          return Promise.resolve(new Response(new ArrayBuffer(NEBULA_TRANSFER_BYTES)));
        }
        return Promise.resolve(new Response(new ArrayBuffer(16)));
      }),
    );
    await expect(loadNebulaVolumes()).rejects.toThrow(/bytes, not the/);
  });
});
