// Draws the selected nebulae as marched boxes into an accumulation target of its own,
// then composites that target over the half-resolution target the renderer bound.
//
// The blend of the records adds their emissions and multiplies their transmittances, so
// the frame does not depend on the order they draw in. The composite then adds the
// emission sum to the scene and multiplies what the scene held by the transmittance
// product.
//
// The cost of that independence is the overlap: a record takes no light from another, so
// two records that overlap on the screen both give their full emission. The error does
// not move as the camera moves, and a browser test holds the light it leaves.
//
// The draw chooses the records itself, from the frame the renderer hands it. The
// renderer therefore holds no selection call and no record type, which is what keeps the
// record set out of the main entry point's chunk.
//
// The two look defaults the nebulae draw with sit in `nebula-slot.ts`, because the
// renderer keeps them whether or not a host asks for the nebulae and must not import
// this module.
import { nebulaFocalPixels, selectNebulae } from '../scene-data/nebulae';
import type { NebulaSet } from '../scene-data/nebulae';
import type { NebulaVolumeTextures } from './nebula-volumes';
import type { NebulaDraw, NebulaFrame } from './nebula-slot';
import { createRenderTarget } from './buffers';
import type { RenderTarget } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import { withVolumeDensity } from './volume-density';
import vertexSource from './shaders/nebulae.vert?raw';
import fragmentSource from './shaders/nebulae.frag?raw';
import compositeVertexSource from './shaders/nebula-composite.vert?raw';
import compositeFragmentSource from './shaders/nebula-composite.frag?raw';

/**
 * The texture units the five samplers read. Each one takes a unit of its own and every
 * draw sets all five, whether or not a texture is bound: an unset sampler reads unit 0,
 * and two samplers of different types on one unit make the draw fail with
 * `INVALID_OPERATION`.
 */
const DENSITY_UNIT = 0;
const COLOUR_UNIT = 1;
const TRANSFER_UNIT = 2;
const VOLUME_UNIT = 3;
const DETAIL_UNIT = 4;

/**
 * The unit the composite reads the accumulation target on. It is the unit the density
 * sampler takes, which the draw unbinds before the composite runs, so the two never sit
 * on one unit at once.
 */
const ACCUMULATED_UNIT = 0;

/** How many vertices the composite draws: one triangle over the screen. */
const COMPOSITE_VERTICES = 3;

/**
 * How the renderer's world frame reaches the game frame the art was authored in. The
 * game's z runs the other way, so the matrix the pass sends is the record's own rotation
 * composed with this flip.
 *
 * The convention is `Rx(a) * Ry(b) * Rz(c)` composed with the flip, read off by matching
 * Barnard's Loop and the Horsehead against in-game references. Whether the matrix or its
 * transpose applies is not settled, so the reading sits behind this one name and a
 * correction is one edit that touches no data.
 */
export const NEBULA_WORLD_FLIP = [1, 1, -1] as const;

/** How many vertices one box draws: 12 triangles of three. */
export const NEBULA_BOX_VERTICES = 36;

function buildBoxCorners(): Float32Array {
  const out = new Float32Array(NEBULA_BOX_VERTICES * 3);
  const cross = (a: readonly number[], b: readonly number[]): number[] => [
    (a[1] as number) * (b[2] as number) - (a[2] as number) * (b[1] as number),
    (a[2] as number) * (b[0] as number) - (a[0] as number) * (b[2] as number),
    (a[0] as number) * (b[1] as number) - (a[1] as number) * (b[0] as number),
  ];
  let at = 0;
  // One face per axis per side. The two tangents are chosen so that `u` crossed with
  // `v` is the outward normal, which is what makes the winding counter-clockwise seen
  // from outside.
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [1, -1]) {
      const normal = [0, 0, 0];
      normal[axis] = side;
      const u = [0, 0, 0];
      u[(axis + 1) % 3] = 1;
      const v = cross(normal, u);
      const corner = (su: number, sv: number): number[] =>
        normal.map(
          (value, index) =>
            value + su * (u[index] as number) + sv * (v[index] as number),
        );
      const quad = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (const slot of [0, 1, 2, 0, 2, 3]) {
        out.set(quad[slot] as number[], at);
        at += 3;
      }
    }
  }
  return out;
}

/**
 * The 36 corners of the marched box, as 12 triangles. The cube is `[-1, +1]` in object
 * space, and every face is wound counter-clockwise seen from outside, so the pass can
 * cull one side of it.
 */
export const NEBULA_BOX_CORNERS = buildBoxCorners();

/**
 * The object-to-volume matrix of one record, in column-major order for
 * `uniformMatrix3fv`.
 *
 * It is `Rx(a) * Ry(b) * Rz(c)` composed with the world flip. A record of three zeros
 * therefore gives the identity with its z column negated.
 */
export function nebulaRotationMatrix(
  rotation: readonly [number, number, number],
  out = new Float32Array(9),
): Float32Array {
  const [a, b, c] = rotation;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const sb = Math.sin(b);
  const cb = Math.cos(b);
  const sc = Math.sin(c);
  const cc = Math.cos(c);

  // The rows of Rx(a) * Ry(b) * Rz(c).
  const rows = [
    [cb * cc, -cb * sc, sb],
    [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb],
    [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb],
  ];
  for (let column = 0; column < 3; column += 1) {
    const flip = NEBULA_WORLD_FLIP[column] as number;
    for (let row = 0; row < 3; row += 1) {
      out[column * 3 + row] = ((rows[row] as number[])[column] as number) * flip;
    }
  }
  return out;
}

/**
 * Compiles the nebula program. The source compiles it when the records and the art have
 * arrived, and the draw frees it.
 */
export function createNebulaProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'nebulae', withVolumeDensity(vertexSource), fragmentSource, [
    'uViewProjection',
    'uChunkOffset',
    'uPosition',
    'uRadius',
    'uWeight',
    'uFade',
    'uSteps',
    'uLightGain',
    'uRotation',
    'uDensity',
    'uColour',
    'uNebulaTransfer',
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
 * The draw owns the two programs, the volume textures, the accumulation target and its
 * own buffers, and frees them all on `dispose`. The renderer holds the draw and knows
 * none of them, which is what keeps the nebulae out of the main entry point's chunk.
 *
 * One record is one draw call, because each carries its own three textures and its own
 * rotation. The records draw into the accumulation target in any order, and one
 * composite draw then applies that target to the target the renderer bound.
 */
export function createNebulaPass(
  gl: WebGL2RenderingContext,
  program: Program,
  set: NebulaSet,
  volumes: NebulaVolumeTextures,
): NebulaDraw {
  // The composite program compiles first, so a throw here frees nothing and leaks
  // nothing. The caller frees the record program and the textures it made.
  const compositeProgram = createProgram(
    gl,
    'nebula-composite',
    compositeVertexSource,
    compositeFragmentSource,
    ['uAccumulated'],
  );
  const vertexArray = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  // The composite reads no attribute, so its vertex array stays empty.
  const compositeArray = gl.createVertexArray();
  if (vertexArray === null || cornerBuffer === null || compositeArray === null) {
    // One of the three can arrive while the others do not, and the caller gets no
    // handle to the ones that did, so free them here.
    if (vertexArray !== null) gl.deleteVertexArray(vertexArray);
    if (cornerBuffer !== null) gl.deleteBuffer(cornerBuffer);
    if (compositeArray !== null) gl.deleteVertexArray(compositeArray);
    gl.deleteProgram(compositeProgram.program);
    throw new Error('The context gave no buffer for the nebula set.');
  }

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, NEBULA_BOX_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const rotation = new Float32Array(9);
  // The accumulation target. The pass builds it at the first frame that draws a record,
  // so a map that never reaches the zoom band pays for no target at all.
  let accumulation: RenderTarget | null = null;
  let drawnCount = 0;
  let drawCalls = 0;
  let aboveFloorCount = 0;
  let coveredArea = 0;

  return {
    get drawnCount(): number {
      return drawnCount;
    },
    get drawCalls(): number {
      return drawCalls;
    },
    get aboveFloorCount(): number {
      return aboveFloorCount;
    },
    get coveredArea(): number {
      return coveredArea;
    },
    draw(frame: NebulaFrame): void {
      drawnCount = 0;
      drawCalls = 0;
      aboveFloorCount = 0;
      coveredArea = 0;
      // The size floor and the budget are stated in CSS pixels, so the selection reads
      // the canvas and not the half-resolution target the boxes draw into.
      const selection = selectNebulae(set, {
        camera: frame.camera,
        distance: frame.distance,
        focalPixels: nebulaFocalPixels(frame.canvasHeightCss, frame.fieldOfViewDegrees),
        canvasHeightCss: frame.canvasHeightCss,
        canvasWidthCss: frame.canvasWidthCss,
      });
      // The two readings are taken whether or not the pass draws, so a view above the
      // band still reports what passed the floor.
      aboveFloorCount = selection.aboveFloor;
      coveredArea = selection.coveredArea;
      // At a weight of 0 the pass draws nothing and issues no draw call, so the
      // default view and the close view cost nothing. The target, the clear and the
      // composite go with the record draws: a frame that draws no record pays for none
      // of the three.
      if (selection.weight <= 0 || selection.instances.length < 1) return;

      // The renderer hands the draw a frame and no framebuffer, so the draw keeps the
      // binding it found and puts it back before the composite. The read comes before
      // the target is built, because building one leaves no framebuffer bound.
      const sceneFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;

      const width = Math.max(1, frame.targetSize[0]);
      const height = Math.max(1, frame.targetSize[1]);
      if (accumulation === null) {
        accumulation = createRenderTarget(gl, width, height, frame.floatTarget);
      } else {
        accumulation.resize(width, height);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, accumulation.framebuffer);
      // The accumulation target holds the size of the target the renderer bound, so
      // this is the viewport the renderer had already set.
      gl.viewport(0, 0, accumulation.width, accumulation.height);
      // The records start from an emission of 0 and a transmittance of 1.
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

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
      gl.uniform1f(program.uniforms['uWeight'] ?? null, selection.weight);
      gl.uniform1f(program.uniforms['uSteps'] ?? null, frame.stepRate);
      gl.uniform3f(
        program.uniforms['uLightGain'] ?? null,
        frame.lightGain[0],
        frame.lightGain[1],
        frame.lightGain[2],
      );

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

      gl.activeTexture(gl.TEXTURE0 + VOLUME_UNIT);
      gl.bindTexture(gl.TEXTURE_3D, frame.volume);
      gl.uniform1i(program.uniforms['uVolume'] ?? null, VOLUME_UNIT);
      gl.activeTexture(gl.TEXTURE0 + DETAIL_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, frame.detail);
      gl.uniform1i(program.uniforms['uDetail'] ?? null, DETAIL_UNIT);
      gl.uniform1i(program.uniforms['uDensity'] ?? null, DENSITY_UNIT);
      gl.uniform1i(program.uniforms['uColour'] ?? null, COLOUR_UNIT);
      gl.uniform1i(program.uniforms['uNebulaTransfer'] ?? null, TRANSFER_UNIT);

      gl.enable(gl.BLEND);
      // The colour channels add and the alpha channel multiplies, so the target holds
      // the sum of the emissions and the product of the transmittances. Neither depends
      // on the order the records draw in.
      //
      // One blend serves a bright nebula and a dark one: the march writes the emission
      // and the transmittance, so a dark volume lowers the product and the composite
      // attenuates the scene behind the whole selection.
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.SRC_ALPHA);
      // The back faces draw, not the front ones, so a camera inside a box still gets a
      // fragment for every ray. The march clamps its near end at 0 for the same reason.
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT);
      gl.bindVertexArray(vertexArray);

      // Largest first, as the selection gives them. The order is the budget's and the
      // frame does not read it: the blend adds the emissions and multiplies the
      // transmittances, and neither depends on the order. One record is one draw call:
      // each carries its own three textures.
      for (const instance of selection.instances) {
        const asset = volumes.assets[set.assets[instance.index] as number];
        if (asset === undefined) continue;
        gl.uniform3f(
          program.uniforms['uPosition'] ?? null,
          set.positions[instance.index * 3] as number,
          set.positions[instance.index * 3 + 1] as number,
          // The record is in game coordinates and the pass draws in the world frame,
          // whose z runs the other way.
          -(set.positions[instance.index * 3 + 2] as number),
        );
        gl.uniform1f(
          program.uniforms['uRadius'] ?? null,
          set.radii[instance.index] as number,
        );
        gl.uniform1f(program.uniforms['uFade'] ?? null, instance.fade);
        gl.uniformMatrix3fv(
          program.uniforms['uRotation'] ?? null,
          false,
          nebulaRotationMatrix(
            [
              set.rotations[instance.index * 3] as number,
              set.rotations[instance.index * 3 + 1] as number,
              set.rotations[instance.index * 3 + 2] as number,
            ],
            rotation,
          ),
        );

        gl.activeTexture(gl.TEXTURE0 + DENSITY_UNIT);
        gl.bindTexture(gl.TEXTURE_3D, asset.density);
        gl.activeTexture(gl.TEXTURE0 + COLOUR_UNIT);
        gl.bindTexture(gl.TEXTURE_3D, asset.colour);
        gl.activeTexture(gl.TEXTURE0 + TRANSFER_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, asset.transfer);

        gl.drawArrays(gl.TRIANGLES, 0, NEBULA_BOX_VERTICES);
        drawCalls += 1;
      }

      gl.bindVertexArray(null);
      gl.disable(gl.CULL_FACE);
      for (const unit of [DENSITY_UNIT, COLOUR_UNIT, VOLUME_UNIT]) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_3D, null);
      }
      for (const unit of [TRANSFER_UNIT, DETAIL_UNIT]) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      // One composite draw, whatever the count of records. The shader writes the
      // accumulated emission and one minus the accumulated transmittance, and this blend
      // gives `scene = accumulated.rgb + accumulated.a * scene`.
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
      gl.useProgram(compositeProgram.program);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0 + ACCUMULATED_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, accumulation.texture);
      gl.uniform1i(compositeProgram.uniforms['uAccumulated'] ?? null, ACCUMULATED_UNIT);
      gl.bindVertexArray(compositeArray);
      gl.drawArrays(gl.TRIANGLES, 0, COMPOSITE_VERTICES);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0 + DENSITY_UNIT);

      drawnCount = drawCalls;
    },
    dispose(): void {
      gl.deleteBuffer(cornerBuffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteVertexArray(compositeArray);
      accumulation?.dispose();
      accumulation = null;
      volumes.dispose();
      gl.deleteProgram(program.program);
      gl.deleteProgram(compositeProgram.program);
    },
  };
}
