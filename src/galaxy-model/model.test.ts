import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { galaxyModel } from './model';

interface FixturePoint {
  x: number;
  y: number;
  z: number;
  surface_density: number;
  surface_density_uncorrected: number;
  volume_density: number;
  mass_density: number;
  zone: number;
}

interface Fixture {
  points: FixturePoint[];
  vertical_profile: { dy: number; radius: number; value: number }[];
  half_mass_height: { radius: number; half_mass_height: number }[];
  arms: {
    arm: number;
    radius: number;
    theta: number;
    x: number;
    z: number;
    pitch_deg: number;
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../tests/fixtures/galaxy-model.json', import.meta.url)),
    'utf8',
  ),
) as Fixture;

const TOLERANCE = 1e-6;

function relative(value: number, reference: number): number {
  if (reference === 0) return Math.abs(value);
  return Math.abs(value - reference) / Math.abs(reference);
}

describe('the surface density', () => {
  test('matches the fixture without the correction grid', () => {
    let worst = 0;
    for (const point of fixture.points) {
      worst = Math.max(
        worst,
        relative(
          galaxyModel.surfaceDensity(point.x, point.z),
          point.surface_density_uncorrected,
        ),
      );
    }
    expect(worst).toBeLessThan(TOLERANCE);
  });

  test('matches the fixture with the correction grid', () => {
    let worst = 0;
    for (const point of fixture.points) {
      worst = Math.max(
        worst,
        relative(
          galaxyModel.correctedSurfaceDensity(point.x, point.z),
          point.surface_density,
        ),
      );
    }
    expect(worst).toBeLessThan(TOLERANCE);
  });

  test('gives the same density from a surface density the caller holds', () => {
    // `buildSurfaceTable` needs both densities at each of a million cells. It reads the
    // smooth one and applies the correction to that value, rather than compute the
    // smooth density a second time, so the two routes must agree exactly.
    for (const point of fixture.points) {
      const base = galaxyModel.surfaceDensity(point.x, point.z);
      expect(galaxyModel.correctedFromSurface(base, point.x, point.z)).toBe(
        galaxyModel.correctedSurfaceDensity(point.x, point.z),
      );
    }
  });

  test('falls to nothing at the edge and rises above Sol at the centre', () => {
    const [centreX, , centreZ] = galaxyModel.centre;
    const centre = galaxyModel.surfaceDensity(centreX, centreZ);
    const edge = galaxyModel.surfaceDensity(centreX, centreZ + 48000);
    const sol = galaxyModel.surfaceDensity(0, 0);
    expect(edge).toBeLessThan(1e-4 * centre);
    expect(centre).toBeGreaterThan(100 * sol);
  });
});

describe('the vertical profile', () => {
  test('matches the fixture', () => {
    let worst = 0;
    for (const entry of fixture.vertical_profile) {
      worst = Math.max(
        worst,
        relative(galaxyModel.verticalProfile(entry.dy, entry.radius), entry.value),
      );
    }
    expect(worst).toBeLessThan(TOLERANCE);
  });

  test('matches the fixture half-mass heights', () => {
    for (const entry of fixture.half_mass_height) {
      expect(
        Math.abs(galaxyModel.halfMassHeight(entry.radius) - entry.half_mass_height),
      ).toBeLessThan(0.01);
    }
  });

  test('integrates to one at radii 0, 10,400 and 30,000', () => {
    const step = 0.5;
    for (const radius of [0, 10400, 30000]) {
      let total = 0;
      for (let height = -3000 + step / 2; height < 3000; height += step) {
        total += galaxyModel.verticalProfile(height, radius) * step;
      }
      expect(Math.abs(total - 1)).toBeLessThan(0.02);
    }
  });

  test('is zero one light year beyond the maximum height', () => {
    expect(galaxyModel.verticalProfile(galaxyModel.maxHeight + 1, 0)).toBe(0);
    expect(galaxyModel.verticalProfile(-(galaxyModel.maxHeight + 1), 20000)).toBe(0);
  });
});

describe('the volume, mass and zone values', () => {
  test('match the fixture', () => {
    let worstVolume = 0;
    let worstMass = 0;
    let worstZone = 0;
    for (const point of fixture.points) {
      worstVolume = Math.max(
        worstVolume,
        relative(
          galaxyModel.volumeDensity(point.x, point.y, point.z),
          point.volume_density,
        ),
      );
      worstMass = Math.max(
        worstMass,
        relative(
          galaxyModel.massDensity(point.x, point.y, point.z),
          point.mass_density,
        ),
      );
      worstZone = Math.max(
        worstZone,
        Math.abs(galaxyModel.zone(point.x, point.z) - point.zone),
      );
    }
    expect(worstVolume).toBeLessThan(TOLERANCE);
    expect(worstMass).toBeLessThan(TOLERANCE);
    expect(worstZone).toBeLessThan(TOLERANCE);
  });

  test('gives the same detailed and corrected mass density without a detail grid', () => {
    let worst = 0;
    for (const point of fixture.points) {
      worst = Math.max(
        worst,
        relative(
          galaxyModel.detailedMassDensity(point.x, point.y, point.z),
          galaxyModel.massDensity(point.x, point.y, point.z),
        ),
      );
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

describe('the arm centre lines', () => {
  test('match the fixture', () => {
    let worst = 0;
    for (const entry of fixture.arms) {
      const point = galaxyModel.armPoint(entry.arm, entry.radius);
      worst = Math.max(
        worst,
        relative(galaxyModel.armAzimuth(entry.arm, entry.radius), entry.theta),
        relative(point.x, entry.x),
        relative(point.z, entry.z),
        relative(galaxyModel.pitchAngleDegrees(entry.radius), entry.pitch_deg),
      );
    }
    expect(worst).toBeLessThan(TOLERANCE);
  });

  test('have four distinct phases and a pitch angle that falls with radius', () => {
    const phases = [0, 1, 2, 3].map(
      (arm) => (galaxyModel.armAzimuth(arm, 26000) * 180) / Math.PI,
    );
    for (let a = 0; a < phases.length; a += 1) {
      for (let b = a + 1; b < phases.length; b += 1) {
        expect(Math.abs((phases[a] as number) - (phases[b] as number))).toBeGreaterThan(
          1,
        );
      }
    }
    const radii = [9000, 15000, 26000, 40000];
    const pitches = radii.map((radius) => galaxyModel.pitchAngleDegrees(radius));
    for (let index = 1; index < pitches.length; index += 1) {
      expect(pitches[index] as number).toBeLessThan(pitches[index - 1] as number);
    }
  });
});
