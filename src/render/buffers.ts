// Buffer and texture upload. This is where game coordinates become world coordinates.
import type { DensityVolume, PointCloud, SurfaceDetail } from '../scene-data/types';

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
  readonly vertexArray: WebGLVertexArrayObject;
  readonly count: number;
  dispose(): void;
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
