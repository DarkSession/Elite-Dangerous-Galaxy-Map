// Builds real PNG files for the tests of the decoder and of the detail grid. It holds
// no test itself, so the Vitest include pattern `src/**/*.test.ts` skips it.

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (crcTable[(value ^ byte) & 0xff] as number) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let index = 0; index < 4; index += 1) {
    out[4 + index] = type.charCodeAt(index);
  }
  out.set(body, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

async function deflate(source: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const input = new ReadableStream<BufferSource>({
    start(controller): void {
      controller.enqueue(source);
      controller.close();
    },
  });
  const reader = input.pipeThrough(new CompressionStream('deflate')).getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done === true) break;
    const part = step.value as Uint8Array;
    parts.push(part);
    length += part.length;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  if (toUp <= toUpLeft) return up;
  return upLeft;
}

/** Applies one filter type per row and returns the raw PNG image data. */
function filterRows(
  pixels: number[][],
  filters: number[],
  width: number,
): Uint8Array<ArrayBuffer> {
  const height = pixels.length;
  const raw = new Uint8Array(height * (width + 1));
  for (let row = 0; row < height; row += 1) {
    const filter = filters[row] as number;
    raw[row * (width + 1)] = filter;
    for (let column = 0; column < width; column += 1) {
      const value = (pixels[row] as number[])[column] as number;
      const left = column > 0 ? ((pixels[row] as number[])[column - 1] as number) : 0;
      const up = row > 0 ? ((pixels[row - 1] as number[])[column] as number) : 0;
      const upLeft =
        row > 0 && column > 0
          ? ((pixels[row - 1] as number[])[column - 1] as number)
          : 0;
      let encoded: number;
      switch (filter) {
        case 1:
          encoded = value - left;
          break;
        case 2:
          encoded = value - up;
          break;
        case 3:
          encoded = value - ((left + up) >> 1);
          break;
        case 4:
          encoded = value - paeth(left, up, upLeft);
          break;
        default:
          encoded = value;
      }
      raw[row * (width + 1) + 1 + column] = encoded & 0xff;
    }
  }
  return raw;
}

/** The header fields a test changes to build a file the decoder must reject. */
export interface HeaderOptions {
  depth?: number;
  colour?: number;
  interlace?: number;
}

/** Builds a PNG file from one value per pixel and one filter type per row. */
export async function buildPng(
  pixels: number[][],
  filters: number[],
  options: HeaderOptions = {},
): Promise<Uint8Array> {
  const height = pixels.length;
  const width = (pixels[0] as number[]).length;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = options.depth ?? 8;
  header[9] = options.colour ?? 0;
  header[10] = 0;
  header[11] = 0;
  header[12] = options.interlace ?? 0;

  const data = await deflate(filterRows(pixels, filters, width));
  const parts = [
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', data),
    chunk('IEND', new Uint8Array(0)),
  ];
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const file = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    file.set(part, offset);
    offset += part.length;
  }
  return file;
}
