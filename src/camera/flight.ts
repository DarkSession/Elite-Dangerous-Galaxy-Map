// The camera flight a selection starts. The module is one pure function of two views and
// a time: it holds no state and no timer, so the frame loop of `src/app/create-map.ts`
// owns the start view, the end view and the start time.
//
// A tween library is a dependency for 30 lines of arithmetic, and a spring has no end
// time, so `selectionFlightMs` would have no answer.
import type { View } from './view';

/** How long a selection flight runs, in milliseconds. */
export const FLIGHT_MS = 350;

/**
 * The ease of the flight: `1 - (1 - u)^3`, which is an ease-out. `u` is the part of the
 * flight that has run, held from 0 to 1.
 */
export function flightEase(part: number): number {
  const u = Math.min(1, Math.max(0, part));
  const rest = 1 - u;
  return 1 - rest * rest * rest;
}

/**
 * The view of a flight at a time. The cursor moves in a straight line and the distance
 * moves by a constant factor for each unit of eased time, so the zoom moves the way the
 * wheel moves it. The yaw and the pitch do not change.
 *
 * At `elapsedMs` of `FLIGHT_MS` or more the reading is the end view exactly.
 */
export function flightAt(from: View, to: View, elapsedMs: number): View {
  const eased = flightEase(elapsedMs / FLIGHT_MS);
  if (eased >= 1) {
    return {
      cursor: [to.cursor[0], to.cursor[1], to.cursor[2]],
      distance: to.distance,
      yaw: to.yaw,
      pitch: to.pitch,
    };
  }
  const start = Math.max(from.distance, 1e-6);
  const end = Math.max(to.distance, 1e-6);
  return {
    cursor: [
      from.cursor[0] + (to.cursor[0] - from.cursor[0]) * eased,
      from.cursor[1] + (to.cursor[1] - from.cursor[1]) * eased,
      from.cursor[2] + (to.cursor[2] - from.cursor[2]) * eased,
    ],
    distance: start * Math.pow(end / start, eased),
    yaw: from.yaw,
    pitch: from.pitch,
  };
}
