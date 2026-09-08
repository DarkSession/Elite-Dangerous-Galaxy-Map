// The view state the camera, the URL fragment and the tests all read.
import { galaxyModel } from '../galaxy-model/model';
import type { Range } from '../galaxy-model/types';

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

/** The closest the camera comes to the cursor, in light years. */
export const MIN_DISTANCE = 2000;

/** The furthest the camera goes from the cursor, in light years. */
export const MAX_DISTANCE = 120000;

/** The lowest elevation above the plane, in degrees. */
export const MIN_PITCH = 5;

/** The highest elevation above the plane, in degrees. */
export const MAX_PITCH = 89;

/** The vertical field of view, in degrees. */
export const FIELD_OF_VIEW_DEGREES = 60;

/** The view the page shows when the URL carries no fragment. */
export function createDefaultView(): View {
  return { cursor: [0, 0, 0], distance: 60000, yaw: 0, pitch: 35 };
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Holds the cursor inside the model bounds on every axis. */
export function clampCursor(
  cursor: readonly [number, number, number],
  bounds: Range = galaxyModel.bounds,
): [number, number, number] {
  return [
    clamp(cursor[0], bounds.x[0], bounds.x[1]),
    clamp(cursor[1], bounds.y[0], bounds.y[1]),
    clamp(cursor[2], bounds.z[0], bounds.z[1]),
  ];
}

/** Holds the distance inside the zoom limits. */
export function clampDistance(distance: number): number {
  return clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
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
export function normaliseView(view: View, bounds: Range = galaxyModel.bounds): View {
  view.cursor = clampCursor(view.cursor, bounds);
  view.distance = clampDistance(view.distance);
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
