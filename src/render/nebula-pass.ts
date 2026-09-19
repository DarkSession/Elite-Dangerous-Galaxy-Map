// Draws the selected nebulae as screen-aligned sprites over the half-resolution
// target, with premultiplied source-over blending.
//
// The draw chooses the records itself, from the frame the renderer hands it. The
// renderer therefore holds no selection call and no record type, which is what keeps the
// record set out of the main entry point's chunk.
//
// The two look defaults the sprites draw with sit in `nebula-slot.ts`, because the
// renderer keeps them whether or not a host asks for the nebulae and must not import
// this module.
import {
  NEBULA_CAP_FRACTION,
  NEBULA_MAX_DRAWN,
  nebulaFocalPixels,
  selectNebulae,
} from '../scene-data/nebulae';
import type { NebulaInstance, NebulaSet } from '../scene-data/nebulae';
import { NEBULA_ATLAS_COLUMNS } from './nebula-atlas';
import type { NebulaAtlasTexture } from './nebula-atlas';
import type { NebulaDraw, NebulaFrame } from './nebula-slot';
import { createProgram } from './program';
import type { Program } from './program';
import { withVolumeDensity } from './volume-density';
import vertexSource from './shaders/nebulae.vert?raw';
import fragmentSource from './shaders/nebulae.frag?raw';

/**
 * The texture units the three samplers read. Each one takes a unit of its own and every
 * draw sets all three, whether or not a texture is bound: an unset `sampler3D` reads unit
 * 0, where the atlas sits, and two samplers of different types on one unit make the draw
 * fail with `INVALID_OPERATION`.
 */
const ATLAS_UNIT = 0;
const VOLUME_UNIT = 1;
const DETAIL_UNIT = 2;

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

/**
 * Compiles the nebula program. The source compiles it when the records and the art have
 * arrived, and the draw frees it.
 *
 * The vertex shader carries the marker line of the shared density rule, so the pass puts
 * the rule in place of it here. The volume shader reads the same file.
 */
export function createNebulaProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'nebulae', withVolumeDensity(vertexSource), fragmentSource, [
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
    'uVolume',
    'uDetail',
    'uBoxMin',
    'uBoxSize',
    'uCentre',
    'uLo',
    'uSpan',
    'uEpsilon',
    'uAbsorption',
    'uDetailScale',
    'uOcclusion',
  ]);
}

/**
 * Gives back the draw that puts the selected nebulae on the screen.
 *
 * The draw owns the program, the atlas texture and its own two buffers, and frees all
 * four on `dispose`. The renderer holds the draw and knows none of the four, which is
 * what keeps the nebulae out of the main entry point's chunk.
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
): NebulaDraw {
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
    draw(frame: NebulaFrame): void {
      drawnCount = 0;
      drawCalls = 0;
      // The size floor and the cap are stated in CSS pixels, so the selection reads the
      // canvas height and not the half-resolution target the sprites draw into.
      const selection = selectNebulae(set, {
        camera: frame.camera,
        distance: frame.distance,
        focalPixels: nebulaFocalPixels(frame.canvasHeightCss, frame.fieldOfViewDegrees),
        canvasHeightCss: frame.canvasHeightCss,
      });
      // At a weight of 0 the pass draws nothing and issues no draw call, so the
      // default view and the close view cost nothing.
      if (selection.weight <= 0 || selection.instances.length < 1) return;

      const count = writeNebulaInstances(set, selection.instances, instanceData);
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
      gl.uniform1f(program.uniforms['uWeight'] ?? null, selection.weight);
      // The atlas states its own texel sizes, so a pack at a different tile size needs
      // no change here.
      gl.uniform1f(program.uniforms['uTileSide'] ?? null, atlas.tileSide);
      gl.uniform1f(program.uniforms['uAtlasColumns'] ?? null, NEBULA_ATLAS_COLUMNS);
      gl.uniform1f(program.uniforms['uAtlasSide'] ?? null, atlas.side);
      gl.uniform1f(program.uniforms['uBrightness'] ?? null, frame.brightness);

      // The march reads the volume the volume pass draws, over the segment from the
      // camera to the record's centre. Without a texture the pass sends an occlusion of
      // 0 and the shader leaves the transmittance at 1.
      gl.uniform3f(
        program.uniforms['uBoxMin'] ?? null,
        frame.boxMin[0],
        frame.boxMin[1],
        frame.boxMin[2],
      );
      gl.uniform3f(
        program.uniforms['uBoxSize'] ?? null,
        frame.boxSize[0],
        frame.boxSize[1],
        frame.boxSize[2],
      );
      gl.uniform3f(
        program.uniforms['uCentre'] ?? null,
        frame.centre[0],
        frame.centre[1],
        frame.centre[2],
      );
      gl.uniform1f(program.uniforms['uLo'] ?? null, frame.lo);
      gl.uniform1f(program.uniforms['uSpan'] ?? null, frame.span);
      gl.uniform1f(program.uniforms['uEpsilon'] ?? null, frame.epsilon);
      gl.uniform1f(program.uniforms['uAbsorption'] ?? null, frame.absorption);
      gl.uniform1f(program.uniforms['uDetailScale'] ?? null, frame.detailScale);
      gl.uniform1f(
        program.uniforms['uOcclusion'] ?? null,
        frame.volume === null ? 0 : frame.occlusion,
      );

      gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(program.uniforms['uAtlas'] ?? null, ATLAS_UNIT);

      gl.activeTexture(gl.TEXTURE0 + VOLUME_UNIT);
      gl.bindTexture(gl.TEXTURE_3D, frame.volume);
      gl.uniform1i(program.uniforms['uVolume'] ?? null, VOLUME_UNIT);

      gl.activeTexture(gl.TEXTURE0 + DETAIL_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, frame.detail);
      gl.uniform1i(program.uniforms['uDetail'] ?? null, DETAIL_UNIT);
      gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);

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
      gl.activeTexture(gl.TEXTURE0 + VOLUME_UNIT);
      gl.bindTexture(gl.TEXTURE_3D, null);
      gl.activeTexture(gl.TEXTURE0 + DETAIL_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);

      drawnCount = count;
      drawCalls = 1;
    },
    dispose(): void {
      gl.deleteBuffer(instanceBuffer);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteVertexArray(vertexArray);
      atlas.dispose();
      gl.deleteProgram(program.program);
    },
  };
}
