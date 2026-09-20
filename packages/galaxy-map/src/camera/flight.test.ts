import { describe, expect, test } from 'vitest';
import {
  FLIGHT_MAX_MS,
  FLIGHT_MIN_MS,
  FLIGHT_RHO,
  FLIGHT_SPEED,
  flightAt,
  planFlight,
  yawDelta,
} from './flight';
import { MAX_DISTANCE } from './view';
import type { View } from './view';

const FROM: View = { cursor: [0, 0, 0], distance: 20000, yaw: 40, pitch: 60 };
const TO: View = { cursor: [400, 0, 0], distance: 500, yaw: 40, pitch: 60 };

/** A view at a distance, `gap` light years along `+x` from the origin. */
function at(gap: number, distance: number): View {
  return { cursor: [gap, 0, 0], distance, yaw: 0, pitch: 35 };
}

/** The largest distance a path reaches, read at 400 even steps. */
function peakDistance(from: View, to: View): number {
  const plan = planFlight(from, to);
  let peak = 0;
  for (let step = 0; step <= 400; step += 1) {
    const view = flightAt(plan, (plan.durationMs * step) / 400);
    if (view.distance > peak) peak = view.distance;
  }
  return peak;
}

describe('the plan', () => {
  test('carries the constants the spec names', () => {
    expect(FLIGHT_RHO).toBe(1.42);
    expect(FLIGHT_SPEED).toBe(1.6);
    expect(FLIGHT_MIN_MS).toBe(400);
    expect(FLIGHT_MAX_MS).toBe(2000);
  });

  test('gives a path of no length for an identical start and end', () => {
    const plan = planFlight(at(0, 500), at(0, 500));
    expect(plan.S).toBe(0);
    expect(plan.durationMs).toBe(0);
  });

  test('gives a pure zoom where the cursor does not move', () => {
    const plan = planFlight(at(0, 20000), at(0, 500));
    // `S = abs(ln(w1 / w0)) / rho`, and the width ratio is the distance ratio.
    expect(plan.S).toBeCloseTo(Math.abs(Math.log(500 / 20000)) / FLIGHT_RHO, 9);
    expect(plan.r0).toBe(0);
  });

  // The scenario "The flight time follows the length of the path" of `system-selection`.
  test('the time follows the length of the path', () => {
    // `clamp(1000 * S / 1.6, 400, 2000)`: 0.96 gives 600, 0.1 gives 62.5 and takes the
    // floor, 8.25 gives 5,156 and takes the ceiling.
    const times = [0.96, 0.1, 8.25].map((S) => {
      // A pure zoom of this ratio has exactly this `S`.
      const ratio = Math.exp(S * FLIGHT_RHO);
      return planFlight(at(0, 100), at(0, 100 * ratio)).durationMs;
    });
    expect(times[0]).toBeCloseTo(600, 6);
    expect(times[1]).toBe(400);
    expect(times[2]).toBe(2000);
  });
});

describe('the flight', () => {
  // The scenario "The flight holds its curve" of `system-selection`. The path is chosen
  // to hold the perceived speed of the picture even, and this is that statement: the pan
  // rate in widths and the zoom rate in nepers make a unit vector at every point.
  test('holds its curve over 40 even steps of s', () => {
    const plan = planFlight(FROM, TO);
    const rho = FLIGHT_RHO;
    const steps = 40;
    const ds = plan.S / steps;
    const dt = plan.durationMs / steps;
    const k = 2 * Math.tan(30 * (Math.PI / 180));

    for (let step = 0; step < steps; step += 1) {
      const a = flightAt(plan, dt * step);
      const b = flightAt(plan, dt * (step + 1));
      const wa = k * a.distance;
      const wb = k * b.distance;
      // The move is along `+x` alone, so `du` is the step in `x`.
      const du = b.cursor[0] - a.cursor[0];
      const middle = (wa + wb) / 2;
      const pan = (rho * du) / (middle * ds);
      const zoom = Math.log(wb / wa) / (rho * ds);
      const reading = pan * pan + zoom * zoom;
      expect(reading).toBeGreaterThan(0.98);
      expect(reading).toBeLessThan(1.02);
    }
  });

  test('reads the start view at 0 and the end view at the end, exactly', () => {
    const plan = planFlight(FROM, TO);
    const start = flightAt(plan, 0);
    expect(start.cursor).toEqual([0, 0, 0]);
    expect(start.distance).toBeCloseTo(20000, 6);

    for (const elapsed of [plan.durationMs, plan.durationMs + 1, 100000]) {
      const end = flightAt(plan, elapsed);
      expect(end.cursor).toEqual([400, 0, 0]);
      expect(end.distance).toBe(500);
      expect(end.yaw).toBe(40);
      expect(end.pitch).toBe(60);
    }
  });

  test('leaves the yaw and the pitch of a flight that does not turn', () => {
    const turned: View = { cursor: [0, 0, 0], distance: 1000, yaw: 10, pitch: 20 };
    const other: View = { cursor: [900, 0, 0], distance: 1000, yaw: 10, pitch: 20 };
    const plan = planFlight(turned, other);
    expect(plan.turn).toBe(0);
    const view = flightAt(plan, plan.durationMs / 3);
    expect(view.yaw).toBe(10);
    expect(view.pitch).toBe(20);
  });

  // `flyTo` carries a yaw and a pitch. A selection never turns the camera, so the two
  // terms below are 0 for every selection flight.
  test('turns the camera at an even rate over the flight', () => {
    const turned: View = { cursor: [0, 0, 0], distance: 1000, yaw: 10, pitch: 20 };
    const other: View = { cursor: [900, 0, 0], distance: 1000, yaw: 300, pitch: 80 };
    const plan = planFlight(turned, other);
    // 10 to 300 degrees is 70 degrees back the short way round, and not 290 forward.
    expect(yawDelta(10, 300)).toBe(-70);
    expect(plan.turn).toBeCloseTo(Math.hypot(70, 60), 9);
    const view = flightAt(plan, plan.durationMs / 3);
    expect(view.yaw).toBeCloseTo(10 - 70 / 3, 9);
    expect(view.pitch).toBeCloseTo(20 + 60 / 3, 9);
  });

  test('takes the short way round the yaw from either side', () => {
    expect(yawDelta(350, 10)).toBe(20);
    expect(yawDelta(10, 350)).toBe(-20);
    expect(yawDelta(0, 180)).toBe(180);
    expect(yawDelta(0, 0)).toBe(0);
    // A yaw the caller has not wrapped reads the same way.
    expect(yawDelta(-30, 30)).toBe(60);
  });

  // The scenario "A flight that only turns still runs" of `library-package`.
  test('gives a flight that only turns a time of its own', () => {
    const from: View = { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 };
    const to: View = { cursor: [0, 0, 0], distance: 1000, yaw: 180, pitch: 35 };
    const plan = planFlight(from, to);
    expect(plan.S).toBe(0);
    expect(plan.turn).toBe(180);
    // A turn of 180 degrees is a path length of 3 at a field of view of 60 degrees, and
    // 1,000 * 3 / 1.6 is 1,875 milliseconds.
    expect(plan.durationMs).toBeCloseTo(1875, 6);
    const half = flightAt(plan, plan.durationMs / 2);
    expect(half.yaw).toBeCloseTo(90, 6);
    expect(half.cursor).toEqual([0, 0, 0]);
    expect(half.distance).toBeCloseTo(1000, 6);
  });

  test('gives the same view no time at all', () => {
    const from: View = { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 };
    const plan = planFlight(from, { ...from, cursor: [0, 0, 0] });
    expect(plan.durationMs).toBe(0);
  });

  // The scenario "A long move at a close view pulls the camera back" of
  // `system-selection`. This is the case the old rule could not show at all: the end
  // distance was never further out than the start, so the camera never rose.
  test('a long move at a close view pulls the camera back', () => {
    const peak = peakDistance(at(0, 100), at(20000, 100));
    expect(peak).toBeGreaterThan(17463 * 0.98);
    expect(peak).toBeLessThan(17463 * 1.02);
  });

  // The scenario "A move of 100,000 light years stays inside the zoom limit".
  test('a move of 100,000 light years stays inside the zoom limit', () => {
    const peak = peakDistance(at(0, 10), at(100000, 10));
    expect(peak).toBeGreaterThan(87313 * 0.98);
    expect(peak).toBeLessThan(87313 * 1.02);
    expect(peak).toBeLessThan(MAX_DISTANCE);
  });

  // The scenario "The widest move of all takes the zoom limit". The path asks for more
  // than the limit allows, so the cap binds over the middle of it.
  test('the widest move of all takes the zoom limit', () => {
    const from = at(0, 10);
    const to = at(163430, 10);
    const plan = planFlight(from, to);
    const rho = FLIGHT_RHO;
    const k = 2 * Math.tan(30 * (Math.PI / 180));
    const w0 = k * 10;

    // What the path asks for, read from the formula and not from `flightAt`, which caps.
    let asked = 0;
    for (let step = 0; step <= 400; step += 1) {
      const theta = rho * ((plan.S * step) / 400) + plan.r0;
      const width = (w0 * Math.cosh(plan.r0)) / Math.cosh(theta);
      const distance = width / k;
      if (distance > asked) asked = distance;
    }
    expect(asked).toBeGreaterThan(142700 * 0.98);
    expect(asked).toBeLessThan(142700 * 1.02);

    // What the flight writes never passes the limit.
    expect(peakDistance(from, to)).toBeLessThanOrEqual(MAX_DISTANCE);
  });

  test('a pure zoom moves the distance and holds the cursor', () => {
    const plan = planFlight(at(0, 20000), at(0, 500));
    const half = flightAt(plan, plan.durationMs / 2);
    expect(half.cursor).toEqual([0, 0, 0]);
    // An even rate in the log of the width is a constant factor for each unit of time.
    expect(half.distance).toBeCloseTo(Math.sqrt(20000 * 500), 6);
  });
});
