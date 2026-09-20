// The planar part of the galaxy model. See `docs/galaxy-density-model.md`.
import type {
  ArmParameters,
  GalaxyModelDocument,
  PlanePoint,
  PolarPoint,
} from './types';

const DEGREES_TO_RADIANS = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const SQRT_TWO_PI = Math.sqrt(TWO_PI);

/** One arm with its phase already in radians. */
interface PreparedArm {
  readonly phase: number;
  readonly amplitude: number;
  readonly slope: number;
  readonly width: number;
}

/** The constants the surface formulas read, derived once from the document. */
export interface PreparedSurface {
  readonly document: GalaxyModelDocument;
  readonly centreX: number;
  readonly centreZ: number;
  readonly referenceRadius: number;
  readonly epsilon: number;
  readonly bulgeAmplitude: number;
  readonly bulgeRadius: number;
  readonly bulgeExponent: number;
  readonly bulgeAxisRatio: number;
  readonly barCos: number;
  readonly barSin: number;
  readonly discAmplitude: number;
  readonly discScaleLength: number;
  readonly truncationRadius: number;
  readonly truncationWidth: number;
  readonly windingG1: number;
  readonly windingG2: number;
  readonly gateRadius: number;
  readonly gateWidth: number;
  readonly arms: readonly PreparedArm[];
  readonly correctionSize: number;
  readonly correctionScale: number;
  readonly correctionValues: readonly number[];
  readonly boundsXLow: number;
  readonly boundsXHigh: number;
  readonly boundsZLow: number;
  readonly boundsZHigh: number;
}

/** The logistic function, flat outside the range where it changes. */
export function logistic(t: number): number {
  if (t > 60) return 1;
  if (t < -60) return 0;
  return 1 / (1 + Math.exp(-t));
}

/** Wraps an angle into the range (-pi, pi]. */
export function wrapAngle(angle: number): number {
  let wrapped = (angle + Math.PI) % TWO_PI;
  if (wrapped <= 0) wrapped += TWO_PI;
  return wrapped - Math.PI;
}

/** Derives the constants the surface formulas read. */
export function prepareSurface(document: GalaxyModelDocument): PreparedSurface {
  const surface = document.surface;
  const barAngle = surface.bulge.bar_angle_deg * DEGREES_TO_RADIANS;
  return {
    document,
    centreX: document.centre[0],
    centreZ: document.centre[2],
    referenceRadius: document.reference_radius_ly,
    epsilon: document.epsilon,
    bulgeAmplitude: surface.bulge.amplitude,
    bulgeRadius: surface.bulge.radius,
    bulgeExponent: surface.bulge.exponent,
    bulgeAxisRatio: surface.bulge.axis_ratio,
    barCos: Math.cos(barAngle),
    barSin: Math.sin(barAngle),
    discAmplitude: surface.disc.amplitude,
    discScaleLength: surface.disc.scale_length,
    truncationRadius: surface.truncation.radius,
    truncationWidth: surface.truncation.width,
    windingG1: surface.arms.pitch.g1,
    windingG2: surface.arms.pitch.g2,
    gateRadius: surface.arms.gate.radius,
    gateWidth: surface.arms.gate.width,
    arms: surface.arms.list.map((arm: ArmParameters) => ({
      phase: arm.phase_deg * DEGREES_TO_RADIANS,
      amplitude: arm.amplitude,
      slope: arm.slope,
      width: arm.width,
    })),
    correctionSize: document.correction.size,
    correctionScale: document.correction.scale,
    correctionValues: document.correction.values,
    boundsXLow: document.bounds.x[0],
    boundsXHigh: document.bounds.x[1],
    boundsZLow: document.bounds.z[0],
    boundsZHigh: document.bounds.z[1],
  };
}

/** Turns a plane point into galactocentric radius and azimuth. */
export function toPolar(prepared: PreparedSurface, x: number, z: number): PolarPoint {
  const u = x - prepared.centreX;
  const v = z - prepared.centreZ;
  return { radius: Math.hypot(u, v), azimuth: Math.atan2(v, u) };
}

/** The logarithmic radius the winding law and the arm amplitudes read. */
export function logRadius(prepared: PreparedSurface, radius: number): number {
  return Math.log(Math.max(radius, 1) / prepared.referenceRadius);
}

/** The bar and bulge term, a squashed and rotated generalised Gaussian. */
export function bulgeDensity(prepared: PreparedSurface, u: number, v: number): number {
  const barU = u * prepared.barCos + v * prepared.barSin;
  const barV = -u * prepared.barSin + v * prepared.barCos;
  const barRadius = Math.hypot(barU, barV / prepared.bulgeAxisRatio);
  return (
    prepared.bulgeAmplitude *
    Math.exp(-Math.pow(barRadius / prepared.bulgeRadius, prepared.bulgeExponent))
  );
}

/** The exponential disc term. */
export function discDensity(prepared: PreparedSurface, radius: number): number {
  return prepared.discAmplitude * Math.exp(-radius / prepared.discScaleLength);
}

/** The outer truncation, which takes the disc to zero past the rim. */
export function truncation(prepared: PreparedSurface, radius: number): number {
  return logistic(-(radius - prepared.truncationRadius) / prepared.truncationWidth);
}

/**
 * The part of the surface density that the arms modulate: the truncated sum of the
 * bar, the bulge and the disc.
 */
export function axisymmetricDensity(
  prepared: PreparedSurface,
  x: number,
  z: number,
): number {
  const u = x - prepared.centreX;
  const v = z - prepared.centreZ;
  const radius = Math.hypot(u, v);
  return (
    truncation(prepared, radius) *
    (bulgeDensity(prepared, u, v) + discDensity(prepared, radius))
  );
}

/** The winding law the four arms share, in radians. */
export function armWinding(prepared: PreparedSurface, logRadiusValue: number): number {
  return (
    prepared.windingG1 * logRadiusValue +
    prepared.windingG2 * logRadiusValue * logRadiusValue
  );
}

/** The slope of the winding law, which sets the local pitch angle. */
export function windingSlope(
  prepared: PreparedSurface,
  logRadiusValue: number,
): number {
  return Math.max(prepared.windingG1 + 2 * prepared.windingG2 * logRadiusValue, 0.1);
}

/** The azimuth of the centre line of one arm at a radius, in radians. */
export function armAzimuth(
  prepared: PreparedSurface,
  arm: number,
  radius: number,
): number {
  const armParameters = prepared.arms[arm];
  if (armParameters === undefined) {
    throw new RangeError(`The model has no arm with the index ${arm}.`);
  }
  return armParameters.phase + armWinding(prepared, logRadius(prepared, radius));
}

/** The point on the centre line of one arm at a radius, in game coordinates. */
export function armPoint(
  prepared: PreparedSurface,
  arm: number,
  radius: number,
): PlanePoint {
  const azimuth = armAzimuth(prepared, arm, radius);
  return {
    x: prepared.centreX + radius * Math.cos(azimuth),
    z: prepared.centreZ + radius * Math.sin(azimuth),
  };
}

/** The local pitch angle of the arms at a radius, in degrees. */
export function pitchAngleDegrees(prepared: PreparedSurface, radius: number): number {
  const slope = windingSlope(prepared, logRadius(prepared, radius));
  return Math.atan(1 / slope) / DEGREES_TO_RADIANS;
}

/**
 * The arm modulation `(1 + arms) / norm` at a radius and azimuth. `norm` is the
 * azimuthal mean of the arm term, so the arms move mass around a ring rather than
 * add it.
 */
export function armFactor(
  prepared: PreparedSurface,
  radius: number,
  azimuth: number,
): number {
  const logRadiusValue = logRadius(prepared, radius);
  const winding = armWinding(prepared, logRadiusValue);
  const slope = windingSlope(prepared, logRadiusValue);
  const cosPitch = slope / Math.sqrt(1 + slope * slope);
  const gate = logistic((radius - prepared.gateRadius) / prepared.gateWidth);
  const meanWidth = Math.max(radius, 1) * cosPitch * SQRT_TWO_PI;

  let sum = 0;
  let norm = 1;
  for (const arm of prepared.arms) {
    let offset = wrapAngle(azimuth - (arm.phase + winding));
    if (offset > Math.PI / 2) offset = Math.PI / 2;
    if (offset < -Math.PI / 2) offset = -Math.PI / 2;
    const distance = radius * Math.sin(offset) * cosPitch;
    const amplitude = arm.amplitude * Math.exp(arm.slope * logRadiusValue) * gate;
    const scaled = distance / arm.width;
    sum += amplitude * Math.exp(-0.5 * scaled * scaled);
    norm += amplitude * Math.min(1, arm.width / meanWidth);
  }
  return (1 + sum) / norm;
}

/** The stellar-mass surface density in map units, without the correction grid. */
export function surfaceDensity(
  prepared: PreparedSurface,
  x: number,
  z: number,
): number {
  const u = x - prepared.centreX;
  const v = z - prepared.centreZ;
  const radius = Math.hypot(u, v);
  const azimuth = Math.atan2(v, u);
  const base =
    truncation(prepared, radius) *
    (bulgeDensity(prepared, u, v) + discDensity(prepared, radius));
  return base * armFactor(prepared, radius, azimuth);
}

/**
 * The bilinear sample of the correction grid at a plane point. The value is
 * `ln((data + epsilon) / (model + epsilon))`.
 */
export function sampleCorrection(
  prepared: PreparedSurface,
  x: number,
  z: number,
): number {
  const size = prepared.correctionSize;
  const values = prepared.correctionValues;
  const last = size - 1;

  let fx =
    ((x - prepared.boundsXLow) / (prepared.boundsXHigh - prepared.boundsXLow)) * size -
    0.5;
  if (fx < 0) fx = 0;
  if (fx > last) fx = last;
  let fz =
    ((z - prepared.boundsZLow) / (prepared.boundsZHigh - prepared.boundsZLow)) * size -
    0.5;
  if (fz < 0) fz = 0;
  if (fz > last) fz = last;

  const ix = Math.floor(fx);
  const jx = Math.min(ix + 1, last);
  const tx = fx - ix;
  const iz = Math.floor(fz);
  const jz = Math.min(iz + 1, last);
  const tz = fz - iz;

  const lowRow = iz * size;
  const highRow = jz * size;
  const v00 = values[lowRow + ix] as number;
  const v10 = values[lowRow + jx] as number;
  const v01 = values[highRow + ix] as number;
  const v11 = values[highRow + jx] as number;
  const low = v00 + (v10 - v00) * tx;
  const high = v01 + (v11 - v01) * tx;
  return ((low + (high - low) * tz) * prepared.correctionScale) / 127;
}

/**
 * The correction grid applied to a surface density the caller already has.
 *
 * A caller that needs both the smooth density and the corrected one reads this rather
 * than `correctedSurfaceDensity`, which would compute the smooth density a second time.
 */
export function correctedFromSurface(
  prepared: PreparedSurface,
  base: number,
  x: number,
  z: number,
): number {
  const epsilon = prepared.epsilon;
  const corrected =
    (base + epsilon) * Math.exp(sampleCorrection(prepared, x, z)) - epsilon;
  return corrected > 0 ? corrected : 0;
}

/** The stellar-mass surface density in map units, with the correction grid. */
export function correctedSurfaceDensity(
  prepared: PreparedSurface,
  x: number,
  z: number,
): number {
  return correctedFromSurface(prepared, surfaceDensity(prepared, x, z), x, z);
}
