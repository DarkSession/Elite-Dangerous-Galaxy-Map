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

/** One asset as the files carry it, ready to upload. */
export interface NebulaVolumeAsset {
  readonly name: string;
  /** The density side in texels, as the index carries it. */
  readonly densitySide: number;
  /** The colour side in texels, as the index carries it. */
  readonly colourSide: number;
  /** The `BC4_UNORM` blocks of the density volume, slice after slice. */
  readonly density: Uint8Array;
  /** The `BC1_UNORM` blocks of the colour volume, slice after slice. */
  readonly colour: Uint8Array;
  /** 256 entries of four extinction coefficients the density indexes. */
  readonly transfer: Float32Array;
}

/** The whole decoded set, built once when the art arrives. */
export interface NebulaVolumeSet {
  readonly assets: readonly NebulaVolumeAsset[];
}

/** The slice arrays one asset marches, and the transfer table it reads. */
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

/** How many bytes of blocks a volume of this side holds. */
function blockBytes(side: number): number {
  // BC1 and BC4 both take 8 bytes for a block of 4 by 4 by 1 texels, and a volume is a
  // stack of `side` slices of block grids.
  return (side / 4) * (side / 4) * side * 8;
}

/**
 * Reads one volume file and checks it against the index. The index is what the renderer
 * takes every side from, so a file that states another side, another layer count or
 * another payload length is refused rather than drawn at the wrong size.
 */
function volumeBlocksOf(
  bytes: Uint8Array,
  side: number,
  format: number,
  what: string,
): Uint8Array {
  if (side < 4 || side % 4 !== 0) {
    throw new NebulaError(`The nebula ${what} is ${side} texels a side.`);
  }
  const volume = readNebulaKtx2(bytes, what);
  if (volume.format !== format) {
    throw new NebulaError(
      `The nebula ${what} holds vkFormat ${volume.format}, not the ${format} its ` +
        'channel count needs.',
    );
  }
  if (volume.side !== side || volume.layers !== side) {
    throw new NebulaError(
      `The nebula ${what} is ${volume.side} by ${volume.side} by ${volume.layers} ` +
        `texels, not the ${side} a side the index states.`,
    );
  }
  const needed = blockBytes(side);
  if (volume.blocks.byteLength !== needed) {
    throw new NebulaError(
      `The nebula ${what} holds ${volume.blocks.byteLength} bytes of blocks, not the ` +
        `${needed} a side of ${side} needs.`,
    );
  }
  return volume.blocks;
}

/** Bytes a nebula `.ktx2` header takes before the block payload. */
export const NEBULA_KTX2_HEADER_BYTES = 208;

/** The `vkFormat` of a colour volume, which is three channels. */
export const NEBULA_KTX2_BC1 = 131;

/** The `vkFormat` of a density volume, which is one channel. */
export const NEBULA_KTX2_BC4 = 139;

/** The 12 bytes every KTX2 file starts with. */
const KTX2_IDENTIFIER = [
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];

/** What one `.ktx2` file of the set carries. */
export interface NebulaKtx2 {
  /** 139 for a density volume and 131 for a colour one. */
  readonly format: number;
  /** The width and the height of one slice, which are the same number. */
  readonly side: number;
  /** How many slices the array holds, which is the volume's third axis. */
  readonly layers: number;
  /** The block payload, which is the same bytes whichever container holds it. */
  readonly blocks: Uint8Array;
}

/**
 * Reads one `.ktx2` file of the nebula set.
 *
 * This is not a reader for the format at large. It takes the one shape
 * `scripts/ktx2.mjs` writes — one level, one face, no supercompression, a square BC1 or
 * BC4 array — and throws the loader's typed error on anything else. A smaller contract
 * is a stricter one, and the files are ones this repository writes.
 */
export function readNebulaKtx2(bytes: Uint8Array, what = 'volume'): NebulaKtx2 {
  if (bytes.byteLength < NEBULA_KTX2_HEADER_BYTES) {
    throw new NebulaError(
      `The nebula ${what} holds ${bytes.byteLength} bytes, which is shorter than its ` +
        `${NEBULA_KTX2_HEADER_BYTES}-byte header.`,
    );
  }
  for (let at = 0; at < KTX2_IDENTIFIER.length; at += 1) {
    if (bytes[at] !== KTX2_IDENTIFIER[at]) {
      throw new NebulaError(`The nebula ${what} is not a KTX2 file.`);
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint32(12, true);
  const width = view.getUint32(20, true);
  const height = view.getUint32(24, true);
  const layers = view.getUint32(32, true);
  const faces = view.getUint32(36, true);
  const levels = view.getUint32(40, true);
  const supercompression = view.getUint32(44, true);
  if (format !== NEBULA_KTX2_BC1 && format !== NEBULA_KTX2_BC4) {
    throw new NebulaError(`The nebula ${what} holds vkFormat ${format}.`);
  }
  if (levels !== 1) {
    throw new NebulaError(`The nebula ${what} holds ${levels} levels, not 1.`);
  }
  if (faces !== 1) {
    throw new NebulaError(`The nebula ${what} holds ${faces} faces, not 1.`);
  }
  if (supercompression !== 0) {
    throw new NebulaError(
      `The nebula ${what} uses supercompression scheme ${supercompression}.`,
    );
  }
  if (layers === 0) {
    throw new NebulaError(`The nebula ${what} holds no layer.`);
  }
  if (width !== height) {
    throw new NebulaError(
      `The nebula ${what} is ${width} by ${height} texels, which is not square.`,
    );
  }
  // The one level index entry sits after the fixed header: a byte offset, a byte length
  // and an uncompressed byte length, each of 8 bytes.
  const offset = Number(view.getBigUint64(80, true));
  const length = Number(view.getBigUint64(88, true));
  if (offset + length > bytes.byteLength) {
    throw new NebulaError(
      `The nebula ${what} states a level of ${length} bytes at ${offset}, which runs ` +
        `past its ${bytes.byteLength} bytes.`,
    );
  }
  return {
    format,
    side: width,
    layers,
    blocks: bytes.subarray(offset, offset + length),
  };
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
 * Fetches and builds the committed volume set. The index names every asset and carries
 * every side, so a repacked set of a different size is a drop-in.
 *
 * The loader does no block decode. It reads each `.ktx2` container, checks the shape it
 * states against the index, and keeps the block payload as it is. The upload decides
 * whether those blocks go to the card unchanged or through the CPU decode, because that
 * choice is the context's and the loader has no context.
 *
 * The transfer tables arrive as one binary file and resolve by position: the table of
 * the asset at index `n` starts at `n * 4096` bytes.
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
          nebulaAssetUrl(`${entry.name}-density.ktx2`),
          `density ${entry.name}`,
        ),
        fetchBytes(nebulaAssetUrl(`${entry.name}-colour.ktx2`), `colour ${entry.name}`),
      ]);
      const at = slot * NEBULA_TRANSFER_BYTES;
      return {
        name: entry.name,
        densitySide: entry.density.size,
        colourSide: entry.colour.size,
        density: volumeBlocksOf(
          densityFile,
          entry.density.size,
          NEBULA_KTX2_BC4,
          `density ${entry.name}`,
        ),
        colour: volumeBlocksOf(
          colourFile,
          entry.colour.size,
          NEBULA_KTX2_BC1,
          `colour ${entry.name}`,
        ),
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

/** The two compressed formats the fast path uploads, where the context carries both. */
interface BlockFormats {
  /** `COMPRESSED_RED_RGTC1_EXT`, which carries the density. */
  readonly density: number;
  /** `COMPRESSED_RGB_S3TC_DXT1_EXT`, which carries the colour. */
  readonly colour: number;
}

/**
 * The compressed formats of this context, or `null` where it carries fewer than both.
 *
 * rgtc carries the density and s3tc the colour, and the fast path needs both. With one
 * and not the other every volume decodes: mixing them per volume would work, but it
 * makes four states to test instead of two, for a combination no desktop driver has.
 */
export function nebulaBlockFormats(gl: WebGL2RenderingContext): BlockFormats | null {
  const rgtc = gl.getExtension('EXT_texture_compression_rgtc') as {
    COMPRESSED_RED_RGTC1_EXT: number;
  } | null;
  const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc') as {
    COMPRESSED_RGB_S3TC_DXT1_EXT: number;
  } | null;
  if (rgtc === null || s3tc === null) return null;
  return {
    density: rgtc.COMPRESSED_RED_RGTC1_EXT,
    colour: s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT,
  };
}

/** What one volume uploads: the blocks as they are, or the texels the decode gave. */
type VolumeSource =
  | { readonly blocks: Uint8Array }
  | { readonly texels: Uint8Array; readonly layout: number };

/**
 * Makes one `TEXTURE_2D_ARRAY` of `side` layers of `side` by `side`.
 *
 * WebGL exposes no compressed format for `TEXTURE_3D`, and a BC1 or BC4 block covers
 * 4 by 4 by **1** texels, so a volume in either format is already a stack of slices.
 * The array target is what lets the blocks reach the card unchanged, and both paths
 * take it, so the march reads one sampler type and the renderer compiles one program.
 */
function createArray(
  gl: WebGL2RenderingContext,
  format: number,
  side: number,
  source: VolumeSource,
): WebGLTexture {
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error('The context gave no texture for a nebula volume.');
  }
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, format, side, side, side);
  if ('blocks' in source) {
    // Every layer in one call. The payload is the slices in the order the array holds
    // them, which is the order the file already carries.
    gl.compressedTexSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      0,
      side,
      side,
      side,
      format,
      source.blocks,
    );
  } else {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      0,
      side,
      side,
      side,
      source.layout,
      gl.UNSIGNED_BYTE,
      source.texels,
    );
  }
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // The march walks out of the box at both ends of every axis, so the edge texel is
  // what a sample past the end must read. The layer axis carries no wrap mode: the
  // shader picks the layer with an integer coordinate and clamps it itself.
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return texture;
}

/**
 * Uploads the set: one density array and one colour array per asset, and one `RGBA32F`
 * transfer table of 256 by 1. Every volume goes to a `TEXTURE_2D_ARRAY`.
 *
 * Where the context carries both `EXT_texture_compression_rgtc` and
 * `WEBGL_compressed_texture_s3tc`, the blocks reach the card unchanged and the load
 * does no decode at all. Otherwise the blocks decode on the CPU and upload as plain
 * `R8` and `RGBA8`, so the map asks for no compressed-texture extension, which a WebGL2
 * context does not guarantee.
 *
 * On the decoding path the upload records each asset's two decodes under
 * `NEBULA_DECODE_MEASURE`. A browser test counts those entries: 33 on the decoding path
 * and none on the block path.
 *
 * **Every one of those 33 decodes runs inside this one synchronous call.** Before the
 * volumes became slice arrays the decode sat in `loadNebulaVolumes`, inside a per-asset
 * `async` callback, so each asset was a task of its own and the worst task was 2.3 ms.
 * It cannot sit there any more: the choice between the two paths needs a context, and
 * `NebulaSource.loadVolumes` takes none. Splitting the decode across tasks again needs
 * either a context parameter on `loadVolumes` or a `createDraw` that finishes after it
 * returns, and both are changes to the source interface a host passes.
 *
 * The cost of that is one long task on the fallback path, at load, after the first
 * frame. `e2e/nebula-cost.spec.ts` reads it under `the fallback decode is one task`: it
 * runs 14.2 to 19.2 ms on the development card, against a 16.7 ms frame budget and a
 * worst single asset of 2.9 ms. Nothing waits on the set, so it shows as one long frame
 * and in no other way, but it is the normal path on a GPU that carries ETC or ASTC
 * rather than S3TC and RGTC, where a slower CPU makes it worse.
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

  const blockFormats = nebulaBlockFormats(gl);

  /**
   * What one volume uploads, and in which format: the blocks as they are where the
   * context takes them, and the texels the CPU decode gave where it does not.
   *
   * The decode happens here and the upload happens after it, so the `nebula-decode`
   * mark covers the decode alone and no part of `texStorage3D` or `texSubImage3D`.
   */
  const sourceOf = (
    kind: 'density' | 'colour',
    side: number,
    blocks: Uint8Array,
  ): { readonly format: number; readonly source: VolumeSource } => {
    if (blockFormats !== null) {
      if (side < 4 || side % 4 !== 0) {
        throw new Error(`A nebula volume of ${side} texels a side holds no blocks.`);
      }
      return { format: blockFormats[kind], source: { blocks } };
    }
    return kind === 'density'
      ? {
          format: gl.R8,
          source: { texels: decodeBC4(blocks, side), layout: gl.RED },
        }
      : {
          format: gl.RGBA8,
          source: { texels: decodeBC1(blocks, side), layout: gl.RGBA },
        };
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
    const started = performance.now();
    const densityFrom = sourceOf('density', asset.densitySide, asset.density);
    const colourFrom = sourceOf('colour', asset.colourSide, asset.colour);
    if (blockFormats === null) recordDecode(started, performance.now());
    const density = keep(
      createArray(gl, densityFrom.format, asset.densitySide, densityFrom.source),
    );
    const colour = keep(
      createArray(gl, colourFrom.format, asset.colourSide, colourFrom.source),
    );
    return {
      name: asset.name,
      densitySide: asset.densitySide,
      colourSide: asset.colourSide,
      density,
      colour,
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
