// The nebula set: the records the map holds, which of them draw at a view, and in
// what order. This module never imports the renderer, so the records stay a data
// source the drawing layer reads through one plain interface.
//
// `?url&no-inline` and not `?url`: the library build inlines every asset as a data
// URI by default, which would put the whole record set in the entry chunk. The suffix
// keeps it a file the browser fetches when the map starts.
import recordsUrl from './nebulae.json?url&no-inline';

/** The error a failed record load throws. */
export class NebulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NebulaError';
  }
}

/** How many tiles the sprite atlas holds. */
export const NEBULA_TILE_COUNT = 34;

/** The largest radius the set holds, in light years. */
export const NEBULA_MAX_RADIUS_LY = 200;

/** The smallest apparent radius that draws, in CSS pixels. */
export const NEBULA_MIN_PIXELS = 1.5;

/**
 * The share of the canvas height at which a sprite starts to fade on size. Below it a
 * record draws at the size the perspective gives it and at full weight.
 */
export const NEBULA_FADE_START_FRACTION = 0.25;

/**
 * How many nebulae draw in one frame. A count, and not a range threshold, is what
 * bounds the cost: a threshold lets an unbounded number qualify as the camera pulls
 * back through the band.
 *
 * The size floor is the first bound and the tighter one. Over every camera position of
 * the record set, at most 184 records reach the floor on a canvas 1,080 CSS pixels
 * tall, and at most 225 on one of 2,160. This count sits above both, so the budget is a
 * guard for a larger record file and does not cut a frame of this one.
 *
 * The count was 32. That put the cut in the middle of the records the eye can see: the
 * cut sat between 6.5 and 9.6 pixels at one view near the core, and it moved through
 * that band as the camera turned, so a nebula of 8 pixels went out and came back. The
 * records the higher count adds are the small ones, which add 0.005 of a screen of
 * fill in the worst view measured.
 */
export const NEBULA_MAX_DRAWN = 256;

/**
 * The smallest range, in light years, the apparent size is computed over. The vertex
 * shader holds the range at this value, so the selection holds it at the same one and
 * the two agree on the size of a record the camera is inside. 104 records carry a radius
 * under 1 light year, the smallest 0.1, so a camera that flies into one reaches this.
 */
export const NEBULA_MIN_RANGE_LY = 1;

/** The multiple of the size floor at which a record reaches full weight. */
export const NEBULA_FLOOR_FADE_FULL = 2;

/**
 * The multiple of the largest dropped record's size at which a kept record reaches
 * full weight. Both cuts fade, so no record can enter or leave the frame with weight.
 */
export const NEBULA_BUDGET_FADE_FULL = 1.25;

/** The zoom distance below which the pass still draws in full, in light years. */
export const NEBULA_ZOOM_FAR_FULL = 12000;

/** The zoom distance above which the pass draws nothing, in light years. */
export const NEBULA_ZOOM_FAR_ZERO = 20000;

/** The multiple of a record's radius at which the camera-inside fade is full. */
export const NEBULA_INSIDE_FULL = 3;

/** The multiple of a record's radius at which the camera-inside fade is zero. */
export const NEBULA_INSIDE_ZERO = 1;

/**
 * The multiple of the fade start at which the size fade is zero. A sprite at or under
 * the start draws in full, and one that would draw this many times the start draws
 * nothing.
 */
export const NEBULA_SIZE_FADE_ZERO = 3;

/**
 * The share of the canvas height one sprite's drawn radius reaches. It holds the fill
 * cost: without it a nebula the camera is close to lays fragments over the whole
 * target, once for each of the budget's instances. It never shows, because it sits
 * where the size fade already reached 0: a sprite this large draws nothing. A sprite
 * therefore never stops growing while the viewer can still see it.
 */
export const NEBULA_CAP_FRACTION = NEBULA_SIZE_FADE_ZERO * NEBULA_FADE_START_FRACTION;

/** One nebula. */
export interface NebulaRecord {
  /** The centre, in game coordinates, in light years. */
  readonly position: readonly [number, number, number];
  /** The radius, in light years. The sprite draws twice this across. */
  readonly radius: number;
  /** The tile of the sprite atlas this record draws, from 0 to 33. */
  readonly tile: number;
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
  /** One atlas tile index per record. */
  readonly tiles: Uint8Array;
  /** One name per record, null where the record carries none. */
  readonly names: readonly (string | null)[];
  /**
   * The name of each atlas tile, by tile index. Nothing in a frame reads it: the pass
   * reads the index alone. It is the record of which slot of the atlas holds which
   * art, so the atlas can be packed again without moving the art under the indices the
   * records already carry.
   */
  readonly tileNames: readonly string[];
  /** One record, for a caller that wants the fields by name. */
  record(index: number): NebulaRecord;
}

/** The smooth step between two edges, 0 at or below `low` and 1 at or above `high`. */
function smoothStep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
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
 * because that is where a record is large enough to read as more than a dot. What a
 * flat sprite cannot do close up is held by two fades of its own, on the record and
 * not on the zoom: `nebulaInsideFade` and `nebulaSizeFade`.
 */
export function nebulaZoomWeight(distance: number): number {
  return 1 - smoothStep(NEBULA_ZOOM_FAR_FULL, NEBULA_ZOOM_FAR_ZERO, distance);
}

/**
 * How much of one record draws as the camera comes inside it, 0 to 1. A flat sprite
 * cannot stand for a cloud the camera is within, so the record leaves the frame rather
 * than laying a card over it.
 */
export function nebulaInsideFade(range: number, radius: number): number {
  return smoothStep(NEBULA_INSIDE_ZERO * radius, NEBULA_INSIDE_FULL * radius, range);
}

/**
 * How much of one record draws as its sprite grows past a quarter of the canvas
 * height, 0 to 1. A flat card over a large part of the frame reads as a card, so the
 * record thins out as the camera moves toward it rather than standing in front of the
 * view. The sprite keeps the size the perspective gives it the whole way: this fade
 * takes the weight, not the size.
 *
 * It reads the uncapped apparent radius, so it states the rule in what the viewer
 * sees. The camera-inside fade reads the range in record radii, which is a different
 * measure: a record can fill the frame while the camera is still well outside it.
 */
export function nebulaSizeFade(uncapped: number, canvasHeightCss: number): number {
  const start = NEBULA_FADE_START_FRACTION * canvasHeightCss;
  return 1 - smoothStep(start, NEBULA_SIZE_FADE_ZERO * start, uncapped);
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
 * How much of one kept record draws as its apparent size nears the budget's cut, 0 to
 * 1. `cutPixels` is the apparent size of the largest record the budget dropped, or 0
 * when it dropped none.
 *
 * The budget keeps the largest 256, so the cut is not a property of one record: it moves
 * with everything else the camera holds. A record of a steady size therefore crosses it
 * as the camera turns, and without this fade it appears and disappears in one frame.
 * The cut moves smoothly, so a record reaches it at weight 0.
 */
export function nebulaBudgetFade(pixels: number, cutPixels: number): number {
  if (cutPixels <= 0) return 1;
  return smoothStep(cutPixels, NEBULA_BUDGET_FADE_FULL * cutPixels, pixels);
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

/**
 * The radius one sprite draws at, in CSS pixels, from its uncapped apparent radius and
 * the canvas height. The cap and the floor are both stated in CSS pixels, so the pass
 * moving to a target of a different resolution changes neither which nebulae draw nor
 * how large they are. The cap sits where the size fade is already 0, so a sprite the
 * viewer can see is never held back from the size the perspective gives it.
 *
 * The frame does not call this. The cap reaches the GPU as `uMaxRadius`, and the vertex
 * shader clamps there, because the shader already holds the apparent radius. This states
 * the rule the shader follows and a unit test holds it; a pass test holds the uniform.
 */
export function drawnNebulaRadius(uncapped: number, canvasHeightCss: number): number {
  return Math.min(uncapped, NEBULA_CAP_FRACTION * canvasHeightCss);
}

/** What the selection needs to know about the view. */
export interface NebulaViewInput {
  /** The camera, in game coordinates, in light years. */
  readonly camera: readonly [number, number, number];
  /** The zoom distance, in light years. */
  readonly distance: number;
  /** CSS pixels of apparent radius at one light year of radius and range. */
  readonly focalPixels: number;
  /** The canvas height in CSS pixels, which the cap and the size fade read. */
  readonly canvasHeightCss: number;
}

/** One nebula the pass draws, as the selection gives it. */
export interface NebulaInstance {
  /** The index of the record in the set. */
  readonly index: number;
  /** The range from the camera to the record's centre, in light years. */
  readonly range: number;
  /** The uncapped apparent radius, in CSS pixels. */
  readonly pixels: number;
  /** Every fade of this record, multiplied, 0 to 1. */
  readonly fade: number;
}

/** What one frame's selection gives back. */
export interface NebulaSelection {
  /**
   * How many records passed the size floor, before the budget and the zoom weight.
   * It is reported on its own so a test can hold that the far end of the band, and
   * not the floor, is what keeps the nebulae out of the far view.
   */
  readonly aboveFloor: number;
  /** The zoom weight of the frame, 0 to 1. */
  readonly weight: number;
  /** The selected records, furthest from the camera first. */
  readonly instances: readonly NebulaInstance[];
}

/**
 * Chooses the nebulae one frame draws.
 *
 * The scan reads all 358 records. That is small enough to take an apparent radius for
 * each well inside the frame budget, and a spatial index would be more code than the
 * set is worth.
 *
 * The order is furthest first, because the pass composites with source-over, which
 * depends on the draw order.
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
    const fade =
      nebulaInsideFade(range, radius) *
      nebulaSizeFade(pixels, view.canvasHeightCss) *
      nebulaFloorFade(pixels);
    above.push({ index, range, pixels, fade });
  }

  // A weight of 0 draws nothing, and the count above the floor is still reported.
  if (weight <= 0) return { aboveFloor: above.length, weight, instances: [] };

  // Largest first for the budget, then furthest first for the blend. A record at fade 0
  // sorts by its size like any other and takes a slot. It costs no fill, because the
  // shader collapses its quad, and the floor lets at most 184 records through against a
  // budget of 256, so it displaces nothing this record file holds.
  above.sort((a, b) => b.pixels - a.pixels);
  // The largest record the budget drops states where the cut is this frame.
  const cutPixels = above[NEBULA_MAX_DRAWN]?.pixels ?? 0;
  const kept = above.slice(0, NEBULA_MAX_DRAWN).map((one) => ({
    ...one,
    fade: one.fade * nebulaBudgetFade(one.pixels, cutPixels),
  }));
  kept.sort((a, b) => b.range - a.range);
  return { aboveFloor: above.length, weight, instances: kept };
}

/** Builds the set from the parsed record file. Throws where a field is wrong. */
export function buildNebulaSet(parsed: unknown): NebulaSet {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new NebulaError('The nebula records are not an object.');
  }
  const file = parsed as {
    tiles?: unknown;
    records?: unknown;
  };
  // The tile count and the record fields are what identify the file. A wrong file
  // fails one of them, so the set needs no version string of its own.
  if (!Array.isArray(file.tiles) || file.tiles.length !== NEBULA_TILE_COUNT) {
    throw new NebulaError(
      `The nebula records name ${Array.isArray(file.tiles) ? file.tiles.length : 0} ` +
        `tiles. They need ${NEBULA_TILE_COUNT}.`,
    );
  }
  if (!Array.isArray(file.records)) {
    throw new NebulaError('The nebula records hold no record list.');
  }

  const rows = file.records as unknown[];
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const tiles = new Uint8Array(count);
  const names: (string | null)[] = new Array<string | null>(count);

  for (let index = 0; index < count; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length < 5) {
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
    const tile = row[4] as number;
    if (!Number.isInteger(tile) || tile < 0 || tile >= NEBULA_TILE_COUNT) {
      throw new NebulaError(`Nebula record ${index} names the tile ${String(tile)}.`);
    }
    positions[index * 3] = row[0] as number;
    positions[index * 3 + 1] = row[1] as number;
    positions[index * 3 + 2] = row[2] as number;
    radii[index] = radius;
    tiles[index] = tile;
    names[index] = row.length > 5 ? (row[5] as string) : null;
  }

  const tileNames = (file.tiles as unknown[]).map((name) => String(name));

  return {
    count,
    positions,
    radii,
    tiles,
    names,
    tileNames,
    record(index: number): NebulaRecord {
      return {
        position: [
          positions[index * 3] as number,
          positions[index * 3 + 1] as number,
          positions[index * 3 + 2] as number,
        ],
        radius: radii[index] as number,
        tile: tiles[index] as number,
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
