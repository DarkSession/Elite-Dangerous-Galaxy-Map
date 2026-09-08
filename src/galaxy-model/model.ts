// The galaxy model as one object. Nothing here knows about rendering.
import parameters from './galaxy-model.json' with { type: 'json' };
import { loadGalaxyModel } from './load';
import {
  armAzimuth,
  armPoint,
  correctedSurfaceDensity,
  pitchAngleDegrees,
  prepareSurface,
  sampleCorrection,
  surfaceDensity,
  toPolar,
} from './surface';
import type { PreparedSurface } from './surface';
import { halfMassHeight, prepareVertical, verticalProfile } from './vertical';
import type { PreparedVertical } from './vertical';
import type {
  GalaxyModelDocument,
  PlanePoint,
  PolarPoint,
  Range,
  Vector3,
} from './types';

/** Everything the map reads from the galaxy model. */
export interface GalaxyModel {
  readonly document: GalaxyModelDocument;
  readonly centre: Vector3;
  readonly bounds: Range;
  readonly epsilon: number;
  readonly maxHeight: number;
  readonly armCount: number;
  /** Galactocentric radius and azimuth of a plane point. */
  polar(x: number, z: number): PolarPoint;
  /** Galactocentric radius of a plane point, in light years. */
  radius(x: number, z: number): number;
  /** Surface density in map units, without the correction grid. */
  surfaceDensity(x: number, z: number): number;
  /** Surface density in map units, with the correction grid. */
  correctedSurfaceDensity(x: number, z: number): number;
  /** The bilinear correction value at a plane point. */
  correction(x: number, z: number): number;
  /** The fraction of a column's mass per light year at a height above the mid-plane. */
  verticalProfile(height: number, radius: number): number;
  /** The height that holds half of one side's mass, in light years. */
  halfMassHeight(radius: number): number;
  /** Volume density in map units per light year. */
  volumeDensity(x: number, y: number, z: number): number;
  /** The mass-code-0 budget in solar masses per cubic light year. */
  massDensity(x: number, y: number, z: number): number;
  /** The population zone in 0 to 1, used as a tint. */
  zone(x: number, z: number): number;
  /** The azimuth of an arm's centre line at a radius, in radians. */
  armAzimuth(arm: number, radius: number): number;
  /** The point on an arm's centre line at a radius, in game coordinates. */
  armPoint(arm: number, radius: number): PlanePoint;
  /** The local pitch angle of the arms at a radius, in degrees. */
  pitchAngleDegrees(radius: number): number;
}

function zoneOf(
  document: GalaxyModelDocument,
  surface: PreparedSurface,
  x: number,
  z: number,
): number {
  const density = correctedSurfaceDensity(surface, x, z);
  const value = Math.log(density + document.epsilon);
  const grid = document.zone.log_density;
  const zones = document.zone.zone;
  const last = grid.length - 1;
  if (value <= (grid[0] as number)) return zones[0] as number;
  if (value >= (grid[last] as number)) return zones[last] as number;
  for (let index = 0; index < last; index += 1) {
    const high = grid[index + 1] as number;
    if (value <= high) {
      const low = grid[index] as number;
      const t = (value - low) / (high - low);
      const zoneLow = zones[index] as number;
      return zoneLow + t * ((zones[index + 1] as number) - zoneLow);
    }
  }
  return zones[last] as number;
}

/** Builds the model from a parsed parameter document. */
export function createGalaxyModel(source: unknown): GalaxyModel {
  const document = loadGalaxyModel(source);
  const surface: PreparedSurface = prepareSurface(document);
  const vertical: PreparedVertical = prepareVertical(document);
  const budget = document.calibration.mc0_budget_msun_per_ly3_per_unit;
  const centreY = document.centre[1];

  const volumeDensity = (x: number, y: number, z: number): number => {
    const radius = Math.hypot(x - document.centre[0], z - document.centre[2]);
    return (
      correctedSurfaceDensity(surface, x, z) *
      verticalProfile(vertical, y - centreY, radius)
    );
  };

  return {
    document,
    centre: document.centre,
    bounds: document.bounds,
    epsilon: document.epsilon,
    maxHeight: document.vertical.max_height_ly,
    armCount: document.surface.arms.list.length,
    polar: (x, z) => toPolar(surface, x, z),
    radius: (x, z) => Math.hypot(x - document.centre[0], z - document.centre[2]),
    surfaceDensity: (x, z) => surfaceDensity(surface, x, z),
    correctedSurfaceDensity: (x, z) => correctedSurfaceDensity(surface, x, z),
    correction: (x, z) => sampleCorrection(surface, x, z),
    verticalProfile: (height, radius) => verticalProfile(vertical, height, radius),
    halfMassHeight: (radius) => halfMassHeight(vertical, radius),
    volumeDensity,
    massDensity: (x, y, z) => volumeDensity(x, y, z) * budget,
    zone: (x, z) => zoneOf(document, surface, x, z),
    armAzimuth: (arm, radius) => armAzimuth(surface, arm, radius),
    armPoint: (arm, radius) => armPoint(surface, arm, radius),
    pitchAngleDegrees: (radius) => pitchAngleDegrees(surface, radius),
  };
}

/** The model built from the committed parameter file. */
export const galaxyModel: GalaxyModel = createGalaxyModel(parameters);
