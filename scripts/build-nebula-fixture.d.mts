// The types of what the fixture generator exports. The script itself is JavaScript,
// because node runs it directly with no build step.

/** The record file as flat arrays, in the same types `buildNebulaSet` holds. */
export interface FixtureRecords {
  readonly count: number;
  readonly positions: Float32Array;
  readonly radii: Float32Array;
  readonly assets: Uint8Array;
  readonly rotations: Float32Array;
}

/** One decoded asset: the two volumes and the transfer table the march reads. */
export interface FixtureAsset {
  readonly name: string;
  /** The density volume runs 32, 48 or 64 texels a side. */
  readonly densitySide: number;
  /** The colour volume runs 8, 16 or 32 texels a side. */
  readonly colourSide: number;
  readonly density: Uint8Array;
  readonly colour: Uint8Array;
  readonly transfer: Float32Array;
}

/** One record the selection keeps. */
export interface FixtureInstance {
  readonly index: number;
  readonly range: number;
  readonly pixels: number;
  readonly fade: number;
  readonly covered: number;
}

/** What the selection gives back. */
export interface FixtureSelection {
  readonly weight: number;
  readonly instances: readonly FixtureInstance[];
}

/** The view the generator marches, in the shape the map's own view takes. */
export interface FixtureView {
  readonly cursor: readonly [number, number, number];
  readonly distance: number;
  readonly pitch: number;
  readonly yaw: number;
}

export declare const FIXTURE_CANVAS: {
  readonly width: number;
  readonly height: number;
};
export declare const FIXTURE_MAX_CROP: number;
export declare const FIXTURE_VIEWS: readonly { name: string; asset: string }[];
export declare const LIGHT_GAIN: readonly [number, number, number];

export declare function readRecords(): FixtureRecords;
export declare function readAssets(): FixtureAsset[];

export declare function zoomWeight(distance: number): number;
export declare function floorFade(pixels: number): number;
export declare function coveredArea(
  pixels: number,
  width: number,
  height: number,
): number;
export declare function budgetFade(throughArea: number): number;
export declare function focalPixels(
  canvasHeightCss: number,
  fieldOfView: number,
): number;
export declare function selectRecords(
  set: FixtureRecords,
  view: {
    readonly camera: readonly [number, number, number];
    readonly distance: number;
    readonly focalPixels: number;
    readonly canvasHeightCss: number;
    readonly canvasWidthCss: number;
  },
): FixtureSelection;

export declare function decodeBC4(blocks: Uint8Array, side: number): Uint8Array;
export declare function decodeBC1(blocks: Uint8Array, side: number): Uint8Array;
export declare function rotationMatrix(
  rotation: readonly [number, number, number],
): Float64Array;

export declare function cameraPosition(view: FixtureView): [number, number, number];
export declare function cameraBasis(view: FixtureView): {
  forward: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
};
export declare function toneMap(scene: readonly number[], exposure: number): number[];

export declare function marchRay(
  asset: FixtureAsset,
  matrix: Float64Array,
  eye: readonly [number, number, number],
  direction: readonly [number, number, number],
  stepRate: number,
  lightGain: readonly number[],
): { colour: number[]; transmittance: number } | null;

export declare function marchFixture(options: {
  set: FixtureRecords;
  assets: readonly FixtureAsset[];
  view: FixtureView;
  lightGain: readonly number[];
  stepRate?: number;
  crop?: number;
  canvas?: { width: number; height: number };
}): { bytes: Uint8Array; drawn: number };

export declare function viewFor(
  set: FixtureRecords,
  assets: readonly FixtureAsset[],
  assetName: string,
): { record: number; crop: number; view: FixtureView };
