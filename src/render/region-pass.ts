// Draws the galactic codex region boundaries as lines on the galactic plane. The pass
// runs after the tone map, over the finished frame, so it is an overlay and not a
// scene pass: no look constant of the far view changes it, and it changes none of them.
//
// The line is a two-tone ribbon and it draws in two steps. The first step expands each
// segment into a screen-space quad and writes its coverage into a single-channel
// buffer with the MAX blend equation, so a join keeps the smallest distance rather
// than blending twice. The second step reads that buffer once and writes the core
// colour and the outline colour over the frame.
import { toWorldPositions } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import type { RegionLines } from '../scene-data/types';
import vertexSource from './shaders/regions.vert?raw';
import fragmentSource from './shaders/regions.frag?raw';
import fullScreenSource from './shaders/fullscreen.vert?raw';
import compositeSource from './shaders/region-composite.frag?raw';

/** The colour of the middle of a boundary line. It is the lighter of the two. */
export const REGION_CORE_COLOUR: readonly [number, number, number] = [0.6, 0.78, 1];

/**
 * The colour of the outline on each side of the core. It is the darker of the two, so
 * the line reads over the bright disc as well as over the dark space between the arms.
 */
export const REGION_OUTLINE_COLOUR: readonly [number, number, number] = [
  0.03, 0.05, 0.12,
];

/** How opaque a boundary line is where the overlay draws in full. */
export const REGION_LINE_OPACITY = 0.55;

/** The width of the whole line, in CSS pixels. */
export const REGION_LINE_WIDTH_CSS = 4;

/** The width of the core, in CSS pixels. The outline holds the rest, half each side. */
export const REGION_CORE_WIDTH_CSS = 2;

/** The width of the edge ramp that antialiases the line, in device pixels. */
export const REGION_EDGE_SOFT_PIXELS = 1;

/** The zoom distance above which the overlay draws nothing, in light years. */
export const REGION_FADE_IN_FAR = 30000;

/** The zoom distance at and below which the overlay draws in full, in light years. */
export const REGION_FADE_IN_NEAR = 20000;

/** The four corners of the ribbon quad, as a triangle strip. */
const RIBBON_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/** How many bytes one vertex of the boundary set takes. */
const VERTEX_BYTES = 12;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the overlay draws at a zoom distance, 0 to 1. It fades in from 30,000
 * light years and is full at 20,000. It does not fade out again: a smoothed boundary
 * does not read as a staircase, so the lines stay to the closest zoom.
 */
export function regionFade(distance: number): number {
  return 1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance);
}

/** The coverage the composite reads at the edge of the core, 0 to 1. */
export function regionCoreLevel(): number {
  return 1 - REGION_CORE_WIDTH_CSS / REGION_LINE_WIDTH_CSS;
}

/** What one region pass draw needs. */
export interface RegionPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** How much of the overlay draws, 0 to 1. */
  readonly fade: number;
  /** How many device pixels one CSS pixel holds. */
  readonly pixelRatio: number;
}

/** The region overlay pass. */
export interface RegionPass {
  draw(frame: RegionPassFrame): void;
  /** How many chains the pass draws. */
  readonly count: number;
  /** The size of the coverage buffer in device pixels, or null before the first draw. */
  coverageSize(): [number, number] | null;
  dispose(): void;
}

/** The two programs the overlay needs. */
export interface RegionPrograms {
  /** Writes segment coverage into the single-channel buffer. */
  readonly ribbon: Program;
  /** Reads that buffer and writes the two tones over the frame. */
  readonly composite: Program;
}

/** Compiles the ribbon program and the composite program. */
export function createRegionPrograms(gl: WebGL2RenderingContext): RegionPrograms {
  return {
    ribbon: createProgram(gl, 'regions', vertexSource, fragmentSource, [
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uHalfWidth',
    ]),
    composite: createProgram(
      gl,
      'region-composite',
      fullScreenSource,
      compositeSource,
      [
        'uCoverage',
        'uCoreColour',
        'uOutlineColour',
        'uOpacity',
        'uCoreLevel',
        'uCoreSoft',
        'uEdgeSoft',
      ],
    ),
  };
}

/** The single-channel target the ribbon step writes and the composite step reads. */
interface CoverageTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  /** Matches the target to a drawing buffer size. */
  resize(width: number, height: number): void;
  /** The current size, or null while the target holds no storage. */
  size(): [number, number] | null;
  dispose(): void;
}

/**
 * Creates the coverage target. `R8` is enough: the value it holds is a distance
 * against the half width, so one part in 255 is a fortieth of a device pixel at the
 * widths this pass draws. The target takes its storage on the first draw, so the
 * overlay costs no memory at 30,000 light years and above.
 */
function createCoverageTarget(gl: WebGL2RenderingContext): CoverageTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (texture === null || framebuffer === null) {
    throw new Error('The context gave no target for the region coverage.');
  }
  let width = 0;
  let height = 0;

  return {
    framebuffer,
    texture,
    resize(nextWidth: number, nextHeight: number): void {
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        width,
        height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      // The attachment follows the storage. A texture attached before it holds an
      // image leaves the framebuffer without one.
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    size(): [number, number] | null {
      return width === 0 || height === 0 ? null : [width, height];
    },
    dispose(): void {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}

/**
 * Uploads the boundary set and gives back the pass that draws it. The renderer owns
 * the programs and the full-screen vertex array, and it deletes them.
 */
export function createRegionPass(
  gl: WebGL2RenderingContext,
  programs: RegionPrograms,
  lines: RegionLines,
  fullScreenVertexArray: WebGLVertexArrayObject,
): RegionPass {
  const vertexArray = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const cornerBuffer = gl.createBuffer();
  if (vertexArray === null || positionBuffer === null || cornerBuffer === null) {
    throw new Error('The context gave no buffer for the region boundaries.');
  }

  gl.bindVertexArray(vertexArray);

  // The corner steps once per vertex of the quad. The two endpoints step once per
  // segment, and the draw loop points them at the chain it is about to draw.
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, RIBBON_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, toWorldPositions(lines.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribDivisor(0, 1);
  gl.vertexAttribDivisor(1, 1);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const coverage = createCoverageTarget(gl);

  return {
    count: lines.chainCount,
    coverageSize(): [number, number] | null {
      return coverage.size();
    },
    draw(frame: RegionPassFrame): void {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const halfWidth = (REGION_LINE_WIDTH_CSS / 2) * frame.pixelRatio;
      coverage.resize(width, height);

      // Step one: the coverage of every segment, largest value wins.
      gl.bindFramebuffer(gl.FRAMEBUFFER, coverage.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);

      const ribbon = programs.ribbon;
      gl.useProgram(ribbon.program);
      gl.uniformMatrix4fv(
        ribbon.uniforms['uViewProjection'] ?? null,
        false,
        frame.viewProjection,
      );
      gl.uniform3f(
        ribbon.uniforms['uChunkOffset'] ?? null,
        frame.chunkOffset[0],
        frame.chunkOffset[1],
        frame.chunkOffset[2],
      );
      gl.uniform2f(ribbon.uniforms['uTargetSize'] ?? null, width, height);
      gl.uniform1f(ribbon.uniforms['uHalfWidth'] ?? null, halfWidth);

      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      // One instanced call per chain. A segment reads the shared vertex array at two
      // offsets one vertex apart, so the endpoints need no second buffer.
      for (let chain = 0; chain < lines.chainCount; chain += 1) {
        const first = lines.first[chain] as number;
        const segments = (lines.last[chain] as number) - first;
        if (segments < 1) continue;
        gl.vertexAttribPointer(
          0,
          3,
          gl.FLOAT,
          false,
          VERTEX_BYTES,
          first * VERTEX_BYTES,
        );
        gl.vertexAttribPointer(
          1,
          3,
          gl.FLOAT,
          false,
          VERTEX_BYTES,
          (first + 1) * VERTEX_BYTES,
        );
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segments);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.blendEquation(gl.FUNC_ADD);

      // Step two: the two tones, over the finished frame.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const composite = programs.composite;
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverage.texture);
      gl.uniform1i(composite.uniforms['uCoverage'] ?? null, 0);
      gl.uniform3f(
        composite.uniforms['uCoreColour'] ?? null,
        REGION_CORE_COLOUR[0],
        REGION_CORE_COLOUR[1],
        REGION_CORE_COLOUR[2],
      );
      gl.uniform3f(
        composite.uniforms['uOutlineColour'] ?? null,
        REGION_OUTLINE_COLOUR[0],
        REGION_OUTLINE_COLOUR[1],
        REGION_OUTLINE_COLOUR[2],
      );
      gl.uniform1f(
        composite.uniforms['uOpacity'] ?? null,
        REGION_LINE_OPACITY * frame.fade,
      );
      gl.uniform1f(composite.uniforms['uCoreLevel'] ?? null, regionCoreLevel());
      gl.uniform1f(composite.uniforms['uCoreSoft'] ?? null, 0.5 / halfWidth);
      gl.uniform1f(
        composite.uniforms['uEdgeSoft'] ?? null,
        REGION_EDGE_SOFT_PIXELS / halfWidth,
      );

      gl.bindVertexArray(fullScreenVertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.BLEND);
    },
    dispose(): void {
      coverage.dispose();
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
