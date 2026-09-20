// Rewrites the committed nebula volumes from `.dds` into `.ktx2`.
//
// The block payload does not change. A `.dds` file holds a DX10 header of 148 bytes and
// then the blocks; a `.ktx2` file holds a header of 208 bytes and then the same blocks.
// The script takes the bytes after the `.dds` header and hands them to
// `scripts/ktx2.mjs`, which writes the new header around them.
//
// The side of each volume comes from `nebula-art/nebula-volumes.json` and not from the
// file size, so a file of the wrong length is refused rather than relabelled.
//
// Run it with `node scripts/dds-to-ktx2.mjs`. It writes one `.ktx2` beside each `.dds`
// and prints what it wrote.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEBULA_KTX2_HEADER_BYTES,
  VK_FORMAT_BC1_RGB_UNORM_BLOCK,
  VK_FORMAT_BC4_UNORM_BLOCK,
  writeNebulaKtx2,
} from './ktx2.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artDirectory = join(root, 'src', 'render', 'nebula-art');

/** The header of a `.dds` file with a `DX10` block, in bytes. */
const DDS_HEADER_BYTES = 148;

/** The two volumes of one asset, and the `vkFormat` each one takes. */
const VOLUMES = [
  { kind: 'density', format: VK_FORMAT_BC4_UNORM_BLOCK },
  { kind: 'colour', format: VK_FORMAT_BC1_RGB_UNORM_BLOCK },
];

/** The blocks of one `.dds` file, with its header taken off. */
export function ddsBlocks(file) {
  const bytes = readFileSync(join(artDirectory, file));
  if (bytes.subarray(0, 4).toString('ascii') !== 'DDS ') {
    throw new Error(`${file} is not a .dds file.`);
  }
  return new Uint8Array(
    bytes.buffer,
    bytes.byteOffset + DDS_HEADER_BYTES,
    bytes.length - DDS_HEADER_BYTES,
  );
}

/** The committed index, which carries every side. */
export function readIndex() {
  return JSON.parse(readFileSync(join(artDirectory, 'nebula-volumes.json'), 'utf8'));
}

function main() {
  const index = readIndex();
  let written = 0;
  let bytes = 0;
  for (const entry of index.assets) {
    for (const volume of VOLUMES) {
      const side = entry[volume.kind].size;
      const file = `${entry.name}-${volume.kind}`;
      const blocks = ddsBlocks(`${file}.dds`);
      const out = writeNebulaKtx2({ format: volume.format, side, blocks });
      const needed = NEBULA_KTX2_HEADER_BYTES + blocks.byteLength;
      if (out.byteLength !== needed) {
        throw new Error(
          `${file}.ktx2 came out ${out.byteLength} bytes, not ${needed}.`,
        );
      }
      writeFileSync(join(artDirectory, `${file}.ktx2`), out);
      written += 1;
      bytes += out.byteLength;
    }
  }
  console.log(`wrote ${written} .ktx2 files, ${bytes} bytes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
