// Holds the KTX2 writer and the KTX2 reader together.
//
// `scripts/dds-to-ktx2.mjs` writes the containers the art ships in, through
// `scripts/ktx2.mjs`, and `src/render/nebula-volumes.ts` reads them at run time. The two
// carry their own copies of the header layout: the writer is a build-time script and the
// reader ships in the library, so neither imports the other.
//
// This test is what stops them drifting. It runs the writer over the committed blocks of
// every one of the 33 assets and reads the result back with the reader, so a header the
// writer moved and the reader did not fails here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  NEBULA_KTX2_BC1,
  NEBULA_KTX2_BC4,
  NEBULA_KTX2_HEADER_BYTES,
  readNebulaKtx2,
} from '../packages/galaxy-map/src/render/nebula-volumes';
import type { NebulaVolumeEntry } from '../packages/galaxy-map/src/render/nebula-volumes';
import {
  NEBULA_KTX2_HEADER_BYTES as WRITER_HEADER_BYTES,
  NEBULA_KTX2_WRITER,
  VK_FORMAT_BC1_RGB_UNORM_BLOCK,
  VK_FORMAT_BC4_UNORM_BLOCK,
  writeNebulaKtx2,
} from '../scripts/ktx2.mjs';

const artDir = fileURLToPath(
  new URL('../packages/galaxy-map/src/render/nebula-art/', import.meta.url),
);
const index = JSON.parse(readFileSync(`${artDir}nebula-volumes.json`, 'utf8')) as {
  assets: NebulaVolumeEntry[];
};

/** The two volumes of one asset, and the `vkFormat` each one takes. */
const VOLUMES = [
  { kind: 'density', format: VK_FORMAT_BC4_UNORM_BLOCK },
  { kind: 'colour', format: VK_FORMAT_BC1_RGB_UNORM_BLOCK },
] as const;

/** One small file the refusal tests take apart. */
function sample(): Uint8Array {
  return writeNebulaKtx2({
    format: VK_FORMAT_BC4_UNORM_BLOCK,
    side: 4,
    blocks: new Uint8Array(32).fill(7),
  });
}

/** The same file with one 32-bit header field changed. */
function patched(at: number, value: number): Uint8Array {
  const bytes = sample();
  new DataView(bytes.buffer).setUint32(at, value, true);
  return bytes;
}

describe('the KTX2 container', () => {
  test('the writer and the reader hold the same header length', () => {
    expect(WRITER_HEADER_BYTES).toBe(NEBULA_KTX2_HEADER_BYTES);
    expect(VK_FORMAT_BC4_UNORM_BLOCK).toBe(NEBULA_KTX2_BC4);
    expect(VK_FORMAT_BC1_RGB_UNORM_BLOCK).toBe(NEBULA_KTX2_BC1);
  });

  // The writer string is the only free number in the header, so its length is what
  // fixes the on-disk total the spec states.
  test('pins the writer string, so the header is always 208 bytes', () => {
    expect(NEBULA_KTX2_WRITER).toBe('elite-dangerous-galaxy-map dds-to-ktx2');
    expect(new TextEncoder().encode(`${NEBULA_KTX2_WRITER}\0`)).toHaveLength(39);
    const bytes = sample();
    expect(bytes).toHaveLength(NEBULA_KTX2_HEADER_BYTES + 32);
    // The `KTXwriter` entry sits in the key/value block, with its terminating zero, so
    // a general reader takes it as a C string.
    const text = new TextDecoder().decode(bytes.subarray(148, 204));
    expect(text).toContain('KTXwriter');
    expect(text).toContain(NEBULA_KTX2_WRITER);
  });

  test('reads back the file the writer wrote', () => {
    const volume = readNebulaKtx2(sample());
    expect(volume.format).toBe(NEBULA_KTX2_BC4);
    expect(volume.side).toBe(4);
    expect(volume.layers).toBe(4);
    expect(Array.from(volume.blocks)).toEqual(Array.from(new Uint8Array(32).fill(7)));
  });
});

// The reader takes the one shape the writer emits and refuses every other. A file this
// repository did not write is not one it has to read.
describe('a KTX2 file the reader refuses', () => {
  test('one shorter than the header', () => {
    expect(() => readNebulaKtx2(sample().subarray(0, 100))).toThrow(/shorter than/);
  });

  test('one whose identifier is wrong', () => {
    const bytes = sample();
    bytes[0] = 0;
    expect(() => readNebulaKtx2(bytes)).toThrow(/not a KTX2 file/);
  });

  test('one whose vkFormat is neither BC4 nor BC1', () => {
    expect(() => readNebulaKtx2(patched(12, 37))).toThrow(/vkFormat 37/);
  });

  test('one that holds more than one level', () => {
    expect(() => readNebulaKtx2(patched(40, 2))).toThrow(/2 levels/);
  });

  test('one that holds more than one face', () => {
    expect(() => readNebulaKtx2(patched(36, 6))).toThrow(/6 faces/);
  });

  test('one that uses supercompression', () => {
    expect(() => readNebulaKtx2(patched(44, 1))).toThrow(/supercompression scheme 1/);
  });

  test('one that holds no layer', () => {
    expect(() => readNebulaKtx2(patched(32, 0))).toThrow(/no layer/);
  });

  test('one whose slices are not square', () => {
    expect(() => readNebulaKtx2(patched(24, 8))).toThrow(/not square/);
  });

  test('one whose level runs past the end of the file', () => {
    const bytes = sample();
    new DataView(bytes.buffer).setBigUint64(88, 4096n, true);
    expect(() => readNebulaKtx2(bytes)).toThrow(/runs past/);
  });

  test('every refusal carries the typed error', () => {
    const bytes = sample();
    bytes[0] = 0;
    expect(() => readNebulaKtx2(bytes)).toThrow(
      expect.objectContaining({ name: 'NebulaError' }) as Error,
    );
  });
});

// The conversion is provable: the writer moves no payload byte, so the blocks that go in
// are the blocks that come out. It runs over all 66 volumes and not a sample, because
// what it proves is that the art cannot drift through the container change.
//
// The `.dds` set the art arrived in is gone, so the round trip is of each committed
// file against itself: the reader takes its blocks, the writer puts a header back
// around them, and the result has to be the file on disk byte for byte. A writer that
// moved one header byte would fail here, and so would a reader that read the level at
// the wrong offset.
describe('the round trip over the committed art', () => {
  test('gives back the blocks, the side, the layers and the format', () => {
    let checked = 0;
    for (const asset of index.assets) {
      for (const volume of VOLUMES) {
        const side = asset[volume.kind];
        const file = `${asset.name}-${volume.kind}.ktx2`;
        const source = readFileSync(`${artDir}${file}`);
        const read = readNebulaKtx2(source, file);
        expect(read.format, file).toBe(volume.format);
        expect(read.side, file).toBe(side);
        expect(read.layers, file).toBe(side);
        const written = writeNebulaKtx2({
          format: volume.format,
          side,
          blocks: read.blocks,
        });
        expect(written, file).toHaveLength(
          NEBULA_KTX2_HEADER_BYTES + read.blocks.byteLength,
        );
        // `Buffer.compare` and not `toEqual`: both read the same byte-for-byte answer, but
        // `toEqual` walks the 2.77 MB of art one byte at a time and takes 3 seconds, which
        // is over the 5 second default on a two-core pipeline runner. This reads 1.2 ms.
        expect(Buffer.compare(written, source), file).toBe(0);
        checked += 1;
      }
    }
    expect(checked).toBe(66);
  });
});
