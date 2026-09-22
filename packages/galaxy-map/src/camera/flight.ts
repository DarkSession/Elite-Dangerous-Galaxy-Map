// The camera flight a selection starts. The module is two pure functions: `planFlight`
// works out the path once, and `flightAt` reads a view from that plan at a time. It holds
// no state and no timer, so the frame loop of `src/app/create-map.ts` owns the plan and
// the start time.
//
// The path is the smooth zoom-and-pan curve of Van Wijk and Nuij (2003). It holds the
// perceived speed of the picture even over the whole flight, which a separate cursor ease
// and distance ease cannot do: screen speed is world speed over distance, so the two do
// not cancel. The path also pulls the camera back over the middle of a long move and
// brings it in again, so the user sees the ground the flight crosses.
//
// A tween library is a dependency for 60 lines of arithmetic, and a spring has no end
// time, so `selectionFlightMs` would have no answer.
import { clamp } from '../math';
import { clampDistance, FIELD_OF_VIEW_DEGREES } from './view';
import type { View } from './view';

/**
 * How far the path leans towards zooming out rather than panning across. 1.42 is the
 * value Van Wijk and Nuij measured from people driving the two by hand.
 */
export const FLIGHT_RHO = 1.42;

/** The perceived speed the path holds, in units of the path parameter each second. */
export const FLIGHT_SPEED = 1.6;

/** The shortest a flight runs, in milliseconds. */
export const FLIGHT_MIN_MS = 400;

/** The longest a flight runs, in milliseconds. */
export const FLIGHT_MAX_MS = 2000;

/**
 * The width the frame covers at the cursor, over the distance to it. The vertical field
 * of view is 60 degrees, so this is `2 * tan(30 degrees)`, which is 1.154701.
 */
const WIDTH_PER_DISTANCE = 2 * Math.tan((FIELD_OF_VIEW_DEGREES / 2) * (Math.PI / 180));

/** Below this a move is no move and a zoom ratio is no zoom, in light years and in nepers. */
const EPSILON = 1e-6;

/** One worked-out flight path. `flightAt` reads a view from it and changes nothing. */
export interface FlightPlan {
  /** The view the flight starts at. */
  readonly from: View;
  /** The view the flight ends at, already inside every limit. */
  readonly to: View;
  /** The path parameter at the start. It is 0 for a pure zoom. */
  readonly r0: number;
  /**
   * The length of the position path. It is 0 where the start and the end hold the same
   * cursor and the same distance. A flight that only turns the camera has an `S` of 0 and
   * a duration above 0.
   */
  readonly S: number;
  /** The angle the camera turns through, in degrees. It is 0 for a selection flight. */
  readonly turn: number;
  /**
   * How long the flight runs, in milliseconds. It is 0 only where the start and the end
   * are the same view, and the caller then takes the end state in that frame.
   */
  readonly durationMs: number;
}

/** The straight distance between two cursors, in light years. */
function cursorGap(from: View, to: View): number {
  const dx = to.cursor[0] - from.cursor[0];
  const dy = to.cursor[1] - from.cursor[1];
  const dz = to.cursor[2] - from.cursor[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * The yaw change the short way round, in degrees, from -180 to 180. A flight from 350 to
 * 10 degrees turns 20 degrees forward and not 340 back.
 */
export function yawDelta(from: number, to: number): number {
  // The double modulo holds for a yaw the caller has not wrapped, where one `%` alone
  // keeps the sign of its left side and gives an answer outside the range.
  const delta = ((((to - from + 180) % 360) + 360) % 360) - 180;
  // A half turn is the same length either way round, so it turns forward.
  return delta === -180 ? 180 : delta;
}

/** The angle the camera turns through between two views, in degrees. */
function turnOf(from: View, to: View): number {
  return Math.hypot(yawDelta(from.yaw, to.yaw), to.pitch - from.pitch);
}

/**
 * The path length an angle sweep is worth.
 *
 * A turn through the field of view moves the picture by about its own width, and a pan of
 * one screen width is a path length of about 1, so the sweep is divided by the field of
 * view. A turn of 180 degrees is therefore a path length of 3, which the time rule below
 * gives 1,875 milliseconds, and a turn of 30 degrees reaches the 400 millisecond floor.
 */
function turnPath(turn: number): number {
  return turn / FIELD_OF_VIEW_DEGREES;
}

/** The natural log of the end width over the start width. */
function zoomLog(from: View, to: View): number {
  return Math.log(widthOf(to.distance) / widthOf(from.distance));
}

function widthOf(distance: number): number {
  return WIDTH_PER_DISTANCE * Math.max(distance, EPSILON);
}

/**
 * Works out the path from one view to another. Pass an end view that is already inside
 * every limit: the path is worked out against where the flight may land and not against
 * where the system is, so a clamped end gives a path that ends where the map can be.
 *
 * A `durationMs` of 0 means the two views are the same. The caller takes the end state in
 * this frame and runs no flight.
 */
export function planFlight(from: View, to: View): FlightPlan {
  const rho = FLIGHT_RHO;
  const D = cursorGap(from, to);
  const w0 = widthOf(from.distance);
  const w1 = widthOf(to.distance);

  const turn = turnOf(from, to);

  if (D < EPSILON) {
    // A pure zoom. The pan term of the path is 0 over 0 there, so the path is the log of
    // the zoom ratio over rho and `theta` never enters it. A flight that only turns the
    // camera takes this branch as well, with an `S` of 0 and a duration from the turn.
    const ratio = zoomLog(from, to);
    const S = Math.abs(ratio) < EPSILON ? 0 : Math.abs(ratio) / rho;
    return { from, to, r0: 0, S, turn, durationMs: durationOf(S, turn) };
  }

  // `r(i) = ln(-b(i) + sqrt(b(i)^2 + 1))` is `asinh(-b(i))`, which is `-asinh(b(i))`.
  // `Math.asinh` is the same function without the cancellation the written-out form has
  // at a large `b`, where `-b + sqrt(b^2 + 1)` subtracts two near-equal numbers. At the
  // widest move the model allows, `b0` is about 14,269 and the written form keeps about
  // six significant digits; `Math.asinh` keeps them all for the same cost.
  const span = rho * rho * rho * rho * D * D;
  const b0 = (w1 * w1 - w0 * w0 + span) / (2 * w0 * rho * rho * D);
  const b1 = (w1 * w1 - w0 * w0 - span) / (2 * w1 * rho * rho * D);
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / rho;
  return { from, to, r0, S, turn, durationMs: durationOf(S, turn) };
}

/**
 * The time a flight runs, in milliseconds. It reads the longer of the position path and
 * the turn, so a flight that moves and turns takes the time the slower of the two needs
 * and neither one is rushed.
 */
function durationOf(S: number, turn: number): number {
  const path = Math.max(S, turnPath(turn));
  if (path === 0) return 0;
  return clamp((1000 * path) / FLIGHT_SPEED, FLIGHT_MIN_MS, FLIGHT_MAX_MS);
}

/**
 * The view of a planned flight at a time. There is no ease: the path already holds the
 * perceived speed even, and an ease would put back exactly the change of speed the path
 * removes.
 *
 * At `elapsedMs` of the plan's duration or more the reading is the end view exactly.
 */
export function flightAt(plan: FlightPlan, elapsedMs: number): View {
  const { from, to, S, r0, durationMs } = plan;
  if (durationMs === 0 || elapsedMs >= durationMs) {
    return {
      cursor: [to.cursor[0], to.cursor[1], to.cursor[2]],
      distance: to.distance,
      yaw: to.yaw,
      pitch: to.pitch,
    };
  }
  const part = clamp(elapsedMs / durationMs, 0, 1);
  const s = S * part;
  const rho = FLIGHT_RHO;
  const w0 = widthOf(from.distance);
  const D = cursorGap(from, to);

  let along: number;
  let width: number;
  if (D < EPSILON) {
    // The pure zoom. `part` moves the cursor, which the two views agree on to within
    // 1e-6 light years, so both ends read exactly.
    along = part;
    width = w0 * Math.exp(Math.sign(zoomLog(from, to)) * rho * s);
  } else {
    const theta = rho * s + r0;
    along =
      ((w0 / (rho * rho)) * Math.cosh(r0) * (Math.tanh(theta) - Math.tanh(r0))) / D;
    width = (w0 * Math.cosh(r0)) / Math.cosh(theta);
  }

  return {
    cursor: [
      from.cursor[0] + (to.cursor[0] - from.cursor[0]) * along,
      from.cursor[1] + (to.cursor[1] - from.cursor[1]) * along,
      from.cursor[2] + (to.cursor[2] - from.cursor[2]) * along,
    ],
    // The path can ask for more distance than the zoom limits allow over the middle of a
    // long move. The cap holds there, and the even speed does not hold over that part.
    distance: clampDistance(width / WIDTH_PER_DISTANCE),
    // The two angles follow the time and not the position path, so the camera turns at an
    // even rate. A selection flight holds the yaw and the pitch, so both terms are 0
    // there and the reading is the start value exactly.
    yaw: from.yaw + yawDelta(from.yaw, to.yaw) * part,
    pitch: from.pitch + (to.pitch - from.pitch) * part,
  };
}
