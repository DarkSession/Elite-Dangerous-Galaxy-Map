// The one piece of geometry the HUD does for itself: how far the camera is from a point.
// The HUD reads the view through the handle and must not import `src/camera/`, so it
// repeats the camera rule here. The rule is the one `src/camera/projection.ts` states:
// yaw 0 puts the camera on the `-z` side, yaw grows clockwise seen from `+y`, and pitch
// is the elevation above the galactic plane.
import type { MapView } from '../app/create-map';

const DEGREES_TO_RADIANS = Math.PI / 180;

/** The camera position in game coordinates, in light years. */
export function cameraPosition(view: MapView): [number, number, number] {
  const yaw = view.yaw * DEGREES_TO_RADIANS;
  const pitch = view.pitch * DEGREES_TO_RADIANS;
  const horizontal = Math.cos(pitch);
  return [
    view.cursor[0] - horizontal * Math.sin(yaw) * view.distance,
    view.cursor[1] + Math.sin(pitch) * view.distance,
    view.cursor[2] - horizontal * Math.cos(yaw) * view.distance,
  ];
}

/** The range from the camera to a point, in light years. */
export function rangeFromCamera(
  view: MapView,
  point: readonly [number, number, number],
): number {
  const camera = cameraPosition(view);
  return Math.hypot(point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]);
}

/** The distance from Sol to a point, in light years. Sol is the origin of the frame. */
export function distanceFromSol(point: readonly [number, number, number]): number {
  return Math.hypot(point[0], point[1], point[2]);
}
