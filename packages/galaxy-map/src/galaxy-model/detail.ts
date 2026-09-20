// The detail grid, which refines the corrected surface density at 98 light years.
// See `docs/galaxy-density-model.md`.
// `?url&no-inline` and not `?url`: the library build inlines every asset as a data URI
// by default, and this image is about 347 kB. The suffix keeps it a file the browser
// fetches when the map starts. The page build already emits it as a file.
import detailUrl from './galaxy-detail.png?url&no-inline';
import { decodeGreyscalePng, PngError, readPngSize } from './png';
import type { Range } from './types';

/** The side of the detail grid, in cells. */
export const DETAIL_SIZE = 1024;

/** The value that the quantisation step of the grid runs to. */
export const DETAIL_SCALE = 3;

/** The stored value that stands for a detail of 0. */
export const DETAIL_OFFSET = 128;

/** The grid of the logarithm of the ratio of the game's map to the corrected model. */
export interface SurfaceDetailGrid {
  /** The side of the grid, in cells. */
  readonly size: number;
  /** The value that the quantisation step runs to. */
  readonly scale: number;
  /** One byte per cell, `x` fastest, cell (0, 0) at the low corner of the bounds. */
  readonly values: Uint8Array;
}

/** Reads the detail grid from the bytes of the committed PNG. */
export async function decodeDetailGrid(bytes: Uint8Array): Promise<SurfaceDetailGrid> {
  const size = readPngSize(bytes);
  if (size.width !== DETAIL_SIZE || size.height !== DETAIL_SIZE) {
    throw new PngError(
      `The detail grid is ${size.width} by ${size.height} pixels. ` +
        `It needs ${DETAIL_SIZE} by ${DETAIL_SIZE}.`,
    );
  }
  const image = await decodeGreyscalePng(bytes);
  return { size: DETAIL_SIZE, scale: DETAIL_SCALE, values: image.data };
}

/**
 * The bilinear sample of the detail grid at a plane point. The rule is the one of the
 * correction grid: the samples sit at the cell centres, and the edge cells clamp.
 */
export function sampleDetail(
  grid: SurfaceDetailGrid,
  bounds: Range,
  x: number,
  z: number,
): number {
  const size = grid.size;
  const values = grid.values;
  const last = size - 1;

  let fx = ((x - bounds.x[0]) / (bounds.x[1] - bounds.x[0])) * size - 0.5;
  if (fx < 0) fx = 0;
  if (fx > last) fx = last;
  let fz = ((z - bounds.z[0]) / (bounds.z[1] - bounds.z[0])) * size - 0.5;
  if (fz < 0) fz = 0;
  if (fz > last) fz = last;

  const ix = Math.floor(fx);
  const jx = Math.min(ix + 1, last);
  const tx = fx - ix;
  const iz = Math.floor(fz);
  const jz = Math.min(iz + 1, last);
  const tz = fz - iz;

  const lowRow = iz * size;
  const highRow = jz * size;
  const v00 = (values[lowRow + ix] as number) - DETAIL_OFFSET;
  const v10 = (values[lowRow + jx] as number) - DETAIL_OFFSET;
  const v01 = (values[highRow + ix] as number) - DETAIL_OFFSET;
  const v11 = (values[highRow + jx] as number) - DETAIL_OFFSET;
  const low = v00 + (v10 - v00) * tx;
  const high = v01 + (v11 - v01) * tx;
  return ((low + (high - low) * tz) * grid.scale) / 127;
}

/** Fetches and decodes the committed detail grid. */
export async function loadDetailGrid(): Promise<SurfaceDetailGrid> {
  const response = await fetch(detailUrl);
  if (!response.ok) {
    throw new PngError(
      `The detail grid did not load: the server answered ${response.status}.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeDetailGrid(bytes);
}
