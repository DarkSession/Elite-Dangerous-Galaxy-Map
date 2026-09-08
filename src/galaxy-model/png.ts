// A decoder for the one PNG shape the model reads: 8 bits per pixel, greyscale, not
// interlaced. It runs in Node and in a worker, because both give `DecompressionStream`.

/** The error every failure in this module throws. */
export class PngError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PngError';
  }
}

/** The bytes a PNG file starts with. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The colour type of a greyscale image. */
const GREYSCALE = 0;

/** One decoded greyscale image. */
export interface GreyscaleImage {
  readonly width: number;
  readonly height: number;
  /** One byte per pixel, the first row first and `x` fastest. */
  readonly data: Uint8Array;
}

/** Inflates a zlib stream. */
async function inflate(source: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const input = new ReadableStream<BufferSource>({
    start(controller): void {
      controller.enqueue(source);
      controller.close();
    },
  });
  const reader = input.pipeThrough(new DecompressionStream('deflate')).getReader();
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

/** The Paeth predictor of the PNG specification. */
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  if (toUp <= toUpLeft) return up;
  return upLeft;
}

/** Removes the row filters. One byte per pixel, so the left neighbour is one back. */
function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width + 1;
  if (raw.length < stride * height) {
    throw new PngError(
      `The image data holds ${raw.length} bytes. It needs ${stride * height}.`,
    );
  }
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * stride] as number;
    const inputRow = row * stride + 1;
    const outputRow = row * width;
    const previousRow = outputRow - width;
    for (let column = 0; column < width; column += 1) {
      const value = raw[inputRow + column] as number;
      const left = column > 0 ? (data[outputRow + column - 1] as number) : 0;
      const up = row > 0 ? (data[previousRow + column] as number) : 0;
      const upLeft =
        row > 0 && column > 0 ? (data[previousRow + column - 1] as number) : 0;
      let result: number;
      switch (filter) {
        case 0:
          result = value;
          break;
        case 1:
          result = value + left;
          break;
        case 2:
          result = value + up;
          break;
        case 3:
          result = value + ((left + up) >> 1);
          break;
        case 4:
          result = value + paeth(left, up, upLeft);
          break;
        default:
          throw new PngError(
            `Row ${row} uses filter type ${filter}. PNG has the types 0 to 4.`,
          );
      }
      data[outputRow + column] = result & 0xff;
    }
  }
  return data;
}

/** The four-letter type of the chunk that starts at an offset. */
function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset + 4] as number,
    bytes[offset + 5] as number,
    bytes[offset + 6] as number,
    bytes[offset + 7] as number,
  );
}

/** The fields of the IHDR chunk this decoder reads. */
interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colour: number;
  readonly compression: number;
  readonly filter: number;
  readonly interlace: number;
}

/** Checks the signature and reads the IHDR chunk, which PNG puts first. */
function readHeader(bytes: Uint8Array): PngHeader {
  if (bytes.length < 8) {
    throw new PngError(`The file holds ${bytes.length} bytes. A PNG needs more.`);
  }
  for (let index = 0; index < SIGNATURE.length; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) {
      throw new PngError('The file does not start with the PNG signature.');
    }
  }
  if (bytes.length < 8 + 12 + 13 || chunkType(bytes, 8) !== 'IHDR') {
    throw new PngError('The file holds no IHDR chunk at its start.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) {
    throw new PngError(`The IHDR chunk holds ${view.getUint32(8)} bytes. It needs 13.`);
  }
  const body = 16;
  return {
    width: view.getUint32(body),
    height: view.getUint32(body + 4),
    depth: bytes[body + 8] as number,
    colour: bytes[body + 9] as number,
    compression: bytes[body + 10] as number,
    filter: bytes[body + 11] as number,
    interlace: bytes[body + 12] as number,
  };
}

/** Reads the pixel size from the IHDR chunk, without decoding the image. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  const header = readHeader(bytes);
  return { width: header.width, height: header.height };
}

/**
 * Decodes an 8-bit greyscale PNG that is not interlaced. It throws `PngError` for
 * every other shape.
 */
export async function decodeGreyscalePng(bytes: Uint8Array): Promise<GreyscaleImage> {
  const header = readHeader(bytes);
  if (header.depth !== 8 || header.colour !== GREYSCALE) {
    throw new PngError(
      `The image is ${header.depth} bits and colour type ${header.colour}. ` +
        'This decoder reads 8-bit greyscale only.',
    );
  }
  if (header.compression !== 0 || header.filter !== 0) {
    throw new PngError(
      `The image uses compression ${header.compression} and filter method ` +
        `${header.filter}. This decoder reads method 0 only.`,
    );
  }
  if (header.interlace !== 0) {
    throw new PngError('The image is interlaced. This decoder reads plain rows.');
  }
  if (header.width < 1 || header.height < 1) {
    throw new PngError(`The image is ${header.width} by ${header.height} pixels.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let dataLength = 0;
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = chunkType(bytes, offset);
    const body = offset + 8;
    if (body + length + 4 > bytes.length) {
      throw new PngError(`The chunk ${type} runs past the end of the file.`);
    }
    if (type === 'IDAT') {
      const part = bytes.subarray(body, body + length);
      parts.push(part);
      dataLength += part.length;
    } else if (type === 'IEND') {
      break;
    }
    offset = body + length + 4;
  }

  if (parts.length === 0) {
    throw new PngError('The file holds no IDAT chunk.');
  }

  const compressed = new Uint8Array(dataLength);
  let written = 0;
  for (const part of parts) {
    compressed.set(part, written);
    written += part.length;
  }

  const raw = await inflate(compressed);
  return {
    width: header.width,
    height: header.height,
    data: unfilter(raw, header.width, header.height),
  };
}
