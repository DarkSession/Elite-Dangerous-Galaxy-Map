// The view state the camera, the URL fragment and the tests all read.
import { galaxyModel } from '../galaxy-model/model';
import { clamp } from '../math';

/** Where the camera looks and from how far. Every value is `float64`. */
export interface View {
  /** The point on which the camera centres, in game coordinates and light years. */
  cursor: [number, number, number];
  /** The distance from the cursor to the camera, in light years. */
  distance: number;
  /** The camera's angle around the cursor, in degrees, clockwise seen from `+y`. */
  yaw: number;
  /** The camera's elevation above the galactic plane, in degrees. */
  pitch: number;
}

/**
 * The closest the camera comes to the cursor, in light years. It is 10 because that is
 * the edge of a mass-code `a` boxel, the finest cell the game's own hierarchy holds,
 * and because a marker's drawn size caps at 12 CSS pixels. Below 10 light years no
 * marker grows, no line gains detail and no new source of light appears.
 */
export const MIN_DISTANCE = 10;

/** The furthest the camera goes from the cursor, in light years. */
export const MAX_DISTANCE = 120000;

/**
 * The lowest elevation above the plane, in degrees. It is negative, so the camera goes
 * under the galactic disk and looks up at it. The limit stops one degree short of
 * straight up from below, because the orbit frame has no roll and a pitch of exactly -90
 * leaves the yaw with nothing to turn around.
 */
export const MIN_PITCH = -89;

/** The highest elevation above the plane, in degrees. */
export const MAX_PITCH = 89;

/** The vertical field of view, in degrees. */
export const FIELD_OF_VIEW_DEGREES = 60;

/** The view the page shows when the URL carries no fragment. */
export function createDefaultView(): View {
  return { cursor: [0, 0, 0], distance: 60000, yaw: 0, pitch: 35 };
}

/** The margin an `auto` bound grows its box by where the host names none, in light years. */
export const AUTO_MARGIN_LY = 1000;

/**
 * How much of the space a host lets the user browse. The map clamps both the cursor and
 * the far zoom limit to it. `getBounds` reads this back as the host gave it, and not the
 * shape the map works out from it.
 */
export type BrowseBounds =
  /** The whole model. The cursor holds to the model bounds and the far limit is 120,000. */
  | { readonly mode: 'unrestricted' }
  /** The box that holds every system of the set, grown by `marginLy` on every axis. */
  | { readonly mode: 'auto'; readonly marginLy?: number }
  /** A ball in game coordinates. */
  | {
      readonly mode: 'sphere';
      readonly centre: readonly [number, number, number];
      readonly radiusLy: number;
    };

/** The box that holds every system of a set, and whether any system is in it. */
export interface SystemBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly empty: boolean;
}

/**
 * What the three modes resolve to. There are two shapes and not three, because
 * `unrestricted` and `auto` are both boxes. The map resolves once and every clamp reads
 * this, so no clamp knows which mode the host asked for.
 */
export type ResolvedBounds =
  | {
      readonly kind: 'box';
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
      readonly maxDistanceLy: number;
    }
  | {
      readonly kind: 'sphere';
      readonly centre: readonly [number, number, number];
      readonly radiusLy: number;
      readonly maxDistanceLy: number;
    };

/** The resolved shape of `unrestricted`: the model bounds and the 120,000 zoom limit. */
export function unrestrictedBounds(): ResolvedBounds {
  const bounds = galaxyModel.bounds;
  return {
    kind: 'box',
    min: [bounds.x[0], bounds.y[0], bounds.z[0]],
    max: [bounds.x[1], bounds.y[1], bounds.z[1]],
    maxDistanceLy: MAX_DISTANCE,
  };
}

/**
 * The furthest the camera may stand off a bound of a radius, in light years.
 *
 * At `R / sin(fov / 2)` a ball of radius `R` is tangent to the frustum, so it just fills
 * the height of the frame and the user sees the whole of the space they may browse and no
 * more. The half field of view is 30 degrees, so the reading is `2 * R`. It is `sin` and
 * not `tan`: `tan` is the rule for a flat disc facing the camera, and would give `1.73 * R`,
 * which hides the edge of the space.
 */
export function farZoomLimit(radiusLy: number): number {
  const half = (FIELD_OF_VIEW_DEGREES / 2) * (Math.PI / 180);
  return clamp(radiusLy / Math.sin(half), MIN_DISTANCE, MAX_DISTANCE);
}

/** True where every member is a finite number. */
function allFinite(values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

/**
 * Reads a host's setting, or null where it cannot be read. A caller that gets null leaves
 * the setting it already holds in place.
 */
export function readBounds(bounds: unknown): BrowseBounds | null {
  if (bounds === null || typeof bounds !== 'object') return null;
  const mode = (bounds as { mode?: unknown }).mode;
  if (mode === 'unrestricted') return { mode: 'unrestricted' };
  if (mode === 'auto') {
    const margin = (bounds as { marginLy?: unknown }).marginLy;
    if (margin === undefined) return { mode: 'auto' };
    if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 0)
      return null;
    return { mode: 'auto', marginLy: margin };
  }
  if (mode === 'sphere') {
    const centre = (bounds as { centre?: unknown }).centre;
    const radius = (bounds as { radiusLy?: unknown }).radiusLy;
    if (!Array.isArray(centre) || centre.length !== 3) return null;
    if (!allFinite(centre as number[])) return null;
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0)
      return null;
    const point = centre as number[];
    return {
      mode: 'sphere',
      centre: [point[0] as number, point[1] as number, point[2] as number],
      radiusLy: radius,
    };
  }
  return null;
}

/**
 * Turns a host's setting and the set's own box into the one shape every clamp reads.
 *
 * An `auto` bound with no system in the set resolves to `unrestricted`, because an empty
 * box would pin the camera to a point.
 */
export function resolveBounds(
  bounds: BrowseBounds,
  systemBox: SystemBox,
): ResolvedBounds {
  if (bounds.mode === 'sphere') {
    return {
      kind: 'sphere',
      centre: [bounds.centre[0], bounds.centre[1], bounds.centre[2]],
      radiusLy: bounds.radiusLy,
      maxDistanceLy: farZoomLimit(bounds.radiusLy),
    };
  }
  if (bounds.mode === 'auto' && !systemBox.empty) {
    const margin = bounds.marginLy ?? AUTO_MARGIN_LY;
    const min: [number, number, number] = [
      systemBox.min[0] - margin,
      systemBox.min[1] - margin,
      systemBox.min[2] - margin,
    ];
    const max: [number, number, number] = [
      systemBox.max[0] + margin,
      systemBox.max[1] + margin,
      systemBox.max[2] + margin,
    ];
    const half = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    return { kind: 'box', min, max, maxDistanceLy: farZoomLimit(half) };
  }
  return unrestrictedBounds();
}

/**
 * Holds the cursor inside the browsable space. A box clamps on each axis. A cursor outside
 * a sphere moves to the nearest point of its surface, so a drag along the edge slides
 * rather than stops.
 */
export function clampCursor(
  cursor: readonly [number, number, number],
  bounds: ResolvedBounds = unrestrictedBounds(),
): [number, number, number] {
  if (bounds.kind === 'sphere') {
    const dx = cursor[0] - bounds.centre[0];
    const dy = cursor[1] - bounds.centre[1];
    const dz = cursor[2] - bounds.centre[2];
    const gap = Math.hypot(dx, dy, dz);
    if (gap <= bounds.radiusLy) return [cursor[0], cursor[1], cursor[2]];
    // A cursor exactly at the centre cannot be outside the sphere, so `gap` is above 0
    // here and the divide is safe.
    const part = bounds.radiusLy / gap;
    return [
      bounds.centre[0] + dx * part,
      bounds.centre[1] + dy * part,
      bounds.centre[2] + dz * part,
    ];
  }
  return [
    clamp(cursor[0], bounds.min[0], bounds.max[0]),
    clamp(cursor[1], bounds.min[1], bounds.max[1]),
    clamp(cursor[2], bounds.min[2], bounds.max[2]),
  ];
}

/** Holds the distance inside the zoom limits of a browsable space. */
export function clampDistance(distance: number, maxDistanceLy = MAX_DISTANCE): number {
  return clamp(distance, MIN_DISTANCE, maxDistanceLy);
}

/** Holds the pitch inside the elevation limits. */
export function clampPitch(pitch: number): number {
  return clamp(pitch, MIN_PITCH, MAX_PITCH);
}

/** Wraps the yaw into 0 to 360 degrees. */
export function wrapYaw(yaw: number): number {
  const wrapped = yaw % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Applies every limit to a view in place and returns it. */
export function normaliseView(
  view: View,
  bounds: ResolvedBounds = unrestrictedBounds(),
): View {
  view.cursor = clampCursor(view.cursor, bounds);
  view.distance = clampDistance(view.distance, bounds.maxDistanceLy);
  view.pitch = clampPitch(view.pitch);
  view.yaw = wrapYaw(view.yaw);
  return view;
}

/** Copies a view. */
export function copyView(view: View): View {
  return {
    cursor: [view.cursor[0], view.cursor[1], view.cursor[2]],
    distance: view.distance,
    yaw: view.yaw,
    pitch: view.pitch,
  };
}
