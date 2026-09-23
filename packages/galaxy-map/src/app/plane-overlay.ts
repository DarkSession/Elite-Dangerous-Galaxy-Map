// Places a DOM element flat on a plane of constant `y` in game coordinates, so text and
// marks lie in the map rather than standing upright in front of it.
//
// The module owns one rule and every overlay that draws on the plane reads it: the
// coordinate labels of the grid and the cursor marker both place through here.
//
// The transform is the **exact** plane-to-screen homography and not an affine
// approximation. A rectangle of the plane projects to a general quadrilateral under a
// perspective projection, whose far edge is shorter than its near edge. A scale and a
// shear taken from the projection's local rate at the anchor keep the two edges the same
// length, and an element a whole grid cell wide then parts company with the lines around
// it across its own width.
//
// The placement projects the four corners camera-relative in `float64`, as every pass of
// the renderer does, and then solves the 3 by 3 homography that takes the element's own
// corners in its local CSS pixel box to those four screen points. The homography goes
// into a CSS `matrix3d`, so the perspective comes from the matrix itself and the overlay
// host carries no `perspective` property of its own.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import type { AnchorPoint, LabelBox } from './labels';
// The style writer lives in a module of its own, which imports nothing. The HUD imports
// it as a value, and a HUD import of this module would reach the camera layer through
// the projection import above.
import { setStyle } from './set-style';

/** How many unknowns the direct linear transform solves for. `h33` is fixed at 1. */
const SOLVE_SIZE = 8;

/**
 * The smallest pivot the solve takes before it calls the system singular, as a share of
 * the largest entry of its own column. Three collinear projected corners give a pivot of
 * 0, and a quad that is nearly a line gives one near it.
 */
const SINGULAR_SHARE = 1e-12;

/** What one plane placement reads. */
export interface PlanePlacement {
  readonly view: View;
  readonly viewport: Viewport;
  /** The plane the element lies on, as the game `y`. */
  readonly planeY: number;
  /** The middle of the element's rectangle, as the game `x` then the game `z`. */
  readonly anchor: readonly [number, number];
  /** The width of the rectangle on the plane, along the game `x` axis, in light years. */
  readonly widthLy: number;
  /** The height of it on the plane, along the game `z` axis, in light years. */
  readonly heightLy: number;
  /** The width of the element's own box, in CSS pixels. */
  readonly widthCss: number;
  /** The height of the element's own box, in CSS pixels. */
  readonly heightCss: number;
}

/** Where a plane element landed on the screen. */
export interface PlanePlaced {
  /** The `matrix3d` value the element carries. */
  readonly transform: string;
  /**
   * The four corners of the element on the screen, in CSS pixels, in the order the
   * element's own box holds them: top left, top right, bottom right, bottom left.
   */
  readonly corners: readonly AnchorPoint[];
  /**
   * The axis-aligned screen box of those four corners. A plane element is not an upright
   * rectangle on the screen, so the overlap test the upright elements use reads this box
   * and not the element's own rectangle.
   */
  readonly box: LabelBox;
}

/**
 * The four corners of the element's rectangle on the plane, in game `x` and `z`, in the
 * order the element's own box holds them.
 *
 * The element's width runs along the game `x` axis and its height along the game `z`
 * axis, with the anchor at the middle. The element's local `y` grows downward and it runs
 * along the game `-z` axis, so text reads the right way round at the default view, where
 * the camera sits on the `-z` side of the cursor.
 */
function planeCorners(
  placement: PlanePlacement,
): readonly (readonly [number, number])[] {
  const halfWidth = placement.widthLy / 2;
  const halfHeight = placement.heightLy / 2;
  const x = placement.anchor[0] as number;
  const z = placement.anchor[1] as number;
  return [
    [x - halfWidth, z + halfHeight],
    [x + halfWidth, z + halfHeight],
    [x + halfWidth, z - halfHeight],
    [x - halfWidth, z - halfHeight],
  ];
}

/**
 * Solves a square linear system by Gaussian elimination with partial pivoting, or gives
 * null where the system is singular. `rows` holds one row of `size + 1` values, the last
 * of which is the right-hand side.
 */
function solveLinear(rows: Float64Array[], size: number): Float64Array | null {
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    let largest = Math.abs((rows[column] as Float64Array)[column] as number);
    for (let row = column + 1; row < size; row += 1) {
      const value = Math.abs((rows[row] as Float64Array)[column] as number);
      if (value > largest) {
        largest = value;
        pivot = row;
      }
    }
    if (!(largest > SINGULAR_SHARE)) return null;
    if (pivot !== column) {
      const held = rows[column] as Float64Array;
      rows[column] = rows[pivot] as Float64Array;
      rows[pivot] = held;
    }
    const top = rows[column] as Float64Array;
    const head = top[column] as number;
    for (let row = column + 1; row < size; row += 1) {
      const under = rows[row] as Float64Array;
      const share = (under[column] as number) / head;
      if (share === 0) continue;
      for (let at = column; at <= size; at += 1) {
        under[at] = (under[at] as number) - share * (top[at] as number);
      }
    }
  }
  const answer = new Float64Array(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    const line = rows[row] as Float64Array;
    let sum = line[size] as number;
    for (let at = row + 1; at < size; at += 1) {
      sum -= (line[at] as number) * (answer[at] as number);
    }
    const head = line[row] as number;
    if (!Number.isFinite(sum / head)) return null;
    answer[row] = sum / head;
  }
  return answer;
}

/**
 * The 3 by 3 homography that takes the four corners of a box `width` by `height` CSS
 * pixels to four screen points, with `h33` fixed at 1, or null where the system is
 * singular.
 *
 * The solve is the standard 8 by 8 linear system of the direct linear transform. For a
 * local corner `(u, v)` and a screen point `(x, y)`:
 *
 * ```
 * h11 u + h12 v + h13 - h31 u x - h32 v x = x
 * h21 u + h22 v + h23 - h31 u y - h32 v y = y
 * ```
 */
export function planeHomography(
  width: number,
  height: number,
  corners: readonly AnchorPoint[],
): Float64Array | null {
  if (!(width > 0) || !(height > 0) || corners.length !== 4) return null;
  const local: readonly (readonly [number, number])[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const rows: Float64Array[] = [];
  for (let index = 0; index < 4; index += 1) {
    const [u, v] = local[index] as readonly [number, number];
    const point = corners[index] as AnchorPoint;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const first = new Float64Array(SOLVE_SIZE + 1);
    first[0] = u;
    first[1] = v;
    first[2] = 1;
    first[6] = -u * point.x;
    first[7] = -v * point.x;
    first[8] = point.x;
    const second = new Float64Array(SOLVE_SIZE + 1);
    second[3] = u;
    second[4] = v;
    second[5] = 1;
    second[6] = -u * point.y;
    second[7] = -v * point.y;
    second[8] = point.y;
    rows.push(first, second);
  }
  return solveLinear(rows, SOLVE_SIZE);
}

/**
 * The CSS `matrix3d` a 2D homography goes into. It fills the columns
 * `(h11, h21, 0, h31)`, `(h12, h22, 0, h32)`, `(0, 0, 1, 0)` and `(h13, h23, 0, 1)`,
 * which is the 4 by 4 a browser applies to a flat element and divides through by `w`.
 */
export function planeMatrix3d(homography: Float64Array): string {
  const h = (at: number): number => homography[at] as number;
  const values = [
    h(0),
    h(3),
    0,
    h(6),
    h(1),
    h(4),
    0,
    h(7),
    0,
    0,
    1,
    0,
    h(2),
    h(5),
    0,
    1,
  ];
  return `matrix3d(${values.join(', ')})`;
}

/**
 * What a projection of plane points reads, taken once for a frame: the view-projection
 * matrix, the camera, the near plane, the half viewport and the plane's `y` less the
 * camera's `y`.
 */
export interface PlaneFrame {
  readonly matrix: ReturnType<typeof viewProjectionMatrix>;
  readonly camera: readonly [number, number, number];
  readonly near: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly offsetY: number;
}

/**
 * The frame that projects points of the plane at game `y` equal to `planeY`.
 *
 * The galaxy spans 100,000 light years, so the camera comes off in `float64` before
 * anything reaches the matrix. An absolute coordinate cannot place a 10 light year
 * element.
 */
export function planeFrame(view: View, viewport: Viewport, planeY: number): PlaneFrame {
  const camera = cameraPosition(view);
  return {
    matrix: viewProjectionMatrix(view, viewport),
    camera,
    near: nearPlane(view.distance),
    halfWidth: viewport.width / 2,
    halfHeight: viewport.height / 2,
    offsetY: planeY - camera[1],
  };
}

/**
 * Writes the screen point of the plane point (`x`, `z`) into `out` at `at` and `at + 1`,
 * in CSS pixels of the canvas. It gives false, and writes nothing, where the point lies
 * at or behind the near plane.
 */
function projectInto(
  frame: PlaneFrame,
  x: number,
  z: number,
  out: Float64Array,
  at: number,
): boolean {
  const matrix = frame.matrix;
  // The renderer's world frame runs its third axis the other way to the game's.
  const offsetX = x - frame.camera[0];
  const offsetY = frame.offsetY;
  const offsetZ = frame.camera[2] - z;
  const clipW =
    (matrix[3] as number) * offsetX +
    (matrix[7] as number) * offsetY +
    (matrix[11] as number) * offsetZ +
    (matrix[15] as number);
  if (!(clipW > frame.near)) return false;
  const clipX =
    (matrix[0] as number) * offsetX +
    (matrix[4] as number) * offsetY +
    (matrix[8] as number) * offsetZ +
    (matrix[12] as number);
  const clipY =
    (matrix[1] as number) * offsetX +
    (matrix[5] as number) * offsetY +
    (matrix[9] as number) * offsetZ +
    (matrix[13] as number);
  out[at] = (clipX / clipW + 1) * frame.halfWidth;
  out[at + 1] = (1 - clipY / clipW) * frame.halfHeight;
  return true;
}

/** The scratch of `projectOnPlane`. */
const projected = new Float64Array(2);

/**
 * The screen point of the plane point (`x`, `z`), in CSS pixels of the canvas, or null
 * where the point lies at or behind the near plane.
 */
export function projectOnPlane(
  frame: PlaneFrame,
  x: number,
  z: number,
): AnchorPoint | null {
  if (!projectInto(frame, x, z, projected, 0)) return null;
  return { x: projected[0] as number, y: projected[1] as number };
}

/** The scratch of `planeJacobian`: the point, the step along `x` and the step along `z`. */
const stepped = new Float64Array(6);

/**
 * The projection's local rate at the plane point (`x`, `z`). It projects the point and
 * two points `step` light years along the game `x` and `z` axes, and writes six values
 * into `out`: the screen `x` and `y` of the point, then the screen `x` and `y` for one
 * light year of the game `x` axis, then the same for the game `z` axis. It gives false,
 * and leaves `out` as it was, where any of the three points lies at or behind the near
 * plane.
 *
 * The grid label sweep calls it for each candidate of each frame, so it allocates
 * nothing.
 */
export function planeJacobian(
  frame: PlaneFrame,
  x: number,
  z: number,
  step: number,
  out: Float64Array,
): boolean {
  if (!projectInto(frame, x, z, stepped, 0)) return false;
  if (!projectInto(frame, x + step, z, stepped, 2)) return false;
  if (!projectInto(frame, x, z + step, stepped, 4)) return false;
  const atX = stepped[0] as number;
  const atY = stepped[1] as number;
  out[0] = atX;
  out[1] = atY;
  out[2] = ((stepped[2] as number) - atX) / step;
  out[3] = ((stepped[3] as number) - atY) / step;
  out[4] = ((stepped[4] as number) - atX) / step;
  out[5] = ((stepped[5] as number) - atY) / step;
  return true;
}

/**
 * Where a plane element lands on the screen, or null where the placement drops it.
 *
 * A placement is dropped, and the element is left out of the overlay, when:
 *
 * - any of its four corners lies at or behind the near plane. A quad with corners on both
 *   sides of the camera does not project to one quadrilateral, and a homography solved
 *   through such a corner wraps the element across the frame;
 * - the projected quad is turned away from the camera, which its signed area on the
 *   screen reports, compared against the side of the plane the camera is on. Seen from
 *   above the plane a face-on element reads a positive area and seen from under it the
 *   same element reads a negative one, so a fixed sign would drop every element under the
 *   plane. A quad that reads the other way for its side is behind the horizon;
 * - the quad's screen bounding box lies wholly outside the viewport;
 * - the homography is singular, which three collinear projected corners give.
 */
export function planePlacement(placement: PlanePlacement): PlanePlaced | null {
  const { view, viewport } = placement;
  if (!(viewport.width > 0) || !(viewport.height > 0)) return null;
  const frame = planeFrame(view, viewport, placement.planeY);
  const camera = frame.camera;

  const corners: AnchorPoint[] = [];
  for (const corner of planeCorners(placement)) {
    const point = projectOnPlane(frame, corner[0] as number, corner[1] as number);
    if (point === null) return null;
    corners.push(point);
  }

  // The signed area of the quad on the screen. Seen from above the plane a face-on
  // element reads positive, because the screen's `y` grows downward and the element's own
  // corners run clockwise in that frame. Seen from under the plane the same corners run
  // the other way, so the test compares the area against the side the camera is on. The
  // product is 0 where the camera lies on the plane, and the element is dropped: it is
  // edge on and covers no pixels.
  let area = 0;
  for (let index = 0; index < 4; index += 1) {
    const one = corners[index] as AnchorPoint;
    const next = corners[(index + 1) % 4] as AnchorPoint;
    area += one.x * next.y - next.x * one.y;
  }
  const side = camera[1] - placement.planeY;
  if (!(area * side > 0)) return null;

  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));
  if (right < 0 || bottom < 0 || left > viewport.width || top > viewport.height) {
    return null;
  }

  // Under the plane the reader sees the element's face from behind, so its text would run
  // backwards. The element is turned over to face them: the homography takes the element's
  // own corners to the same four plane corners with the height axis reversed, which paints
  // the element on the other face of the plane. It still lies flat on the plane, and it
  // reads the same way round from either side. The turn happens as the pitch crosses 0,
  // where every element is dropped anyway, so no frame shows it half way.
  const facing =
    side < 0
      ? [
          corners[3] as AnchorPoint,
          corners[2] as AnchorPoint,
          corners[1] as AnchorPoint,
          corners[0] as AnchorPoint,
        ]
      : corners;
  const homography = planeHomography(placement.widthCss, placement.heightCss, facing);
  if (homography === null) return null;

  return {
    transform: planeMatrix3d(homography),
    corners,
    box: { left, top, width: right - left, height: bottom - top },
  };
}

/**
 * Writes the styles one placement needs on an element, and writes nothing that does not
 * move.
 *
 * It writes the four that a placement moves. The other four never move, so the element
 * factories write them once at creation: `position: absolute`, `left: 0`, `top: 0` and
 * a transform origin of the element's own top left corner, which is the corner the
 * homography's local box starts at. `setStyle` compares each value with the value it
 * last wrote, so a placement that moves nothing reads no style and writes none.
 *
 * Every plane element draws under every upright one. A pin, a hover ring, a system name
 * or a region name each names one thing, and a plane element names a place, so the name
 * must stay readable over it. CSS paints a positioned element with `z-index: auto` in the
 * same level as one with `z-index: 0`, in tree order, so the rule needs a number on both
 * sides: the plane elements take 0 here and the upright ones take 1.
 */
export function writeOnPlane(
  element: ElementCSSInlineStyle,
  widthCss: number,
  heightCss: number,
  placed: PlanePlaced,
): void {
  setStyle(element, 'width', `${widthCss}px`);
  setStyle(element, 'height', `${heightCss}px`);
  setStyle(element, 'transform', placed.transform);
  setStyle(element, 'z-index', '0');
}

/**
 * Places an element on the plane and gives back where it landed, or null where the
 * placement drops it. A drop writes no style and does not throw; the caller takes the
 * element out of the overlay.
 */
export function placeOnPlane(
  element: ElementCSSInlineStyle,
  placement: PlanePlacement,
): PlanePlaced | null {
  const placed = planePlacement(placement);
  if (placed === null) return null;
  writeOnPlane(element, placement.widthCss, placement.heightCss, placed);
  return placed;
}

/**
 * How many light years of the plane a horizontal screen step of `pixels` covers at a
 * point of the plane, or null where the point does not project.
 *
 * The reading comes from the projection's own local rate at the point: the placement
 * projects the point and two points a small step along the game `x` and `z` axes, and
 * solves the 2 by 2 system those two steps make for the plane step whose screen image is
 * `pixels` across and nothing down. A mark sized by it therefore holds its width on the
 * screen while the map moves under it.
 */
export function planeSpanForScreenX(
  view: View,
  viewport: Viewport,
  planeY: number,
  point: readonly [number, number],
  pixels: number,
): number | null {
  // The step is small, so the reading is the local rate the shader takes as a derivative
  // and not a secant of a map that bends hard toward the horizon.
  const step = Math.max(1e-3, Math.abs(view.distance) * 1e-4);
  const rate = new Float64Array(6);
  const frame = planeFrame(view, viewport, planeY);
  if (!planeJacobian(frame, point[0] as number, point[1] as number, step, rate)) {
    return null;
  }
  const xOverX = rate[2] as number;
  const yOverX = rate[3] as number;
  const xOverZ = rate[4] as number;
  const yOverZ = rate[5] as number;
  const determinant = xOverX * yOverZ - xOverZ * yOverX;
  if (determinant === 0) return null;
  // The plane step whose screen image is `pixels` across and nothing down.
  const stepX = (yOverZ * pixels) / determinant;
  const stepZ = (-yOverX * pixels) / determinant;
  const span = Math.hypot(stepX, stepZ);
  return Number.isFinite(span) && span > 0 ? span : null;
}
