// Turns the view state into the matrices the renderer uses and projects points.
import { mat4 } from 'gl-matrix';
import { FIELD_OF_VIEW_DEGREES } from './view';
import type { View } from './view';

const DEGREES_TO_RADIANS = Math.PI / 180;

/** The ceiling of the near plane, in light years. */
export const NEAR_PLANE = 10;

/** The far plane, in light years. */
export const FAR_PLANE = 1_000_000;

/**
 * The near plane for a zoom distance, in light years. The cursor sits exactly
 * `distance` light years from the camera, so a fixed near plane of 10 would clip the
 * cursor at the closest zoom. A tenth of the zoom distance puts the cursor at ten near
 * planes at every zoom, and the ceiling holds the value at 10 light years at every zoom
 * distance of 100 and above, which is every zoom distance the map reached before the
 * limit moved.
 */
export function nearPlane(distance: number): number {
  return Math.min(NEAR_PLANE, distance / 10);
}

/** The size of the drawing area in pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** A point on the screen, in pixels, with `y` growing downward. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  /** True when the point is in front of the camera. */
  readonly inFront: boolean;
}

/**
 * Turns game coordinates into the renderer's world frame. The renderer negates `z`,
 * which makes the frame right-handed and puts the galactic centre at the top of the
 * screen at the default view.
 */
export function toWorld(
  point: readonly [number, number, number],
): [number, number, number] {
  return [point[0], point[1], -point[2]];
}

/** Turns the renderer's world frame back into game coordinates. */
export function toGame(
  point: readonly [number, number, number],
): [number, number, number] {
  return [point[0], point[1], -point[2]];
}

/**
 * The direction from the cursor to the camera, in game coordinates. Yaw 0 puts the
 * camera on the `-z` side. Yaw grows clockwise seen from `+y`, so yaw 90 puts the
 * camera on the `-x` side.
 */
export function cameraDirection(view: View): [number, number, number] {
  const yaw = view.yaw * DEGREES_TO_RADIANS;
  const pitch = view.pitch * DEGREES_TO_RADIANS;
  const horizontal = Math.cos(pitch);
  return [-horizontal * Math.sin(yaw), Math.sin(pitch), -horizontal * Math.cos(yaw)];
}

/** The camera position in game coordinates. */
export function cameraPosition(view: View): [number, number, number] {
  const direction = cameraDirection(view);
  return [
    view.cursor[0] + direction[0] * view.distance,
    view.cursor[1] + direction[1] * view.distance,
    view.cursor[2] + direction[2] * view.distance,
  ];
}

/**
 * The rotation part of the view matrix. The translation is zero because the renderer
 * subtracts the camera position on the CPU, in `float64`.
 */
export function viewMatrix(view: View): mat4 {
  const direction = toWorld(cameraDirection(view));
  const matrix = mat4.create();
  // The camera sits at the origin of the camera-relative frame and looks back toward
  // the cursor, which is the negative of the direction from the cursor to the camera.
  mat4.lookAt(
    matrix,
    [0, 0, 0],
    [-direction[0], -direction[1], -direction[2]],
    [0, 1, 0],
  );
  return matrix;
}

/**
 * The perspective matrix for a view and a drawing area. `near` overrides the near plane
 * rule; the renderer passes the value a test holds, so a test can draw a view against
 * the fixed near plane the map used before the rule existed.
 */
export function projectionMatrix(
  view: View,
  viewport: Viewport,
  near: number = nearPlane(view.distance),
): mat4 {
  const matrix = mat4.create();
  mat4.perspective(
    matrix,
    FIELD_OF_VIEW_DEGREES * DEGREES_TO_RADIANS,
    viewport.width / viewport.height,
    near,
    FAR_PLANE,
  );
  return matrix;
}

/** The product of the projection and the view matrices. */
export function viewProjectionMatrix(view: View, viewport: Viewport): mat4 {
  const matrix = mat4.create();
  mat4.multiply(matrix, projectionMatrix(view, viewport), viewMatrix(view));
  return matrix;
}

/**
 * The offset from the camera to a point in the renderer's world frame. The subtraction
 * runs in `float64` so the result keeps its resolution at every camera distance.
 */
export function relativeToCamera(
  view: View,
  point: readonly [number, number, number],
): [number, number, number] {
  const camera = cameraPosition(view);
  return [point[0] - camera[0], point[1] - camera[1], -(point[2] - camera[2])];
}

/**
 * Projects a point in game coordinates to the screen with a matrix and a camera the
 * caller built. A sweep that projects many points of one frame builds the pair once and
 * calls this, because building the matrix per point is three matrix builds per point.
 */
export function projectWith(
  matrix: mat4,
  camera: readonly [number, number, number],
  point: readonly [number, number, number],
  viewport: Viewport,
): ScreenPoint {
  // The renderer's world frame runs its third axis the other way to the game's.
  const offsetX = point[0] - camera[0];
  const offsetY = point[1] - camera[1];
  const offsetZ = -(point[2] - camera[2]);
  const clipX =
    matrix[0] * offsetX + matrix[4] * offsetY + matrix[8] * offsetZ + matrix[12];
  const clipY =
    matrix[1] * offsetX + matrix[5] * offsetY + matrix[9] * offsetZ + matrix[13];
  const clipW =
    matrix[3] * offsetX + matrix[7] * offsetY + matrix[11] * offsetZ + matrix[15];
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (0.5 - ndcY * 0.5) * viewport.height,
    inFront: clipW > 0,
  };
}

/** Projects a point in game coordinates to the screen. */
export function project(
  view: View,
  point: readonly [number, number, number],
  viewport: Viewport,
): ScreenPoint {
  return projectWith(
    viewProjectionMatrix(view, viewport),
    cameraPosition(view),
    point,
    viewport,
  );
}

/**
 * The inverse of the view-projection matrix. A sweep that unprojects many pixels of
 * one frame builds this once and passes it to `rayDirectionFrom`, because inverting
 * the matrix per pixel is the cost the label sampling has to avoid.
 */
export function inverseViewProjection(view: View, viewport: Viewport): mat4 {
  const inverse = mat4.create();
  mat4.invert(inverse, viewProjectionMatrix(view, viewport));
  return inverse;
}

/**
 * The direction of the ray through a screen pixel, in game coordinates, from an
 * inverse the caller already holds. The vector is not normalised.
 */
export function rayDirectionFrom(
  inverse: mat4,
  pixel: { readonly x: number; readonly y: number },
  viewport: Viewport,
): [number, number, number] {
  const ndcX = (pixel.x / viewport.width) * 2 - 1;
  const ndcY = 1 - (pixel.y / viewport.height) * 2;

  const unproject = (ndcZ: number): [number, number, number] => {
    const x = inverse[0] * ndcX + inverse[4] * ndcY + inverse[8] * ndcZ + inverse[12];
    const y = inverse[1] * ndcX + inverse[5] * ndcY + inverse[9] * ndcZ + inverse[13];
    const z = inverse[2] * ndcX + inverse[6] * ndcY + inverse[10] * ndcZ + inverse[14];
    const w = inverse[3] * ndcX + inverse[7] * ndcY + inverse[11] * ndcZ + inverse[15];
    return [x / w, y / w, z / w];
  };

  const near = unproject(-1);
  const far = unproject(1);
  return toGame([far[0] - near[0], far[1] - near[1], far[2] - near[2]]);
}

/**
 * The point where a ray meets the horizontal plane at a height, from an inverse the
 * caller already holds. Returns null when the ray runs away from the plane.
 */
export function planePointFrom(
  inverse: mat4,
  origin: readonly [number, number, number],
  pixel: { readonly x: number; readonly y: number },
  viewport: Viewport,
  height: number,
): [number, number, number] | null {
  const direction = rayDirectionFrom(inverse, pixel, viewport);
  if (Math.abs(direction[1]) < 1e-12) return null;
  const t = (height - origin[1]) / direction[1];
  if (t <= 0) return null;
  return [origin[0] + direction[0] * t, height, origin[2] + direction[2] * t];
}

/**
 * The point where the ray through a screen pixel meets the horizontal plane at a
 * height. Returns null when the ray runs away from the plane.
 */
export function planePoint(
  view: View,
  pixel: { readonly x: number; readonly y: number },
  viewport: Viewport,
  height: number,
): [number, number, number] | null {
  return planePointFrom(
    inverseViewProjection(view, viewport),
    cameraPosition(view),
    pixel,
    viewport,
    height,
  );
}
