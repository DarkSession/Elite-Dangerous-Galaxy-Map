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

/** Everything the renderer draws in the far view. */
export interface SceneData {
  readonly pointCloud: PointCloud;
  readonly volume: DensityVolume;
}
