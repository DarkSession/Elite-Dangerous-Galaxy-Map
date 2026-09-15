// Draws the galactic codex region boundaries as lines on the galactic plane. The pass
// runs after the tone map, over the finished frame, so it is an overlay and not a
// scene pass: no look constant of the far view changes it, and it changes none of them.
//
// The line is one soft warm band and it draws in three steps. The first step expands
// each segment into a screen-space quad and writes its coverage into a single-channel
// buffer with the MAX blend equation, so a join keeps the smallest distance rather than
// blending twice. The second step blurs that buffer along each axis, which rounds the 90
// degree corners of the traced set; it runs in `accurate` alone and only where the
// region grid cell reaches 3 CSS pixels on the screen. The third step reads the blurred
// buffer once, divides it by the kernel's own response at the ridge, and writes the tone
// over the frame.
import { toWorldPositions } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import type { RegionLines } from '../scene-data/types';
import vertexSource from './shaders/regions.vert?raw';
import fragmentSource from './shaders/regions.frag?raw';
import fullScreenSource from './shaders/fullscreen.vert?raw';
import blurSource from './shaders/region-blur.frag?raw';
import compositeSource from './shaders/region-composite.frag?raw';

/**
 * The colour of the boundary band. It is one warm cream and not a core inside an
 * outline: its luminance is 0.755, above every part of the frame but the core of the
 * galaxy itself, so the band lightens what it crosses.
 */
export const REGION_TONE: readonly [number, number, number] = [0.86, 0.74, 0.6];

/** How opaque a boundary line is where the overlay draws in full. */
export const REGION_LINE_OPACITY = 0.55;

/** The width of the whole line, in CSS pixels. Half of it is the ramp's own reach. */
export const REGION_LINE_WIDTH_CSS = 6;

/** The side of one cell of the region grid the traced set runs along, in light years. */
export const REGION_CELL_LY = 49.3494;

/**
 * The largest blur radius, in CSS pixels. The kernel holds `2 * ceil(radius) + 1` taps,
 * so the cap holds the count at 17.
 */
export const REGION_BLUR_MAX_RADIUS_CSS = 8;

/**
 * The smallest blur radius the pass runs at, in CSS pixels. Below it the kernel's
 * standard deviation is under one CSS pixel and the blur would soften by less than the
 * grid aliases. A cell under 3 CSS pixels is also under half the band's own width.
 */
export const REGION_BLUR_MIN_RADIUS_CSS = 3;

/** The zoom distance above which the overlay draws nothing, in light years. */
export const REGION_FADE_IN_FAR = 30000;

/** The zoom distance at and below which the overlay draws in full, in light years. */
export const REGION_FADE_IN_NEAR = 20000;

/**
 * The zoom distance at and below which the overlay draws nothing, in light years. The
 * traced staircase steps about 9 CSS pixels at this zoom and grows from there, and the
 * HUD's top bar names the region under the cursor at every zoom, so a line below this
 * distance carries no reading a user needs.
 */
export const REGION_CLOSE_NONE = 5000;

/** The zoom distance at and above which the close end draws the overlay in full. */
export const REGION_CLOSE_FULL = 10000;

/** The four corners of the ribbon quad, as a triangle strip. */
const RIBBON_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/** How many bytes one vertex of the boundary set takes. */
const VERTEX_BYTES = 12;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the overlay draws at a zoom distance, 0 to 1. It rises from nothing at
 * 5,000 light years to full at 10,000, holds to 20,000, and falls to nothing again at
 * 30,000. The two ends are the two zooms at which a boundary stops carrying a reading:
 * the traced staircase below the near one, and the whole galaxy above the far one.
 */
export function regionFade(distance: number): number {
  return (
    smoothstep(REGION_CLOSE_NONE, REGION_CLOSE_FULL, distance) *
    (1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance))
  );
}

/**
 * The blur radius for a frame, in CSS pixels. It is the region grid's own cell measured
 * on the screen at the cursor, capped at 8, and 0 in `simplified`, which never blurs
 * because the smoothed set has no staircase.
 *
 * The radius is the whole cell and not a part of it. The corner the blur has to round is
 * one whole cell tall and one whole cell wide, and a smaller share would stop the blur
 * above the zoom at which a user on a 720 row buffer first reads the overlay.
 */
export function regionBlurRadiusCss(
  focalCss: number,
  distance: number,
  traced: boolean,
): number {
  if (!traced || !(distance > 0)) return 0;
  return Math.min((focalCss * REGION_CELL_LY) / distance, REGION_BLUR_MAX_RADIUS_CSS);
}

/** True where the pass blurs. Below the least radius the kernel buys nothing. */
export function regionBlurRuns(radiusCss: number): boolean {
  return radiusCss >= REGION_BLUR_MIN_RADIUS_CSS;
}

/** How many taps a kernel of a radius holds. It reaches 17 at the cap and no more. */
export function regionBlurTaps(radiusCss: number): number {
  return 2 * Math.ceil(radiusCss) + 1;
}

/**
 * The kernel the blur shader reads, in tap order, summing to 1. It is a Gaussian of
 * standard deviation `radius / 3` CSS pixels sampled one CSS pixel apart.
 */
export function regionBlurKernel(radiusCss: number): number[] {
  const taps = regionBlurTaps(radiusCss);
  const middle = (taps - 1) / 2;
  const sigma = radiusCss / 3;
  const weights: number[] = [];
  let total = 0;
  for (let tap = 0; tap < taps; tap += 1) {
    const offset = tap - middle;
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    weights.push(weight);
    total += weight;
  }
  for (let tap = 0; tap < taps; tap += 1) {
    weights[tap] = (weights[tap] as number) / total;
  }
  return weights;
}

/**
 * The kernel's own response at the ridge, which normalises the blurred coverage.
 *
 * The coverage across a straight line is a triangular ridge, `max(0, 1 - gap /
 * halfWidth)`, and a blur lowers its peak. The pass divides by this reading, so the
 * band's peak alpha is the stated opacity at every radius. The sum runs the same
 * discrete kernel the shader runs, against the continuous ramp, so the number and the
 * kernel cannot drift apart. It takes no device pixel ratio: the normalisation is a
 * reading of the continuous ramp and not of the sampled one.
 */
export function regionBlurPeak(radiusCss: number, halfWidthCss: number): number {
  if (!regionBlurRuns(radiusCss)) return 1;
  const weights = regionBlurKernel(radiusCss);
  const middle = (weights.length - 1) / 2;
  let peak = 0;
  for (let tap = 0; tap < weights.length; tap += 1) {
    const offset = Math.abs(tap - middle);
    peak += (weights[tap] as number) * Math.max(0, 1 - offset / halfWidthCss);
  }
  return peak;
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
  /** The focal length of the frame in CSS pixels, which the blur radius reads. */
  readonly focalCss: number;
  /** The camera's distance to the cursor, in light years. The blur radius reads it. */
  readonly distance: number;
  /**
   * True draws the traced boundary set and false the smoothed one. The pass holds both,
   * so a change is a bind of another vertex array and not an upload.
   */
  readonly traced: boolean;
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

/** The three programs the overlay needs. */
export interface RegionPrograms {
  /** Writes segment coverage into the single-channel buffer. */
  readonly ribbon: Program;
  /** Blurs that buffer along one axis. */
  readonly blur: Program;
  /** Reads the blurred buffer and writes the band over the frame. */
  readonly composite: Program;
}

/** Compiles the ribbon program, the blur program and the composite program. */
export function createRegionPrograms(gl: WebGL2RenderingContext): RegionPrograms {
  return {
    ribbon: createProgram(gl, 'regions', vertexSource, fragmentSource, [
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uHalfWidth',
    ]),
    blur: createProgram(gl, 'region-blur', fullScreenSource, blurSource, [
      'uCoverage',
      'uStep',
      'uTaps',
      'uWeights',
    ]),
    composite: createProgram(
      gl,
      'region-composite',
      fullScreenSource,
      compositeSource,
      ['uCoverage', 'uTone', 'uOpacity', 'uPeak'],
    ),
  };
}

/** The single-channel target the ribbon step writes and the blur step reads. */
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
 * Creates one coverage target. `R8` holds the coverage alone: the second channel carried
 * the near fade this change removes. Eight bits are enough, because the coverage is a
 * distance against the half width and one part in 255 is a sixtieth of a device pixel at
 * the widths this pass draws.
 *
 * The target stays at the full drawing buffer size. At half resolution the sampled peak
 * of a straight run moves from 0.67 to 1.00 with the line's own phase, and one
 * normalisation cannot hold a peak that moves by a third.
 *
 * The filter is linear, which `R8` is filterable for. The blur steps one CSS pixel at a
 * time, which is not a whole texel at a device pixel ratio above 1.
 *
 * Every target takes its storage on the first draw, so the overlay costs no memory at
 * 30,000 light years and above.
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
  traced: RegionLines = lines,
): RegionPass {
  const cornerBuffer = gl.createBuffer();
  if (cornerBuffer === null) {
    throw new Error('The context gave no buffer for the region boundaries.');
  }
  // The corner steps once per vertex of the quad. The two endpoints step once per
  // segment, and the draw loop points them at the chain it is about to draw. The two
  // sets share it.
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, RIBBON_CORNERS, gl.STATIC_DRAW);

  /** One set, uploaded once, with the vertex array that reads it. */
  interface Uploaded {
    readonly set: RegionLines;
    readonly vertexArray: WebGLVertexArrayObject;
    readonly positionBuffer: WebGLBuffer;
  }

  const upload = (set: RegionLines): Uploaded => {
    const vertexArray = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    if (vertexArray === null || positionBuffer === null) {
      throw new Error('The context gave no buffer for the region boundaries.');
    }
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, toWorldPositions(set.positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribDivisor(0, 1);
    gl.vertexAttribDivisor(1, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { set, vertexArray, positionBuffer };
  };

  const smoothedUpload = upload(lines);
  // The two sets hold the same chain count, so a chain of one is the same boundary as the
  // chain of the same index in the other.
  const tracedUpload = traced === lines ? smoothedUpload : upload(traced);

  const coverage = createCoverageTarget(gl);
  // The blur is separable, so it needs one target for each axis. The pair is the same
  // size and the same format as the coverage itself.
  const blurFirst = createCoverageTarget(gl);
  const blurSecond = createCoverageTarget(gl);

  const drawFullScreen = (): void => {
    gl.bindVertexArray(fullScreenVertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  /** One axis of the blur, from a texture into a target. */
  const blurAxis = (
    program: Program,
    source: WebGLTexture,
    target: CoverageTarget,
    width: number,
    height: number,
    stepX: number,
    stepY: number,
    weights: number[],
  ): void => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(program.uniforms['uCoverage'] ?? null, 0);
    gl.uniform2f(program.uniforms['uStep'] ?? null, stepX, stepY);
    gl.uniform1i(program.uniforms['uTaps'] ?? null, weights.length);
    gl.uniform1fv(program.uniforms['uWeights'] ?? null, weights);
    drawFullScreen();
  };

  return {
    count: lines.chainCount,
    coverageSize(): [number, number] | null {
      return coverage.size();
    },
    draw(frame: RegionPassFrame): void {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const halfWidthCss = REGION_LINE_WIDTH_CSS / 2;
      const halfWidth = halfWidthCss * frame.pixelRatio;
      const drawn = frame.traced ? tracedUpload : smoothedUpload;
      const radiusCss = regionBlurRadiusCss(
        frame.focalCss,
        frame.distance,
        frame.traced,
      );
      const blurs = regionBlurRuns(radiusCss);
      coverage.resize(width, height);
      // The pair takes its storage only in a frame that blurs. `simplified` never blurs,
      // so the mode the map starts in holds one target and not three.
      if (blurs) {
        blurFirst.resize(width, height);
        blurSecond.resize(width, height);
      }

      // Step one: the coverage of every segment, largest value wins. The MAX equation
      // keeps the smallest distance where two quads of one join overlap.
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

      gl.bindVertexArray(drawn.vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, drawn.positionBuffer);
      // One instanced call per chain. A segment reads the shared vertex array at two
      // offsets one vertex apart, so the endpoints need no second buffer.
      for (let chain = 0; chain < drawn.set.chainCount; chain += 1) {
        const first = drawn.set.first[chain] as number;
        const segments = (drawn.set.last[chain] as number) - first;
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
      gl.disable(gl.BLEND);

      // Step two: the blur, one pass on each axis. It runs in the traced mode alone and
      // only where the region grid cell reaches 3 CSS pixels on the screen. The radius
      // and the decision are read at the head of the draw, because they say whether the
      // ping-pong pair takes storage at all.
      let read = coverage.texture;
      if (blurs) {
        const weights = regionBlurKernel(radiusCss);
        // The step is one CSS pixel, so the tap count follows the zoom and not the
        // display.
        const stepX = frame.pixelRatio / width;
        const stepY = frame.pixelRatio / height;
        blurAxis(
          programs.blur,
          coverage.texture,
          blurFirst,
          width,
          height,
          stepX,
          0,
          weights,
        );
        blurAxis(
          programs.blur,
          blurFirst.texture,
          blurSecond,
          width,
          height,
          0,
          stepY,
          weights,
        );
        read = blurSecond.texture;
      }

      // Step three: the band, over the finished frame.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const composite = programs.composite;
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read);
      gl.uniform1i(composite.uniforms['uCoverage'] ?? null, 0);
      gl.uniform3f(
        composite.uniforms['uTone'] ?? null,
        REGION_TONE[0],
        REGION_TONE[1],
        REGION_TONE[2],
      );
      gl.uniform1f(
        composite.uniforms['uOpacity'] ?? null,
        REGION_LINE_OPACITY * frame.fade,
      );
      gl.uniform1f(
        composite.uniforms['uPeak'] ?? null,
        blurs ? regionBlurPeak(radiusCss, halfWidthCss) : 1,
      );

      drawFullScreen();
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.BLEND);
    },
    dispose(): void {
      coverage.dispose();
      blurFirst.dispose();
      blurSecond.dispose();
      gl.deleteBuffer(cornerBuffer);
      for (const held of new Set([smoothedUpload, tracedUpload])) {
        gl.deleteBuffer(held.positionBuffer);
        gl.deleteVertexArray(held.vertexArray);
      }
    },
  };
}
