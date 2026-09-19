// The nebula volume set: the URLs of the art, its fetch, its block decode and its
// texture upload.
//
// The art lives here and not in `buffers.ts`, because the main entry point reaches
// `buffers.ts` at load. Vite emits an asset from its transform hook, before tree shaking,
// so a build that merely reaches a module naming the art carries the files whatever the
// shaker decides about the code. Only `src/nebulae/` and the nebula pass reach this
// module, so a host that does not ask for the nebulae carries neither the art nor this
// code.
import { NebulaError } from '../scene-data/nebulae';

// `?url&no-inline` and not `?url`: the library build inlines every asset as a data URI
// whatever its size, and the demo build inlines anything under 4,096 bytes, which covers
// the smaller colour volumes. Both would put the whole set in a chunk. The suffix keeps
// every file one the browser fetches when the map starts.
//
// `import: 'default'`: with `eager: true` each entry is a module namespace of
// `{ default: url }` and not a URL.
const assetUrls = import.meta.glob<string>('./nebula-art/*', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});

/** Bytes a DX10 `.dds` header takes before the block payload. */
export const NEBULA_DDS_HEADER_BYTES = 148;

/** How many entries one transfer table holds. */
export const NEBULA_TRANSFER_ENTRIES = 256;

/** Bytes one transfer table takes in the binary transfer file. */
export const NEBULA_TRANSFER_BYTES = NEBULA_TRANSFER_ENTRIES * 4 * 4;

/** One entry of the volume index, which holds what the map reads and nothing else. */
export interface NebulaVolumeEntry {
  readonly name: string;
  readonly density: { readonly size: number };
  readonly colour: { readonly size: number };
  readonly error: {
    readonly per_axis: { readonly x: number; readonly y: number; readonly z: number };
  };
}

/** One decoded asset, ready to upload. */
export interface NebulaVolumeAsset {
  readonly name: string;
  /** The density side in texels, as the index carries it. */
  readonly densitySide: number;
  /** The colour side in texels, as the index carries it. */
  readonly colourSide: number;
  /** One byte a texel, indexed `z * side^2 + y * side + x`. */
  readonly density: Uint8Array;
  /** Four bytes a texel, alpha 255. */
  readonly colour: Uint8Array;
  /** 256 entries of four extinction coefficients the density indexes. */
  readonly transfer: Float32Array;
}

/** The whole decoded set, built once when the art arrives. */
export interface NebulaVolumeSet {
  readonly assets: readonly NebulaVolumeAsset[];
}

/** The 3D textures one asset marches, and the transfer table it reads. */
export interface NebulaVolumeTexture {
  readonly name: string;
  readonly density: WebGLTexture;
  readonly colour: WebGLTexture;
  readonly transfer: WebGLTexture;
  readonly densitySide: number;
  readonly colourSide: number;
}

/** Every uploaded asset, by the index position a record names. */
export interface NebulaVolumeTextures {
  readonly assets: readonly NebulaVolumeTexture[];
  dispose(): void;
}

/**
 * Decodes a `BC4_UNORM` volume to one byte a texel, indexed
 * `z * side^2 + y * side + x`. Both interpolation modes are decoded: `r0 > r1` gives
 * six interpolated levels, and `r0 <= r1` gives four with 0 and 255 at the ends.
 */
export function decodeBC4(blocks: Uint8Array, side: number): Uint8Array {
  const across = side / 4;
  const out = new Uint8Array(side * side * side);
  const levels = new Uint8Array(8);
  let offset = 0;
  for (let z = 0; z < side; z += 1) {
    for (let by = 0; by < across; by += 1) {
      for (let bx = 0; bx < across; bx += 1) {
        const r0 = blocks[offset] as number;
        const r1 = blocks[offset + 1] as number;
        levels[0] = r0;
        levels[1] = r1;
        if (r0 > r1) {
          for (let i = 1; i < 7; i += 1) levels[i + 1] = ((7 - i) * r0 + i * r1) / 7;
        } else {
          for (let i = 1; i < 5; i += 1) levels[i + 1] = ((5 - i) * r0 + i * r1) / 5;
          levels[6] = 0;
          levels[7] = 255;
        }
        // The 16 three-bit indices fill the six bytes after the endpoints. Index 8
        // starts the second three bytes, so no index straddles the halves.
        const low =
          (blocks[offset + 2] as number) |
          ((blocks[offset + 3] as number) << 8) |
          ((blocks[offset + 4] as number) << 16);
        const high =
          (blocks[offset + 5] as number) |
          ((blocks[offset + 6] as number) << 8) |
          ((blocks[offset + 7] as number) << 16);
        offset += 8;
        for (let i = 0; i < 16; i += 1) {
          const bits = i < 8 ? (low >> (3 * i)) & 7 : (high >> (3 * (i - 8))) & 7;
          const x = bx * 4 + (i % 4);
          const y = by * 4 + ((i / 4) | 0);
          out[z * side * side + y * side + x] = levels[bits] as number;
        }
      }
    }
  }
  return out;
}

/**
 * Decodes a `BC1_UNORM` volume to four bytes a texel, alpha 255, ready to upload. Both
 * palette modes are decoded: `c0 > c1` gives two interpolated colours, and `c0 <= c1`
 * gives one and a transparent slot, which this decode writes as black.
 */
export function decodeBC1(blocks: Uint8Array, side: number): Uint8Array {
  const across = side / 4;
  const out = new Uint8Array(side * side * side * 4);
  const palette = new Uint8Array(12);
  let offset = 0;
  for (let z = 0; z < side; z += 1) {
    for (let by = 0; by < across; by += 1) {
      for (let bx = 0; bx < across; bx += 1) {
        const c0 = (blocks[offset] as number) | ((blocks[offset + 1] as number) << 8);
        const c1 =
          (blocks[offset + 2] as number) | ((blocks[offset + 3] as number) << 8);
        const bits =
          ((blocks[offset + 4] as number) |
            ((blocks[offset + 5] as number) << 8) |
            ((blocks[offset + 6] as number) << 16) |
            ((blocks[offset + 7] as number) << 24)) >>>
          0;
        offset += 8;
        const unpack = (colour: number, slot: number): void => {
          palette[slot * 3] = (((colour >> 11) & 31) * 255) / 31;
          palette[slot * 3 + 1] = (((colour >> 5) & 63) * 255) / 63;
          palette[slot * 3 + 2] = ((colour & 31) * 255) / 31;
        };
        unpack(c0, 0);
        unpack(c1, 1);
        for (let channel = 0; channel < 3; channel += 1) {
          const e0 = palette[channel] as number;
          const e1 = palette[3 + channel] as number;
          if (c0 > c1) {
            palette[6 + channel] = (2 * e0 + e1) / 3;
            palette[9 + channel] = (e0 + 2 * e1) / 3;
          } else {
            palette[6 + channel] = (e0 + e1) / 2;
            palette[9 + channel] = 0;
          }
        }
        for (let i = 0; i < 16; i += 1) {
          const slot = (bits >>> (2 * i)) & 3;
          const x = bx * 4 + (i % 4);
          const y = by * 4 + ((i / 4) | 0);
          const at = (z * side * side + y * side + x) * 4;
          out[at] = palette[slot * 3] as number;
          out[at + 1] = palette[slot * 3 + 1] as number;
          out[at + 2] = palette[slot * 3 + 2] as number;
          out[at + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** The URL the build emitted for one file of the art directory. */
export function nebulaAssetUrl(file: string): string {
  const url = assetUrls[`./nebula-art/${file}`];
  if (url === undefined) {
    throw new NebulaError(`The nebula art holds no file named ${file}.`);
  }
  return url;
}

/** How many files the art directory holds: 33 asset pairs, the transfer file, the index. */
export function nebulaAssetUrlCount(): number {
  return Object.keys(assetUrls).length;
}

async function fetchBytes(url: string, what: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new NebulaError(
      `The nebula ${what} did not load: the server answered ${response.status}.`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Reads the block payload of a `.dds` file, and refuses a file that is too short. */
function blocksOf(bytes: Uint8Array, side: number, what: string): Uint8Array {
  // BC1 and BC4 both take 8 bytes for a block of 4 by 4 texels, and a volume is a stack
  // of `side` slices of block grids.
  const needed = (side / 4) * (side / 4) * side * 8;
  if (side < 4 || side % 4 !== 0) {
    throw new NebulaError(`The nebula ${what} is ${side} texels a side.`);
  }
  if (bytes.byteLength < NEBULA_DDS_HEADER_BYTES + needed) {
    throw new NebulaError(
      `The nebula ${what} holds ${bytes.byteLength} bytes, not the ` +
        `${NEBULA_DDS_HEADER_BYTES + needed} a side of ${side} needs.`,
    );
  }
  return bytes.subarray(NEBULA_DDS_HEADER_BYTES, NEBULA_DDS_HEADER_BYTES + needed);
}

/**
 * The name the loader records each asset's decode under. One entry is one asset's two
 * block decodes, which run in one task on the main thread. A browser test reads the
 * entries back: the sum is what the decode costs and the longest is what one frame pays.
 */
export const NEBULA_DECODE_MEASURE = 'nebula-decode';

/** Records one asset's decode, where the browser carries the user timing API. */
function recordDecode(from: number, to: number): void {
  try {
    performance.measure(NEBULA_DECODE_MEASURE, { start: from, end: to });
  } catch {
    // A browser with no user timing, or one that refuses the entry, loses the reading
    // and nothing else. The decode is what matters and it has already run.
  }
}

/**
 * Fetches, decodes and builds the committed volume set. The index names every asset and
 * carries every side, so a repacked set of a different size is a drop-in.
 *
 * The transfer tables arrive as one binary file and resolve by position: the table of
 * the asset at index `n` starts at `n * 4096` bytes.
 *
 * The two block decodes of one asset run in one task, and the loader records each one
 * under `NEBULA_DECODE_MEASURE`. Nothing waits on the set, so a long decode shows as a
 * long frame and in no other way, and the reading is what says whether it is long.
 */
export async function loadNebulaVolumes(): Promise<NebulaVolumeSet> {
  const indexBytes = await fetchBytes(
    nebulaAssetUrl('nebula-volumes.json'),
    'volume index',
  );
  let index: { assets?: NebulaVolumeEntry[] };
  try {
    index = JSON.parse(new TextDecoder().decode(indexBytes)) as typeof index;
  } catch {
    throw new NebulaError('The nebula volume index did not parse.');
  }
  const entries = index.assets;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new NebulaError('The nebula volume index names no asset.');
  }

  const transferBytes = await fetchBytes(
    nebulaAssetUrl('transfer.bin'),
    'transfer file',
  );
  if (transferBytes.byteLength !== entries.length * NEBULA_TRANSFER_BYTES) {
    throw new NebulaError(
      `The nebula transfer file holds ${transferBytes.byteLength} bytes, not the ` +
        `${entries.length * NEBULA_TRANSFER_BYTES} its ${entries.length} assets need.`,
    );
  }

  const assets = await Promise.all(
    entries.map(async (entry, slot): Promise<NebulaVolumeAsset> => {
      const [densityFile, colourFile] = await Promise.all([
        fetchBytes(
          nebulaAssetUrl(`${entry.name}-density.dds`),
          `density ${entry.name}`,
        ),
        fetchBytes(nebulaAssetUrl(`${entry.name}-colour.dds`), `colour ${entry.name}`),
      ]);
      const at = slot * NEBULA_TRANSFER_BYTES;
      const started = performance.now();
      const density = decodeBC4(
        blocksOf(densityFile, entry.density.size, `density ${entry.name}`),
        entry.density.size,
      );
      const colour = decodeBC1(
        blocksOf(colourFile, entry.colour.size, `colour ${entry.name}`),
        entry.colour.size,
      );
      recordDecode(started, performance.now());
      return {
        name: entry.name,
        densitySide: entry.density.size,
        colourSide: entry.colour.size,
        density,
        colour,
        transfer: new Float32Array(
          transferBytes.buffer.slice(
            transferBytes.byteOffset + at,
            transferBytes.byteOffset + at + NEBULA_TRANSFER_BYTES,
          ),
        ),
      };
    }),
  );
  return { assets };
}

function create3D(
  gl: WebGL2RenderingContext,
  format: number,
  layout: number,
  side: number,
  texels: Uint8Array,
): WebGLTexture {
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error('The context gave no texture for a nebula volume.');
  }
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage3D(gl.TEXTURE_3D, 1, format, side, side, side);
  gl.texSubImage3D(
    gl.TEXTURE_3D,
    0,
    0,
    0,
    0,
    side,
    side,
    side,
    layout,
    gl.UNSIGNED_BYTE,
    texels,
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // The march walks out of the box at both ends of every axis, so the edge texel is
  // what a sample past the end must read.
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);
  return texture;
}

/**
 * Uploads the decoded set: one `R8` density volume and one `RGBA8` colour volume per
 * asset, and one `RGBA32F` transfer table of 256 by 1.
 *
 * The blocks decode on the CPU and upload plain, so the context needs none of
 * `WEBGL_compressed_texture_s3tc`, `EXT_texture_compression_rgtc` or
 * `EXT_texture_compression_bptc`, which a WebGL2 context does not guarantee.
 *
 * The transfer table reads with `texelFetch` and `NEAREST`. A `LINEAR` filter on a
 * floating-point texture needs `OES_texture_float_linear`, which WebGL2 does not
 * guarantee either.
 */
export function createNebulaVolumeTextures(
  gl: WebGL2RenderingContext,
  set: NebulaVolumeSet,
): NebulaVolumeTextures {
  // Every texture goes on this list as it is made. A context that runs out part way
  // through 99 of them throws, and the ones already made would leak, because the caller
  // has no handle to free. The `catch` below frees them and re-throws.
  const made: WebGLTexture[] = [];
  const keep = (texture: WebGLTexture): WebGLTexture => {
    made.push(texture);
    return texture;
  };

  const build = (asset: NebulaVolumeAsset): NebulaVolumeTexture => {
    const transfer = gl.createTexture();
    if (transfer === null) {
      throw new Error('The context gave no texture for a nebula transfer table.');
    }
    keep(transfer);
    gl.bindTexture(gl.TEXTURE_2D, transfer);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, NEBULA_TRANSFER_ENTRIES, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      NEBULA_TRANSFER_ENTRIES,
      1,
      gl.RGBA,
      gl.FLOAT,
      asset.transfer,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return {
      name: asset.name,
      densitySide: asset.densitySide,
      colourSide: asset.colourSide,
      density: keep(create3D(gl, gl.R8, gl.RED, asset.densitySide, asset.density)),
      colour: keep(create3D(gl, gl.RGBA8, gl.RGBA, asset.colourSide, asset.colour)),
      transfer,
    };
  };

  let assets: NebulaVolumeTexture[];
  try {
    assets = set.assets.map(build);
  } catch (error) {
    for (const texture of made) gl.deleteTexture(texture);
    throw error;
  }

  return {
    assets,
    dispose(): void {
      for (const asset of assets) {
        gl.deleteTexture(asset.density);
        gl.deleteTexture(asset.colour);
        gl.deleteTexture(asset.transfer);
      }
    },
  };
}
