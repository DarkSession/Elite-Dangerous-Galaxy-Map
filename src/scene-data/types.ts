// Scene data is typed arrays and plain numbers only. Nothing here knows about WebGL.

/** A cloud of sample points drawn from the model's volume density. */
export interface PointCloud {
  /** The number of samples. */
  readonly count: number;
  /** Three `float32` game coordinates per sample, in light years. */
  readonly positions: Float32Array;
  /** One population zone byte per sample, 0 to 255. */
  readonly tints: Uint8Array;
}

/**
 * A set of cloud samples. The renderer draws one soft sprite per sample, so the haze
 * is made of overlapping puffs.
 */
export interface CloudSet {
  /** The number of samples. */
  readonly count: number;
  /** Three `float32` game coordinates per sample, in light years. */
  readonly positions: Float32Array;
  /** One population zone byte per sample, 0 to 255. */
  readonly tints: Uint8Array;
  /** One `float32` radius per sample, in light years. */
  readonly radii: Float32Array;
  /**
   * One `float32` per sample: the smooth surface density at the centre of the cell
   * that holds the sample, over the largest such density of the table.
   */
  readonly ratios: Float32Array;
}

/** A grid of the model's volume density, encoded on a logarithmic scale. */
export interface DensityVolume {
  /** Texel counts on `x`, `y` and `z`. */
  readonly size: readonly [number, number, number];
  /** The low corner of the covered box in game coordinates. */
  readonly origin: readonly [number, number, number];
  /** The size of the covered box in light years. */
  readonly extent: readonly [number, number, number];
  /** The logarithm of the density that byte value 0 stands for. */
  readonly lo: number;
  /** The logarithm of the density that byte value 255 stands for. */
  readonly hi: number;
  /** The offset every logarithm of density carries. */
  readonly epsilon: number;
  /** One byte per texel, `x` fastest and `z` slowest. */
  readonly data: Uint8Array;
}

/**
 * A grid of the ratio of the detailed to the corrected surface density, on a
 * logarithmic scale. The renderer multiplies the volume density by it.
 */
export interface SurfaceDetail {
  /** The side of the grid, in cells. */
  readonly size: number;
  /** The low corner of the covered plane box in game coordinates, `x` then `z`. */
  readonly origin: readonly [number, number];
  /** The size of the covered plane box in light years, `x` then `z`. */
  readonly extent: readonly [number, number];
  /** The logarithm of the ratio that the quantisation step runs to. */
  readonly scale: number;
  /** One byte per cell, `x` fastest, cell (0, 0) at the low corner. */
  readonly data: Uint8Array;
}

/**
 * The boundaries of the galactic codex regions, as chains of line segments on the
 * galactic plane. A chain runs from one junction of three or more regions to the
 * next, so it separates one pair of regions from end to end. A vertex that two
 * segments share is stored once.
 */
export interface RegionLines {
  /** The number of chains. */
  readonly chainCount: number;
  /** The number of vertices. */
  readonly vertexCount: number;
  /** Three `float32` game coordinates per vertex. */
  readonly positions: Float32Array;
  /** The index of the first vertex of each chain. */
  readonly first: Uint32Array;
  /** The index of the last vertex of each chain. */
  readonly last: Uint32Array;
}

/**
 * A coarse grid of region ids over the model bounds, for the label placement to
 * sample on the main thread.
 */
export interface CoarseRegionGrid {
  /** How many cells the grid holds per axis. */
  readonly size: number;
  /** The low corner of the covered plane box, as `x` then `z`, in light years. */
  readonly origin: readonly [number, number];
  /** The edge of one cell, in light years. */
  readonly cell: number;
  /** One region id per cell, `x` fastest. 0 means the cell holds no region. */
  readonly ids: Uint8Array;
}

/** Everything the renderer draws in the far view. */
export interface SceneData {
  readonly pointCloud: PointCloud;
  readonly cloudSet: CloudSet;
  readonly volume: DensityVolume;
  readonly detail: SurfaceDetail;
  readonly regionLines: RegionLines;
  readonly regionGrid: CoarseRegionGrid;
}
