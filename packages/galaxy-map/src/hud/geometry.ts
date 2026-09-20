// The one piece of geometry the HUD does for itself: how far a point is from the cursor
// and from Sol. The HUD reads the view through the handle and must not import
// `src/camera/`, so it works both readings out here. Neither needs the camera position:
// the cursor is a field of the view.
import type { MapView } from '../app/create-map';

/**
 * The range from the cursor to a point, in light years.
 *
 * It measures from the cursor and not from the camera, because an orbit moves the camera
 * and not the cursor: a reading that followed the camera swung while the user turned
 * around the same point and moved nothing. It is the same point the draw-range cut
 * measures from, so the field and the frame agree. A selection that has landed reads
 * 0 LY, because the cursor is then on the system.
 */
export function rangeFromCursor(
  view: MapView,
  point: readonly [number, number, number],
): number {
  return Math.hypot(
    point[0] - view.cursor[0],
    point[1] - view.cursor[1],
    point[2] - view.cursor[2],
  );
}

/** The distance from Sol to a point, in light years. Sol is the origin of the frame. */
export function distanceFromSol(point: readonly [number, number, number]): number {
  return Math.hypot(point[0], point[1], point[2]);
}
