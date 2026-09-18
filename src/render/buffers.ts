// Buffer and texture upload. This is where game coordinates become world coordinates.
import type {
  CloudSet,
  DensityVolume,
  PointCloud,
  SurfaceDetail,
} from '../scene-data/types';
import { shapeAtlasSide } from './cloud-shapes';
import type { CloudShapes } from './cloud-shapes';

/**
 * Copies point positions into the renderer's world frame, which negates `z`. Scene
 * data keeps game coordinates; only the copy the card reads is flipped.
 */
export function toWorldPositions(positions: Float32Array): Float32Array {
  const world = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    world[index] = positions[index] as number;
    world[index + 1] = positions[index + 1] as number;
    world[index + 2] = -(positions[index + 2] as number);
  }
  return world;
}

/** The buffers and the vertex array the point pass draws from. */
export interface PointBuffers {
  /** One vertex per sample, for the point sprites. */
  readonly vertexArray: WebGLVertexArrayObject;
  readonly count: number;
  dispose(): void;
}

/** The four corners of the cloud sprite quad, as a triangle strip. */
const CLOUD_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

/** The buffers and the vertex array the cloud pass draws from. */
export interface CloudBuffers {
  /** One instance per sample over a four corner quad. */
  readonly vertexArray: WebGLVertexArrayObject;
  readonly count: number;
  dispose(): void;
}

/** Uploads a cloud set. */
export function createCloudBuffers(
  gl: WebGL2RenderingContext,
  set: CloudSet,
): CloudBuffers {
  const vertexArray = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const tintBuffer = gl.createBuffer();
  const radiusBuffer = gl.createBuffer();
  const ratioBuffer = gl.createBuffer();
  const cornerBuffer = gl.createBuffer();
  if (
    vertexArray === null ||
    positionBuffer === null ||
    tintBuffer === null ||
    radiusBuffer === null ||
    ratioBuffer === null ||
    cornerBuffer === null
  ) {
    throw new Error('The context gave no buffer for the cloud set.');
  }

  gl.bindVertexArray(vertexArray);

  // The first four attributes step once per sprite; the corner steps per vertex.
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, toWorldPositions(set.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(0, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, tintBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, set.tints, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.UNSIGNED_BYTE, true, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, radiusBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, set.radii, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(2, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, ratioBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, set.ratios, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(3, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, CLOUD_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    vertexArray,
    count: set.count,
    dispose(): void {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(tintBuffer);
      gl.deleteBuffer(radiusBuffer);
      gl.deleteBuffer(ratioBuffer);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}

/** The 2D texture the cloud pass reads the sprite shapes from. */
export interface ShapeTexture {
  readonly texture: WebGLTexture;
  readonly shapes: CloudShapes;
  dispose(): void;
}

/** Uploads the cloud shape atlas as an R8 2D texture. */
export function createShapeTexture(
  gl: WebGL2RenderingContext,
  shapes: CloudShapes,
): ShapeTexture {
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error('The context gave no texture for the cloud shapes.');
  }
  const side = shapeAtlasSide(shapes);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, side, side);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    side,
    side,
    gl.RED,
    gl.UNSIGNED_BYTE,
    shapes.data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    texture,
    shapes,
    dispose(): void {
      gl.deleteTexture(texture);
    },
  };
}

/** Uploads a point cloud. */
export function createPointBuffers(
  gl: WebGL2RenderingContext,
  cloud: PointCloud,
): PointBuffers {
  const vertexArray = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const tintBuffer = gl.createBuffer();
  if (vertexArray === null || positionBuffer === null || tintBuffer === null) {
    throw new Error('The context gave no buffer for the point cloud.');
  }

  gl.bindVertexArray(vertexArray);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, toWorldPositions(cloud.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, tintBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cloud.tints, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.UNSIGNED_BYTE, true, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    vertexArray,
    count: cloud.count,
    dispose(): void {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(tintBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}

/** The 3D texture the volume pass reads. */
export interface VolumeTexture {
  readonly texture: WebGLTexture;
  readonly volume: DensityVolume;
  dispose(): void;
}

/** Uploads the density volume as a 3D texture. */
export function createVolumeTexture(
  gl: WebGL2RenderingContext,
  volume: DensityVolume,
): VolumeTexture {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('The context gave no texture for the volume.');
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage3D(
    gl.TEXTURE_3D,
    1,
    gl.R8,
    volume.size[0],
    volume.size[1],
    volume.size[2],
  );
  gl.texSubImage3D(
    gl.TEXTURE_3D,
    0,
    0,
    0,
    0,
    volume.size[0],
    volume.size[1],
    volume.size[2],
    gl.RED,
    gl.UNSIGNED_BYTE,
    volume.data,
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);

  return {
    texture,
    volume,
    dispose(): void {
      gl.deleteTexture(texture);
    },
  };
}

/** The 2D texture the volume pass reads the surface detail from. */
export interface DetailTexture {
  readonly texture: WebGLTexture;
  readonly detail: SurfaceDetail;
  dispose(): void;
}

/** Uploads the surface detail grid as an R8 2D texture. */
export function createDetailTexture(
  gl: WebGL2RenderingContext,
  detail: SurfaceDetail,
): DetailTexture {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('The context gave no texture for the detail.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, detail.size, detail.size);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    detail.size,
    detail.size,
    gl.RED,
    gl.UNSIGNED_BYTE,
    detail.data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    texture,
    detail,
    dispose(): void {
      gl.deleteTexture(texture);
    },
  };
}

/** A colour target the passes draw into. */
export interface RenderTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  width: number;
  height: number;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Creates a colour target, with a floating point format when the card allows it. */
export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  float: boolean,
): RenderTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (texture === null || framebuffer === null) {
    throw new Error('The context gave no render target.');
  }

  const internalFormat = float ? gl.RGBA16F : gl.RGBA8;
  const type = float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const allocate = (w: number, h: number): void => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  };

  allocate(width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const target: RenderTarget = {
    framebuffer,
    texture,
    width,
    height,
    resize(newWidth: number, newHeight: number): void {
      if (newWidth === target.width && newHeight === target.height) return;
      target.width = newWidth;
      target.height = newHeight;
      allocate(newWidth, newHeight);
    },
    dispose(): void {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
  return target;
}

/**
 * Whether the context can blend into a 32-bit float colour target.
 *
 * `EXT_color_buffer_float` lets the context draw to a float target. It does not let it
 * blend into a 32-bit float one: WebGL2 refuses that without `EXT_float_blend`, and the
 * range buffer needs it, because the `MIN` equation is how a pixel keeps the nearest
 * marker rather than the last one drawn. The map reads the two as one flag, so it holds
 * one fallback and not two.
 */
export function readsFloatTargets(gl: WebGL2RenderingContext): boolean {
  return (
    gl.getExtension('EXT_color_buffer_float') !== null &&
    gl.getExtension('EXT_float_blend') !== null
  );
}

/**
 * What a pixel of the range buffer holds where no marker body drew. It is above every
 * drawable range, which is at most the width of the galaxy, so a sphere takes the whole
 * wash there and the frame outside the markers is the frame the map drew before the
 * buffer existed. It is far below the largest `float32`, so no arithmetic on it overflows.
 */
export const RANGE_EMPTY = 1e30;

/**
 * The range buffer: one 32-bit float per pixel of the drawing buffer, holding the range
 * from the camera to the nearest marker body that covers that pixel, in light years. The
 * marker pass writes it with the `MIN` equation and the shape pass reads it.
 *
 * `R32F` and not `R16F`: a half float carries about three decimal digits, so at a range
 * of 100,000 light years the step is 64 light years, which is a sixth of the chord of a
 * sphere that is still large enough to draw. The share would then move in bands across
 * the sphere.
 */
export interface RangeBuffer {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  width: number;
  height: number;
  /** Matches the buffer to a drawing buffer size. */
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Creates the range buffer. The caller creates it only where the float flag is true. */
export function createRangeBuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): RangeBuffer {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (texture === null || framebuffer === null) {
    throw new Error('The context gave no range buffer.');
  }

  const allocate = (w: number, h: number): void => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, null);
    // The shape steps read one texel at the fragment's own coordinate, so the buffer
    // needs no filter between texels.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // The attachment follows the storage. A texture attached before it holds an image
    // leaves the framebuffer without one.
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  allocate(width, height);

  const buffer: RangeBuffer = {
    framebuffer,
    texture,
    width,
    height,
    resize(newWidth: number, newHeight: number): void {
      if (newWidth === buffer.width && newHeight === buffer.height) return;
      buffer.width = newWidth;
      buffer.height = newHeight;
      allocate(newWidth, newHeight);
    },
    dispose(): void {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
  return buffer;
}

/** A vertex array that draws one full-screen triangle with no attributes. */
export function createFullScreenTriangle(gl: WebGL2RenderingContext): {
  vertexArray: WebGLVertexArrayObject;
  dispose(): void;
} {
  const vertexArray = gl.createVertexArray();
  if (vertexArray === null) {
    throw new Error('The context gave no vertex array for the full-screen pass.');
  }
  return {
    vertexArray,
    dispose(): void {
      gl.deleteVertexArray(vertexArray);
    },
  };
}
