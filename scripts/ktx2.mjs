// Writes the KTX2 container the nebula volumes ship in.
//
// The container holds one array of 2D slices and nothing else: one level, one face, no
// supercompression and no mip chain. A BC1 or BC4 block covers 4 by 4 by 1 texels, so a
// volume in either format is already stored slice by slice and this writer moves no
// payload byte. It only puts a new header in front of the blocks.
//
// The header is exactly 208 bytes, which is what fixes the on-disk total of the art:
//
//   12  the KTX2 identifier
//   68  the fixed header fields
//   24  the level index, one entry
//   44  the basic descriptor block of a single-sample compressed format
//   56  the key/value block, one pinned `KTXwriter` entry
//    4  padding, because a BC1 or BC4 level must start at a multiple of 8
//
// The writer string is pinned because its length is the only free number in the header.
// A different string would move the on-disk total, which the spec states.
//
// This is a build-time writer and not application code, so it sits in `scripts/` and no
// build carries it. `src/render/nebula-volumes.ts` holds the reader, which the map needs
// at run time.

/** Bytes a nebula `.ktx2` header takes before the block payload. */
export const NEBULA_KTX2_HEADER_BYTES = 208;

/** The `vkFormat` of a colour volume, which is three channels. */
export const VK_FORMAT_BC1_RGB_UNORM_BLOCK = 131;

/** The `vkFormat` of a density volume, which is one channel. */
export const VK_FORMAT_BC4_UNORM_BLOCK = 139;

/** The `KTXwriter` value every file of the set carries. */
export const NEBULA_KTX2_WRITER = 'elite-dangerous-galaxy-map dds-to-ktx2';

/** The 12 bytes every KTX2 file starts with. */
export const KTX2_IDENTIFIER = Uint8Array.of(
  0xab,
  0x4b,
  0x54,
  0x58,
  0x20,
  0x32,
  0x30,
  0xbb,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
);

/** Where the basic descriptor block starts, and how long it is. */
const DFD_OFFSET = 104;
const DFD_BYTES = 44;

/** Where the key/value block starts, and how long it is. */
const KVD_OFFSET = 148;
const KVD_BYTES = 56;

/** The Khronos data format colour model of each block format. */
const COLOUR_MODEL = {
  [VK_FORMAT_BC1_RGB_UNORM_BLOCK]: 128,
  [VK_FORMAT_BC4_UNORM_BLOCK]: 131,
};

/**
 * Writes the basic descriptor block of one single-sample compressed format. The block
 * describes a texel block of 4 by 4 by 1 texels of 8 bytes, which is what BC1 and BC4
 * both hold.
 */
function writeDescriptor(view, at, format) {
  // The total size of the descriptor, then the one basic block inside it.
  view.setUint32(at, DFD_BYTES, true);
  // Vendor 0 and descriptor type 0: the basic block of the Khronos data format.
  view.setUint32(at + 4, 0, true);
  // Version 2 in the low half, the block size of 40 in the high half.
  view.setUint32(at + 8, 2 | (40 << 16), true);
  // The colour model, BT.709 primaries, a linear transfer function and no flags.
  view.setUint8(at + 12, COLOUR_MODEL[format]);
  view.setUint8(at + 13, 1);
  view.setUint8(at + 14, 1);
  view.setUint8(at + 15, 0);
  // The texel block runs 4 by 4 by 1 by 1, each dimension one less than its size.
  view.setUint8(at + 16, 3);
  view.setUint8(at + 17, 3);
  view.setUint8(at + 18, 0);
  view.setUint8(at + 19, 0);
  // Eight bytes in the first plane and nothing in the other seven.
  view.setUint8(at + 20, 8);
  // One sample of the whole 64-bit block, channel 0, with the full unsigned range.
  view.setUint16(at + 28, 0, true);
  view.setUint8(at + 30, 63);
  view.setUint8(at + 31, 0);
  view.setUint32(at + 36, 0, true);
  view.setUint32(at + 40, 0xffffffff, true);
}

/** Writes the one pinned `KTXwriter` entry of the key/value block. */
function writeKeyValue(bytes, view, at) {
  const key = new TextEncoder().encode('KTXwriter\0');
  const value = new TextEncoder().encode(`${NEBULA_KTX2_WRITER}\0`);
  view.setUint32(at, key.byteLength + value.byteLength, true);
  bytes.set(key, at + 4);
  bytes.set(value, at + 4 + key.byteLength);
}

/**
 * Wraps one volume's blocks in a KTX2 container. `format` is the `vkFormat`, `side` is
 * the volume's side in texels, which is its width, its height and its layer count, and
 * `blocks` is the payload the container carries unchanged.
 */
export function writeNebulaKtx2({ format, side, blocks }) {
  if (
    format !== VK_FORMAT_BC1_RGB_UNORM_BLOCK &&
    format !== VK_FORMAT_BC4_UNORM_BLOCK
  ) {
    throw new Error(`A nebula volume cannot hold vkFormat ${format}.`);
  }
  if (!Number.isInteger(side) || side < 4 || side % 4 !== 0) {
    throw new Error(`A nebula volume cannot be ${side} texels a side.`);
  }
  const needed = (side / 4) * (side / 4) * side * 8;
  if (blocks.byteLength !== needed) {
    throw new Error(
      `A side of ${side} needs ${needed} bytes of blocks, not ${blocks.byteLength}.`,
    );
  }

  const out = new Uint8Array(NEBULA_KTX2_HEADER_BYTES + blocks.byteLength);
  const view = new DataView(out.buffer);
  out.set(KTX2_IDENTIFIER, 0);

  view.setUint32(12, format, true);
  // A block format takes a type size of 1.
  view.setUint32(16, 1, true);
  view.setUint32(20, side, true);
  view.setUint32(24, side, true);
  // A 2D array is not a 3D texture, so the depth is 0 and the layers carry the third
  // axis.
  view.setUint32(28, 0, true);
  view.setUint32(32, side, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, 0, true);
  view.setUint32(48, DFD_OFFSET, true);
  view.setUint32(52, DFD_BYTES, true);
  view.setUint32(56, KVD_OFFSET, true);
  view.setUint32(60, KVD_BYTES, true);
  // No supercompression, so the global data is empty.
  view.setBigUint64(64, 0n, true);
  view.setBigUint64(72, 0n, true);

  // The one level index entry: where the blocks start, how long they are, and how long
  // they are once decompressed, which is the same number with no supercompression.
  view.setBigUint64(80, BigInt(NEBULA_KTX2_HEADER_BYTES), true);
  view.setBigUint64(88, BigInt(blocks.byteLength), true);
  view.setBigUint64(96, BigInt(blocks.byteLength), true);

  writeDescriptor(view, DFD_OFFSET, format);
  writeKeyValue(out, view, KVD_OFFSET);
  out.set(blocks, NEBULA_KTX2_HEADER_BYTES);
  return out;
}
