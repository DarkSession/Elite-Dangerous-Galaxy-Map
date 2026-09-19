// Draws the selected nebulae as screen-aligned sprites over the half-resolution
// target, with premultiplied source-over blending.
import { NEBULA_CAP_FRACTION, NEBULA_MAX_DRAWN } from '../scene-data/nebulae';
import type { NebulaInstance, NebulaSet } from '../scene-data/nebulae';
import { NEBULA_ATLAS_COLUMNS } from './buffers';
import type { NebulaAtlasTexture } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/nebulae.vert?raw';
import fragmentSource from './shaders/nebulae.frag?raw';

/**
 * How bright one nebula sprite draws. It scales the colour channels alone. The value is
 * set by eye: at 2 a bright nebula reads as almost nothing, and at 16 the edge of the
 * sprite quad shows against the background. A browser test pins it.
 */
export const DEFAULT_NEBULA_BRIGHTNESS = 8;

/** How many floats one instance carries: the position, the radius, the tile, the fade. */
export const NEBULA_INSTANCE_FLOATS = 6;

/** The four corners of the nebula sprite quad, as a triangle strip. */
const NEBULA_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

/**
 * Writes the selected records into the instance array, in the order the selection
 * gives them. The position is copied into the renderer's world frame, which negates
 * `z`; scene data keeps game coordinates.
 */
export function writeNebulaInstances(
  set: NebulaSet,
  instances: readonly NebulaInstance[],
  out: Float32Array,
): number {
  const count = Math.min(instances.length, NEBULA_MAX_DRAWN);
  for (let slot = 0; slot < count; slot += 1) {
    const instance = instances[slot] as NebulaInstance;
    const index = instance.index;
    const base = slot * NEBULA_INSTANCE_FLOATS;
    out[base] = set.positions[index * 3] as number;
    out[base + 1] = set.positions[index * 3 + 1] as number;
    out[base + 2] = -(set.positions[index * 3 + 2] as number);
    out[base + 3] = set.radii[index] as number;
    out[base + 4] = set.tiles[index] as number;
    out[base + 5] = instance.fade;
  }
  return count;
}

/** What one nebula pass draw needs. */
export interface NebulaPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** The size of the target the pass draws into, in pixels. */
  readonly targetSize: readonly [number, number];
  /** Target pixels per light year of sprite radius at one light year of range. */
  readonly spriteScale: number;
  /** The brightness of one sprite. It scales the colour channels alone. */
  readonly brightness: number;
  /** The zoom band weight, 0 to 1. At 0 the pass draws nothing. */
  readonly weight: number;
  /** The records the frame draws, furthest from the camera first. */
  readonly instances: readonly NebulaInstance[];
}

/** The nebula pass. */
export interface NebulaPass {
  draw(frame: NebulaPassFrame): void;
  /** How many instances the last draw issued. */
  readonly drawnCount: number;
  /** How many draw calls the last draw issued: one, or none where nothing drew. */
  readonly drawCalls: number;
  dispose(): void;
}

/** Compiles the nebula program. Call it before the record set arrives. */
export function createNebulaProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'nebulae', vertexSource, fragmentSource, [
    'uViewProjection',
    'uChunkOffset',
    'uTargetSize',
    'uSpriteScale',
    'uMaxRadius',
    'uWeight',
    'uTileSide',
    'uAtlasColumns',
    'uAtlasSide',
    'uBrightness',
    'uAtlas',
  ]);
}

/**
 * Gives back the pass that draws the selected nebulae.
 *
 * The instance buffer is written each frame, because the selection changes with the
 * camera. It holds at most 256 instances of six floats, which is 6,144 bytes, so the
 * upload costs nothing beside the fill.
 */
export function createNebulaPass(
  gl: WebGL2RenderingContext,
  program: Program,
  set: NebulaSet,
  atlas: NebulaAtlasTexture,
): NebulaPass {
  const vertexArray = gl.createVertexArray();
  const instanceBuffer = gl.createBuffer();
  const cornerBuffer = gl.createBuffer();
  if (vertexArray === null || instanceBuffer === null || cornerBuffer === null) {
    throw new Error('The context gave no buffer for the nebula set.');
  }

  const instanceData = new Float32Array(NEBULA_MAX_DRAWN * NEBULA_INSTANCE_FLOATS);
  const stride = NEBULA_INSTANCE_FLOATS * 4;

  gl.bindVertexArray(vertexArray);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(0, 1);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 12);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
  gl.vertexAttribDivisor(3, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, NEBULA_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  let drawnCount = 0;
  let drawCalls = 0;

  return {
    get drawnCount(): number {
      return drawnCount;
    },
    get drawCalls(): number {
      return drawCalls;
    },
    draw(frame: NebulaPassFrame): void {
      drawnCount = 0;
      drawCalls = 0;
      // At a weight of 0 the pass draws nothing and issues no draw call, so the
      // default view and the close view cost nothing.
      if (frame.weight <= 0 || frame.instances.length < 1) return;

      const count = writeNebulaInstances(set, frame.instances, instanceData);
      if (count < 1) return;

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        instanceData,
        0,
        count * NEBULA_INSTANCE_FLOATS,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uViewProjection'] ?? null,
        false,
        frame.viewProjection,
      );
      gl.uniform3f(
        program.uniforms['uChunkOffset'] ?? null,
        frame.chunkOffset[0],
        frame.chunkOffset[1],
        frame.chunkOffset[2],
      );
      gl.uniform2f(
        program.uniforms['uTargetSize'] ?? null,
        frame.targetSize[0],
        frame.targetSize[1],
      );
      gl.uniform1f(program.uniforms['uSpriteScale'] ?? null, frame.spriteScale);
      // The cap is a share of the target height, so the drawn radius is the same
      // share of the frame whatever the resolution of the target the pass draws into.
      gl.uniform1f(
        program.uniforms['uMaxRadius'] ?? null,
        NEBULA_CAP_FRACTION * frame.targetSize[1],
      );
      gl.uniform1f(program.uniforms['uWeight'] ?? null, frame.weight);
      // The atlas states its own texel sizes, so a pack at a different tile size needs
      // no change here.
      gl.uniform1f(program.uniforms['uTileSide'] ?? null, atlas.tileSide);
      gl.uniform1f(program.uniforms['uAtlasColumns'] ?? null, NEBULA_ATLAS_COLUMNS);
      gl.uniform1f(program.uniforms['uAtlasSide'] ?? null, atlas.side);
      gl.uniform1f(program.uniforms['uBrightness'] ?? null, frame.brightness);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(program.uniforms['uAtlas'] ?? null, 0);

      gl.enable(gl.BLEND);
      // Premultiplied source-over. One blend serves a bright nebula and a dark one:
      // a dark tile holds low colour and high alpha, so this attenuates what is
      // already in the target without a second blend state and without a kind branch.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vertexArray);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, null);

      drawnCount = count;
      drawCalls = 1;
    },
    dispose(): void {
      gl.deleteBuffer(instanceBuffer);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteVertexArray(vertexArray);
      atlas.dispose();
    },
  };
}
