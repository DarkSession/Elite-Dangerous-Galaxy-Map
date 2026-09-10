import { describe, expect, test } from 'vitest';
import { arcCurvature, arcPointAt, arcSagitta, arcTangents, arcThrough } from './arc';

/** A quarter of a circle of radius 2,000 light years, turning left about the origin. */
const RADIUS = 2000;
const SWEEP = Math.PI / 2;

function quarterCircle(): ReturnType<typeof arcThrough> {
  return arcThrough(RADIUS, 0, 0, RADIUS, 1 / RADIUS);
}

describe('the arc primitive', () => {
  test('a curvature of zero gives the chord', () => {
    const arc = arcThrough(100, -50, 400, 250, 0);
    expect(arc.sweep).toBe(0);
    expect(arc.radius).toBe(Number.POSITIVE_INFINITY);
    expect(arc.length).toBeCloseTo(arc.chord, 12);
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const point = arcPointAt(arc, fraction);
      expect(point[0]).toBeCloseTo(100 + fraction * 300, 12);
      expect(point[1]).toBeCloseTo(-50 + fraction * 300, 12);
    }
    const tangents = arcTangents(arc);
    const unit = Math.SQRT1_2;
    expect(tangents.startX).toBeCloseTo(unit, 12);
    expect(tangents.startZ).toBeCloseTo(unit, 12);
    expect(tangents.endX).toBeCloseTo(unit, 12);
    expect(tangents.endZ).toBeCloseTo(unit, 12);
    expect(arcSagitta(arc, 0.5)).toBe(0);
  });

  test('a sampled point sits on the circle of the arc', () => {
    const arc = quarterCircle();
    expect(arc.radius).toBeCloseTo(RADIUS, 9);
    expect(arc.sweep).toBeCloseTo(SWEEP, 12);
    expect(arc.length).toBeCloseTo(RADIUS * SWEEP, 9);
    for (let step = 0; step <= 16; step += 1) {
      const fraction = step / 16;
      const point = arcPointAt(arc, fraction);
      // The circle of the arc is the one about the origin, so the reading is direct.
      expect(Math.hypot(point[0], point[1]) - RADIUS).toBeLessThan(1e-9);
      // The point sits at the angle the fraction of the sweep asks for.
      const angle = SWEEP * fraction;
      expect(point[0]).toBeCloseTo(RADIUS * Math.cos(angle), 9);
      expect(point[1]).toBeCloseTo(RADIUS * Math.sin(angle), 9);
    }
    expect(arcPointAt(arc, 0)).toEqual([arc.startX, arc.startZ]);
    const end = arcPointAt(arc, 1);
    expect(end[0]).toBeCloseTo(arc.endX, 9);
    expect(end[1]).toBeCloseTo(arc.endZ, 9);
  });

  test('the tangents match the analytic ones', () => {
    const arc = quarterCircle();
    const tangents = arcTangents(arc);
    // The circle runs anticlockwise, so at (R, 0) it heads along `z` and at (0, R) it
    // heads back along `x`.
    expect(tangents.startX).toBeCloseTo(0, 12);
    expect(tangents.startZ).toBeCloseTo(1, 12);
    expect(tangents.endX).toBeCloseTo(-1, 12);
    expect(tangents.endZ).toBeCloseTo(0, 12);

    // The same arc the other way round turns right and its tangents swap and reverse.
    const back = arcThrough(0, RADIUS, RADIUS, 0, -1 / RADIUS);
    const backTangents = arcTangents(back);
    expect(back.sweep).toBeCloseTo(-SWEEP, 12);
    expect(backTangents.startX).toBeCloseTo(1, 12);
    expect(backTangents.startZ).toBeCloseTo(0, 12);
    expect(backTangents.endX).toBeCloseTo(0, 12);
    expect(backTangents.endZ).toBeCloseTo(-1, 12);
  });

  test('the sagitta of a sub-chord is the radius less its cosine term', () => {
    const arc = quarterCircle();
    for (const fraction of [1, 0.5, 0.25, 0.125]) {
      const sub = SWEEP * fraction;
      expect(arcSagitta(arc, fraction)).toBeCloseTo(
        RADIUS * (1 - Math.cos(sub / 2)),
        9,
      );
    }
    // At a fixed sub-angle the sagitta grows with the radius, which is why the count
    // of sub-segments reads the sagitta and not the turn.
    const wide = arcThrough(20000, 0, 0, 20000, 1 / 20000);
    expect(arcSagitta(wide, 0.125)).toBeGreaterThan(arcSagitta(arc, 0.125));
  });

  test('the curvature of an arc is the one that draws it', () => {
    for (const curvature of [0, 1 / 3000, -1 / 3000, 1 / 5e6, -1 / 1e8]) {
      const arc = arcThrough(-1200, 700, 900, -400, curvature);
      const tangents = arcTangents(arc);
      const read = arcCurvature(
        arc.startX,
        arc.startZ,
        tangents.startX,
        tangents.startZ,
        arc.endX,
        arc.endZ,
      );
      expect(read).toBeCloseTo(curvature, 15);
    }
  });

  test('a curvature near zero draws the chord it should', () => {
    // A radius of a hundred million light years over a span of a thousand. The point
    // form has to hold there, because the fit emits an almost straight arc wherever
    // the traced boundary runs almost straight.
    const arc = arcThrough(0, 0, 1000, 0, 1e-8);
    const point = arcPointAt(arc, 0.5);
    expect(point[0]).toBeCloseTo(500, 6);
    // A positive curvature turns left, so the arc bulges towards `-z` here.
    const bulge = arc.radius - Math.sqrt(arc.radius ** 2 - 500 ** 2);
    expect(point[1]).toBeCloseTo(-bulge, 6);
    expect(Math.abs(point[1])).toBeLessThan(0.01);
  });
});
