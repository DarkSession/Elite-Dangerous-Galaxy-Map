// The nebula set: the records the map holds, which of them draw at a view, and in
// what order. This module never imports the renderer, so the records stay a data
// source the drawing layer reads through one plain interface.
//
// `?url&no-inline` and not `?url`: the library build inlines every asset as a data
// URI by default, which would put the whole record set in the entry chunk. The suffix
// keeps it a file the browser fetches when the map starts.
import { smoothStep } from '../math';
import recordsUrl from './nebulae.json?url&no-inline';

/** The error a failed record load throws. */
export class NebulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NebulaError';
  }
}

/**
 * How many numbers one record holds: three coordinates, a radius, an asset index and
 * three rotation angles. A record may hold a name after them.
 */
const NEBULA_RECORD_FIELDS = 8;

/** The largest radius the set holds, in light years. */
export const NEBULA_MAX_RADIUS_LY = 200;

/** The smallest apparent radius that draws, in CSS pixels. */
export const NEBULA_MIN_PIXELS = 1.5;

/**
 * The smallest range, in light years, the apparent size is computed over. The march
 * holds the range at this value, so the selection holds it at the same one and the two
 * agree on the size of a record the camera is inside. 104 records carry a radius under
 * 1 light year, the smallest 0.1, so a camera that flies into one reaches this.
 */
export const NEBULA_MIN_RANGE_LY = 1;

/** The multiple of the size floor at which a record reaches full weight. */
export const NEBULA_FLOOR_FADE_FULL = 2;

/**
 * The share of the covered-area budget at which a record still draws in full. Past it a
 * record fades out, and it reaches 0 exactly where the budget stops keeping records, so
 * no record can enter or leave the frame with weight.
 *
 * The fade reads the **accumulated area** and not the dropped record's size. A count
 * budget could fade on size, because dropping one record moved the cut by one record.
 * An area budget cannot: the sizes at the cut are widely spaced, so one large record
 * entering the frame moves a size-based cut in a jump and takes a whole group of
 * records out at full weight. The accumulated area moves smoothly, because every
 * record's own area does and two records swapping order changes no sum.
 */
export const NEBULA_BUDGET_FADE_START = 0.8;

/** The zoom distance below which the pass still draws in full, in light years. */
export const NEBULA_ZOOM_FAR_FULL = 12000;

/** The zoom distance above which the pass draws nothing, in light years. */
export const NEBULA_ZOOM_FAR_ZERO = 20000;

/**
 * How much of the screen the drawn nebulae may cover, in whole screens.
 *
 * A count is the wrong guard for a marched box: the cost is fill, not records. One
 * record filling the frame is 220 microseconds at 1,920 by 1,080, which is 1.3 percent
 * of a 16.7 millisecond budget, so four screens of cover is about 5 percent.
 *
 * The committed record file reaches 0.042 screens at Sol and a worst of 2.03 screens
 * over every record centre as a camera, so this budget cuts none of it and is a guard
 * for a larger file.
 */
export const NEBULA_COVERED_AREA_BUDGET = 4;

/** One nebula. */
export interface NebulaRecord {
  /** The centre, in game coordinates, in light years. */
  readonly position: readonly [number, number, number];
  /** The radius, in light years. The box draws twice this across. */
  readonly radius: number;
  /** The volume asset this record draws, by its position in the index file. */
  readonly asset: number;
  /**
   * The three angles the art template carries, in radians. The renderer builds the
   * matrix; the set ships the angles as they arrive.
   */
  readonly rotation: readonly [number, number, number];
  /** The name, or null where the record carries none. */
  readonly name: string | null;
}

/** The whole nebula set, built once when the record asset arrives. */
export interface NebulaSet {
  readonly count: number;
  /** Three game coordinates per record, in light years. */
  readonly positions: Float32Array;
  /** One radius per record, in light years. */
  readonly radii: Float32Array;
  /** One volume asset index per record, by position in the index file. */
  readonly assets: Uint8Array;
  /** Three rotation angles per record, in radians. */
  readonly rotations: Float32Array;
  /** One name per record, null where the record carries none. */
  readonly names: readonly (string | null)[];
  /** One record, for a caller that wants the fields by name. */
  record(index: number): NebulaRecord;
}

/**
 * How much of the pass draws at a zoom distance, 0 to 1. It is the pattern
 * `CLOUD_FADE_FAR` already uses in `src/render/cloud-pass.ts`, closed at the far end
 * alone.
 *
 * The far end holds the far view: the default view opens at 60,000 light years, and
 * the size floor alone still admits the largest record there. The nebulae are a
 * close-range and mid-range feature, so the band ends where the arms take over.
 *
 * The near end is open. The nebulae draw at every zoom distance below the far end,
 * because that is where a record is large enough to read as more than a dot. A camera
 * that flies into a nebula sees the volume fill the view, which is what the march is
 * for, so no fade of its own takes the record out of the frame.
 */
export function nebulaZoomWeight(distance: number): number {
  return 1 - smoothStep(NEBULA_ZOOM_FAR_FULL, NEBULA_ZOOM_FAR_ZERO, distance);
}

/**
 * How much of one record draws as its apparent size nears the size floor, 0 to 1. The
 * floor is a hard cut, and a record that crosses it with weight appears and disappears
 * in one frame as the camera moves.
 */
export function nebulaFloorFade(pixels: number): number {
  return smoothStep(
    NEBULA_MIN_PIXELS,
    NEBULA_FLOOR_FADE_FULL * NEBULA_MIN_PIXELS,
    pixels,
  );
}

/**
 * How much of the screen one record covers, in screen areas, at most 1.
 *
 * The cap is the point. `selectNebulae` divides by a range of at least one light year,
 * so a camera at a record's centre gives an apparent radius of about 187,000 CSS pixels
 * at this project's 60 degree field of view, and the disc that implies is about 53,000
 * screen areas. Uncapped, one such record would drop every other one.
 *
 * The figure is a bound over every direction the camera could face, and not a
 * projection: the selection holds no view direction and no projection matrix.
 */
export function nebulaCoveredArea(
  pixels: number,
  view: Pick<NebulaViewInput, 'canvasHeightCss' | 'canvasWidthCss'>,
): number {
  const screen = view.canvasWidthCss * view.canvasHeightCss;
  if (screen <= 0) return 0;
  return Math.min((Math.PI * pixels * pixels) / screen, 1);
}

/**
 * How much of one kept record draws as the budget fills, 0 to 1. `throughArea` is the
 * covered area of every record at least as large as this one, including its own, in
 * screen areas.
 *
 * The budget keeps the largest records that fit, so whether one record is kept is not a
 * property of that record: it moves with everything else the camera holds. A record of
 * a steady size therefore crosses the cut as the camera turns, and without this fade it
 * appears and disappears in one frame. A record reaches the cut at weight 0, because
 * the budget drops it exactly where this reaches 0.
 */
export function nebulaBudgetFade(throughArea: number): number {
  return (
    1 -
    smoothStep(
      NEBULA_BUDGET_FADE_START * NEBULA_COVERED_AREA_BUDGET,
      NEBULA_COVERED_AREA_BUDGET,
      throughArea,
    )
  );
}

/**
 * The focal length that turns a world radius over a range into CSS pixels, for a
 * canvas height and a vertical field of view in degrees.
 */
export function nebulaFocalPixels(
  canvasHeightCss: number,
  fieldOfView: number,
): number {
  return canvasHeightCss / (2 * Math.tan((fieldOfView * Math.PI) / 360));
}

/** What the selection needs to know about the view. */
export interface NebulaViewInput {
  /** The camera, in game coordinates, in light years. */
  readonly camera: readonly [number, number, number];
  /** The zoom distance, in light years. */
  readonly distance: number;
  /** CSS pixels of apparent radius at one light year of radius and range. */
  readonly focalPixels: number;
  /** The canvas height in CSS pixels. The size rules are stated in those. */
  readonly canvasHeightCss: number;
  /**
   * The canvas width in CSS pixels. One screen area is the product of the two, which is
   * what the covered-area budget accumulates against.
   */
  readonly canvasWidthCss: number;
}

/** One nebula the pass draws, as the selection gives it. */
export interface NebulaInstance {
  /** The index of the record in the set. */
  readonly index: number;
  /** The range from the camera to the record's centre, in light years. */
  readonly range: number;
  /** The apparent radius, in CSS pixels. It is not capped. */
  readonly pixels: number;
  /** Every fade of this record, multiplied, 0 to 1. */
  readonly fade: number;
  /**
   * How much of the screen this record covers, in screen areas, at most 1. It is the
   * lesser of the record's disc and one screen, so a record the camera is inside counts
   * as the screen it fills and not as the disc its uncapped radius would give.
   */
  readonly covered: number;
}

/** What one frame's selection gives back. */
export interface NebulaSelection {
  /**
   * How many records passed the size floor, before the budget and the zoom weight.
   * It is reported on its own so a test can hold that the far end of the band, and
   * not the floor, is what keeps the nebulae out of the far view.
   */
  readonly aboveFloor: number;
  /** How much of the screen the kept records cover, in screen areas. */
  readonly coveredArea: number;
  /** The zoom weight of the frame, 0 to 1. */
  readonly weight: number;
  /** The selected records, largest first, which is the order the budget reads. */
  readonly instances: readonly NebulaInstance[];
}

/**
 * Chooses the nebulae one frame draws.
 *
 * The scan reads all 358 records. That is small enough to take an apparent radius for
 * each well inside the frame budget, and a spatial index would be more code than the
 * set is worth.
 *
 * The order is largest first, which is the order the covered-area budget needs. The
 * selection does not order by range: the pass adds the emissions and multiplies the
 * transmittances, so the frame does not read the draw order.
 */
export function selectNebulae(set: NebulaSet, view: NebulaViewInput): NebulaSelection {
  const weight = nebulaZoomWeight(view.distance);
  const camera = view.camera;
  const above: NebulaInstance[] = [];

  for (let index = 0; index < set.count; index += 1) {
    const dx = (set.positions[index * 3] as number) - camera[0];
    const dy = (set.positions[index * 3 + 1] as number) - camera[1];
    const dz = (set.positions[index * 3 + 2] as number) - camera[2];
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (range <= 0) continue;
    const radius = set.radii[index] as number;
    const pixels = (view.focalPixels * radius) / Math.max(range, NEBULA_MIN_RANGE_LY);
    if (pixels < NEBULA_MIN_PIXELS) continue;
    above.push({
      index,
      range,
      pixels,
      fade: nebulaFloorFade(pixels),
      covered: nebulaCoveredArea(pixels, view),
    });
  }

  // A weight of 0 draws nothing, and the count above the floor is still reported.
  if (weight <= 0)
    return { aboveFloor: above.length, coveredArea: 0, weight, instances: [] };

  // Largest first, which is the order the budget reads.
  above.sort((a, b) => b.pixels - a.pixels);
  const kept: NebulaInstance[] = [];
  let coveredArea = 0;
  for (const one of above) {
    const through = coveredArea + one.covered;
    // The scan stops at the budget rather than looking on for a smaller record that
    // would still fit, so everything it drops is smaller than everything it keeps. The
    // record it stops on has reached fade 0, so nothing visible is dropped.
    if (through > NEBULA_COVERED_AREA_BUDGET) break;
    coveredArea = through;
    kept.push({ ...one, fade: one.fade * nebulaBudgetFade(through) });
  }
  return { aboveFloor: above.length, coveredArea, weight, instances: kept };
}

/** Builds the set from the parsed record file. Throws where a field is wrong. */
export function buildNebulaSet(parsed: unknown): NebulaSet {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new NebulaError('The nebula records are not an object.');
  }
  const file = parsed as {
    records?: unknown;
  };
  // The record shape is what identifies the file. It holds no name list and no version
  // string, so the field count and the asset index are the whole of the refusal.
  if (!Array.isArray(file.records)) {
    throw new NebulaError('The nebula records hold no record list.');
  }

  const rows = file.records as unknown[];
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const assets = new Uint8Array(count);
  const rotations = new Float32Array(count * 3);
  const names: (string | null)[] = new Array<string | null>(count);

  for (let index = 0; index < count; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length < NEBULA_RECORD_FIELDS) {
      throw new NebulaError(`Nebula record ${index} holds too few fields.`);
    }
    for (let field = 0; field < 4; field += 1) {
      if (!Number.isFinite(row[field])) {
        throw new NebulaError(
          `Nebula record ${index} holds a value that is not finite.`,
        );
      }
    }
    const radius = row[3] as number;
    if (radius <= 0 || radius > NEBULA_MAX_RADIUS_LY) {
      throw new NebulaError(`Nebula record ${index} holds the radius ${radius}.`);
    }
    const asset = row[4] as number;
    // No upper bound here. The set holds no asset count: a count in this layer would be
    // a second source of truth for the art. A unit test pairs the two committed files.
    //
    // The set stores the index in a `Uint8Array`, so a record naming asset 256 or above
    // wraps and draws another asset's art. `nebula-pass.ts` skips an index the texture
    // list does not hold, and the wrap gets past that guard. Reachable only from a
    // hand-edited or repacked record file, and the implementation review raised it.
    if (!Number.isInteger(asset) || asset < 0) {
      throw new NebulaError(`Nebula record ${index} names the asset ${String(asset)}.`);
    }
    for (let field = 5; field < NEBULA_RECORD_FIELDS; field += 1) {
      if (!Number.isFinite(row[field])) {
        throw new NebulaError(
          `Nebula record ${index} holds a rotation that is not finite.`,
        );
      }
    }
    positions[index * 3] = row[0] as number;
    positions[index * 3 + 1] = row[1] as number;
    positions[index * 3 + 2] = row[2] as number;
    radii[index] = radius;
    assets[index] = asset;
    rotations[index * 3] = row[5] as number;
    rotations[index * 3 + 1] = row[6] as number;
    rotations[index * 3 + 2] = row[7] as number;
    names[index] =
      row.length > NEBULA_RECORD_FIELDS ? (row[NEBULA_RECORD_FIELDS] as string) : null;
  }

  return {
    count,
    positions,
    radii,
    assets,
    rotations,
    names,
    record(index: number): NebulaRecord {
      return {
        position: [
          positions[index * 3] as number,
          positions[index * 3 + 1] as number,
          positions[index * 3 + 2] as number,
        ],
        radius: radii[index] as number,
        asset: assets[index] as number,
        rotation: [
          rotations[index * 3] as number,
          rotations[index * 3 + 1] as number,
          rotations[index * 3 + 2] as number,
        ],
        name: names[index] ?? null,
      };
    },
  };
}

let pending: Promise<NebulaSet> | null = null;

/**
 * Fetches and builds the committed record set. The set builds in one sweep when the
 * asset arrives, and the second call gives back the same object, so no frame pays to
 * build it.
 */
export async function loadNebulaSet(): Promise<NebulaSet> {
  pending ??= (async (): Promise<NebulaSet> => {
    const response = await fetch(recordsUrl);
    if (!response.ok) {
      throw new NebulaError(
        `The nebula records did not load: the server answered ${response.status}.`,
      );
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new NebulaError('The nebula records did not parse.');
    }
    return buildNebulaSet(parsed);
  })().catch((reason: unknown) => {
    // A failed load does not poison the module: a later call may try again.
    pending = null;
    throw reason;
  });
  return pending;
}
