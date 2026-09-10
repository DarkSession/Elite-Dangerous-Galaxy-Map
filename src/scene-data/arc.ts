// The arc primitive the region boundary set draws, as plain geometry on the plane.
//
// A primitive runs from a start point to an end point and carries one signed
// curvature, in reciprocal light years. A curvature of zero is a straight line, so one
// primitive type carries a curve and a chord and no reader needs a second code path.
// A positive curvature turns the line left, from `x` towards `z`.
//
// A primitive is the **minor** arc through its two ends, so its sweep is at most 180
// degrees. The two ends and the curvature name two arcs of the same circle, and this
// is which of them the data means. Nothing in this module holds the fit to that: a
// curvature whose intended sweep passes 180 degrees reconstructs the other arc of the
// circle, which is a different curve from the one the fit solved. The biarc cannot ask
// for one, because it splits every span in two, and `region-lines.test.ts` measures the
// built set to keep that true. The widest sweep of the set is 40.0 degrees.
//
// The module holds no state and reads no other module, so a test, the fit and the
// renderer's sub-segment count all measure the same curve.

/** An arc primitive, with the quantities a reader takes from its three numbers. */
export interface Arc {
  /** The start point, in light years. */
  readonly startX: number;
  readonly startZ: number;
  /** The end point, in light years. */
  readonly endX: number;
  readonly endZ: number;
  /** The signed curvature, in reciprocal light years. Zero is a straight line. */
  readonly curvature: number;
  /** The straight distance between the two ends, in light years. */
  readonly chord: number;
  /** The angle the arc turns through, in radians. It carries the sign of the curvature. */
  readonly sweep: number;
  /** The radius, in light years. A straight line has a radius of `Infinity`. */
  readonly radius: number;
  /** The length along the arc, in light years. */
  readonly length: number;
}

/** The direction the line runs in at each end of an arc, as two unit vectors. */
export interface ArcTangents {
  readonly startX: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endZ: number;
}

/** Turns a vector by an angle, from `x` towards `z`. */
function turned(x: number, z: number, angle: number): [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine - z * sine, x * sine + z * cosine];
}

/**
 * The arc that runs from a start point to an end point at a signed curvature.
 *
 * The chord subtends half the sweep at each end, so `sin(sweep / 2)` is the curvature
 * times half the chord. A curvature that asks for more than that is out of range and
 * is held at a half turn, which is the widest a minor arc runs.
 */
export function arcThrough(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  curvature: number,
): Arc {
  const chord = Math.hypot(endX - startX, endZ - startZ);
  if (curvature === 0 || chord === 0) {
    return {
      startX,
      startZ,
      endX,
      endZ,
      curvature: 0,
      chord,
      sweep: 0,
      radius: Number.POSITIVE_INFINITY,
      length: chord,
    };
  }
  const sine = Math.min(1, Math.max(-1, (curvature * chord) / 2));
  const sweep = 2 * Math.asin(sine);
  const radius = 1 / Math.abs(curvature);
  return {
    startX,
    startZ,
    endX,
    endZ,
    curvature,
    chord,
    sweep,
    radius,
    length: Math.abs(sweep) * radius,
  };
}

/**
 * The point at a fraction of the sweep of an arc, as `x` then `z` in light years.
 *
 * The chord from the start to that point is `2 sin(half) / curvature` long and lies at
 * the start tangent turned by `half`, where `half` is half the swept angle. Written
 * that way the point stays exact as the curvature falls to zero, because the sine and
 * the division cancel; a form that took the centre of the circle would work with a
 * centre light years away.
 */
export function arcPointAt(arc: Arc, fraction: number): [number, number] {
  if (arc.sweep === 0) {
    return [
      arc.startX + fraction * (arc.endX - arc.startX),
      arc.startZ + fraction * (arc.endZ - arc.startZ),
    ];
  }
  const half = (arc.sweep * fraction) / 2;
  const reach = (2 * Math.sin(half)) / arc.curvature;
  const tangents = arcTangents(arc);
  const direction = turned(tangents.startX, tangents.startZ, half);
  return [arc.startX + reach * direction[0], arc.startZ + reach * direction[1]];
}

/**
 * The direction the line runs in at each end of an arc.
 *
 * The chord direction sits half the sweep after the start tangent and half the sweep
 * before the end one, so the line turns by the whole sweep from end to end.
 */
export function arcTangents(arc: Arc): ArcTangents {
  const chord = arc.chord;
  const ux = chord === 0 ? 1 : (arc.endX - arc.startX) / chord;
  const uz = chord === 0 ? 0 : (arc.endZ - arc.startZ) / chord;
  if (arc.sweep === 0) return { startX: ux, startZ: uz, endX: ux, endZ: uz };
  const start = turned(ux, uz, -arc.sweep / 2);
  const end = turned(ux, uz, arc.sweep / 2);
  return { startX: start[0], startZ: start[1], endX: end[0], endZ: end[1] };
}

/**
 * The sagitta of a sub-chord that spans a fraction of the sweep, in light years.
 *
 * It is the largest distance from the sub-chord to the arc it cuts across, which is
 * `R (1 - cos(dtheta / 2))` over a sub-angle of `dtheta`. At a fixed sub-angle it
 * grows with the radius, so a wide gentle arc facets before a tight one does.
 */
export function arcSagitta(arc: Arc, fraction: number): number {
  if (arc.sweep === 0) return 0;
  const sub = Math.abs(arc.sweep) * fraction;
  return arc.radius * (1 - Math.cos(sub / 2));
}

/**
 * The curvature of the arc that leaves a start point in a direction and reaches an end
 * point. It is the inverse of `arcThrough`, and the fit reads it to write the data.
 *
 * The angle from the tangent to the chord is half the sweep, and the sine of that
 * angle is the curvature times half the chord.
 */
export function arcCurvature(
  startX: number,
  startZ: number,
  tangentX: number,
  tangentZ: number,
  endX: number,
  endZ: number,
): number {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const chord = Math.hypot(dx, dz);
  if (chord === 0) return 0;
  const cross = tangentX * dz - tangentZ * dx;
  const along = tangentX * dx + tangentZ * dz;
  const half = Math.atan2(cross, along);
  return (2 * Math.sin(half)) / chord;
}
