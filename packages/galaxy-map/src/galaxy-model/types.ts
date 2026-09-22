// The shape of the galaxy model parameter file. `docs/galaxy-density-model.md` gives
// the meaning of each key and the formulas that read it.

export type Vector3 = readonly [number, number, number];

export interface Range {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

export interface BulgeParameters {
  readonly amplitude: number;
  readonly radius: number;
  readonly exponent: number;
  readonly axis_ratio: number;
  readonly bar_angle_deg: number;
}

export interface DiscParameters {
  readonly amplitude: number;
  readonly scale_length: number;
}

export interface TruncationParameters {
  readonly radius: number;
  readonly width: number;
}

export interface PitchParameters {
  readonly g1: number;
  readonly g2: number;
}

export interface GateParameters {
  readonly radius: number;
  readonly width: number;
}

export interface ArmParameters {
  readonly name: string;
  readonly phase_deg: number;
  readonly amplitude: number;
  readonly slope: number;
  readonly width: number;
}

export interface ArmsParameters {
  readonly pitch: PitchParameters;
  readonly gate: GateParameters;
  readonly list: readonly ArmParameters[];
}

export interface SurfaceParameters {
  readonly bulge: BulgeParameters;
  readonly disc: DiscParameters;
  readonly truncation: TruncationParameters;
  readonly arms: ArmsParameters;
}

export interface VerticalParameters {
  readonly inner: { readonly scale_ly: number };
  readonly outer: { readonly scale_ly: number };
  readonly transition: { readonly radius_ly: number; readonly width_ly: number };
  readonly max_height_ly: number;
}

export interface ZoneParameters {
  readonly log_density: readonly number[];
  readonly zone: readonly number[];
}

export interface CalibrationParameters {
  readonly mc0_budget_msun_per_ly3_per_unit: number;
}

export interface CorrectionParameters {
  readonly size: number;
  readonly scale: number;
  readonly values: readonly number[];
}

export interface GalaxyModelDocument {
  readonly format: string;
  readonly units: string;
  readonly centre: Vector3;
  readonly bounds: Range;
  readonly reference_radius_ly: number;
  readonly epsilon: number;
  readonly surface: SurfaceParameters;
  readonly vertical: VerticalParameters;
  readonly zone: ZoneParameters;
  readonly calibration: CalibrationParameters;
  readonly correction: CorrectionParameters;
}

/** A point in the galactic plane, in game coordinates and light years. */
export interface PlanePoint {
  readonly x: number;
  readonly z: number;
}
