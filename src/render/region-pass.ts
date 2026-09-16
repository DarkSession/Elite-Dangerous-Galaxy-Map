// Draws the galactic codex region boundaries as lines on the galactic plane. The pass
// runs after the tone map, over the finished frame, so it is an overlay and not a
// scene pass: no look constant of the far view changes it, and it changes none of them.
//
// The line is a band of two tones, a deeper outer part with a lighter core down its
// middle, and it draws in two steps. The first step expands each segment into a
// screen-space quad and writes its coverage into a single-channel buffer with the MAX
// blend equation, so a join keeps the smallest distance rather than blending twice. The
// second step reads that buffer once and writes both tones over the frame: the coverage
// carries the alpha and the tone, so one channel holds the whole band.
//
// The pass does not smooth the coverage. The band is 1.6 per cent of the viewport height
// each side, which is 17.28 CSS pixels at 1,080 rows, and the coverage is an exact
// distance to the segment blended with MAX, so the sharpest corner of the traced set is
// already a round turn of that half width. What the width does not do is hide the
// raster: both sets are smoothed lines, and the drawn `accurate` set reads 0.06 CSS
// pixels of roughness at the nearest range that draws against the lattice polyline's
// 1.26.
import { toWorldPositions } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import type { RegionLines } from '../scene-data/types';
import vertexSource from './shaders/regions.vert?raw';
import fragmentSource from './shaders/regions.frag?raw';
import fullScreenSource from './shaders/fullscreen.vert?raw';
import compositeSource from './shaders/region-composite.frag?raw';

/**
 * The tone of the outer part of the boundary band, a deep amber. Its luminance is 0.581,
 * which is below the tone-mapped galactic core and above the dark space between the
 * arms, so the band lightens most of the picture and darkens the brightest part of it.
 */
export const REGION_TONE: readonly [number, number, number] = [0.74, 0.55, 0.43];

/**
 * The tone of the core of the band, a light amber of the same hue family. Its luminance
 * is 0.794, which stands 0.213 above the outer tone. At the opacity below that is 0.132
 * of luminance in the frame, whatever the picture under the band, so a boundary reads as
 * a line and not as a wash of colour.
 */
export const REGION_TONE_CORE: readonly [number, number, number] = [0.9, 0.79, 0.52];

/** How opaque a boundary line is where the overlay draws in full, for both tones. */
export const REGION_LINE_OPACITY = 0.62;

/**
 * The width of the band's edge, in CSS pixels. The top of the band is flat over the rest
 * of its width. The edge is fixed in CSS pixels and not a share of the half width
 * because it is a crispness and not a size: a share would read as sharp on a small
 * window and soft on a large one.
 */
export const REGION_EDGE_CSS = 4;

/**
 * The largest share of the half width the edge takes. At the half width floor of 8 CSS
 * pixels a fixed 4 CSS pixel edge would take half of the half width, and the band would
 * read as a core with a ramp around it and no outer part. The quarter leaves the outer
 * part 2.5 CSS pixels of flat top there.
 */
export const REGION_EDGE_MAX_SHARE = 0.25;

/**
 * The share of the band's whole width the core takes. The core is a part of the band, so
 * it is a share and grows with it: 8.6 CSS pixels across at 1,080 rows against the
 * band's 34.6.
 */
export const REGION_CORE_SHARE = 0.25;

/**
 * The width of the transition from the outer tone to the core tone, in CSS pixels. It is
 * fixed, as the edge is, so the two tones meet over the same short ramp at every
 * viewport.
 */
export const REGION_CORE_EDGE_CSS = 1.5;

/** The side of one cell of the region grid the traced set runs along, in light years. */
export const REGION_CELL_LY = 49.3494;

/** The share of the viewport height the band's half width takes. */
export const REGION_BAND_HALF_WIDTH_SHARE = 0.016;

/** The smallest half width the band takes, in CSS pixels. */
export const REGION_BAND_HALF_WIDTH_MIN_CSS = 8;

/** The largest half width the band takes, in CSS pixels. */
export const REGION_BAND_HALF_WIDTH_MAX_CSS = 24;

/** The zoom distance above which the overlay draws nothing, in light years. */
export const REGION_FADE_IN_FAR = 30000;

/** The zoom distance at and below which the overlay draws in full, in light years. */
export const REGION_FADE_IN_NEAR = 20000;

/**
 * The range at and below which a line draws nothing, in light years. The range is read
 * per pixel, from the camera to the plane point the pixel sees, and not from the zoom.
 *
 * A close zoom therefore keeps the lines near the horizon, where the plane is far, and
 * takes away the lines near the cursor, where one band would cross the whole frame. The
 * region labels read the same two figures at their own plane anchor, so a name and the
 * line under it read at the same strength.
 */
export const REGION_RANGE_NONE = 10000;

/** The range at and above which a line draws in full, in light years. */
export const REGION_RANGE_FULL = 20000;

/** The four corners of the ribbon quad, as a triangle strip. */
const RIBBON_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/** How many bytes one vertex of the boundary set takes. */
const VERTEX_BYTES = 12;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the overlay draws at a zoom distance, 0 to 1. It is full at 20,000 light
 * years and below and falls to nothing at 30,000, which is the zoom at which the whole
 * galaxy is in the frame and a boundary stops carrying a reading.
 *
 * The close end of the band is gone from this rule. The range fade in the composite
 * shader holds it per pixel, so a close zoom keeps the lines near the horizon.
 */
export function regionFade(distance: number): number {
  return 1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance);
}

/**
 * The band's half width for a viewport, in CSS pixels. It is 1.6 per cent of the
 * viewport height, held between 8 and 24, so the whole band runs from 16 to 48 CSS
 * pixels and measures 34.6 at 1,080 rows.
 *
 * The width is a share of the viewport and not a fixed number because the band is wide.
 * A fixed 34.6 CSS pixels would cover a tenth of a 360 row window and a sixtieth of a
 * 2,160 row one, and the boundary would read as a different thing on each. The clamp
 * acts at 500 CSS rows and below, and at 1,500 and above.
 */
export function regionBandHalfWidthCss(viewportHeightCss: number): number {
  const share = REGION_BAND_HALF_WIDTH_SHARE * viewportHeightCss;
  if (!(share > REGION_BAND_HALF_WIDTH_MIN_CSS)) return REGION_BAND_HALF_WIDTH_MIN_CSS;
  return Math.min(share, REGION_BAND_HALF_WIDTH_MAX_CSS);
}

/** The two shares of the coverage channel the composite reads the band's profile with. */
export interface RegionBandShares {
  /**
   * The share of the coverage the edge takes, which is `min(0.25, 4 / halfWidth)`. The
   * alpha is `smoothstep(0, edgeShare, coverage)`, so the band has a flat top and an
   * edge of 4 CSS pixels, or a quarter of the half width where that is less.
   */
  readonly edgeShare: number;
  /**
   * Half the width of the transition to the core tone, as a share of the coverage. The
   * tone runs from the outer one to the core one over `0.75 -/+ coreEdge`, which is 1.5
   * CSS pixels each side of the core's own edge.
   */
  readonly coreEdge: number;
}

/**
 * The two shares of the coverage channel for a half width in CSS pixels. The coverage is
 * `1 - gap / halfWidth`, so a width in CSS pixels becomes a share by one divide.
 *
 * The pass works the half width out for the ribbon quads already, so both shares cost
 * one divide on the processor and no new state.
 */
export function regionBandShares(halfWidthCss: number): RegionBandShares {
  const half = Math.max(halfWidthCss, 1e-6);
  return {
    edgeShare: Math.min(REGION_EDGE_MAX_SHARE, REGION_EDGE_CSS / half),
    coreEdge: REGION_CORE_EDGE_CSS / half,
  };
}

/** What one region pass draw needs. */
export interface RegionPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The inverse of `viewProjection`, which the composite unprojects a pixel with. */
  readonly inverseViewProjection: Float32Array;
  /** The galactic plane in the camera-relative world frame, which is `-camera.y`. */
  readonly planeY: number;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** How much of the overlay draws, 0 to 1. */
  readonly fade: number;
  /** How many device pixels one CSS pixel holds. */
  readonly pixelRatio: number;
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

/** The two programs the overlay needs. */
export interface RegionPrograms {
  /** Writes segment coverage into the single-channel buffer. */
  readonly ribbon: Program;
  /** Reads the coverage buffer and writes the band over the frame. */
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
        'uTone',
        'uToneCore',
        'uOpacity',
        'uEdgeShare',
        'uCoreEdge',
        'uInverseViewProjection',
        'uPlaneY',
        'uRangeNone',
        'uRangeFull',
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
 * Creates the coverage target. `R8` holds the coverage alone: the second channel carried
 * a near fade an earlier change removed. Eight bits are enough, because the coverage is a
 * distance against the half width and one part in 255 is a two hundredth of a device
 * pixel at the widths this pass draws.
 *
 * The target stays at the full drawing buffer size. At half resolution the sampled peak
 * of a straight run moves with the line's own phase, and the composite reads the peak.
 *
 * The filter is linear, which `R8` is filterable for.
 *
 * The target takes its storage on the first draw, so the overlay costs no memory at
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

  const drawFullScreen = (): void => {
    gl.bindVertexArray(fullScreenVertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  return {
    count: lines.chainCount,
    coverageSize(): [number, number] | null {
      return coverage.size();
    },
    draw(frame: RegionPassFrame): void {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      // The half width follows the viewport and not the drawing buffer, so the band
      // covers the same part of the screen at every device pixel ratio.
      const halfWidthCss = regionBandHalfWidthCss(height / frame.pixelRatio);
      const halfWidth = halfWidthCss * frame.pixelRatio;
      const drawn = frame.traced ? tracedUpload : smoothedUpload;
      coverage.resize(width, height);

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

      // Step two: the band, over the finished frame.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const composite = programs.composite;
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverage.texture);
      gl.uniform1i(composite.uniforms['uCoverage'] ?? null, 0);
      gl.uniform3f(
        composite.uniforms['uTone'] ?? null,
        REGION_TONE[0],
        REGION_TONE[1],
        REGION_TONE[2],
      );
      gl.uniform3f(
        composite.uniforms['uToneCore'] ?? null,
        REGION_TONE_CORE[0],
        REGION_TONE_CORE[1],
        REGION_TONE_CORE[2],
      );
      gl.uniform1f(
        composite.uniforms['uOpacity'] ?? null,
        REGION_LINE_OPACITY * frame.fade,
      );
      // The two shares of the coverage channel the profile reads. Both follow the half
      // width in CSS pixels, which the ribbon step worked out above.
      const shares = regionBandShares(halfWidthCss);
      gl.uniform1f(composite.uniforms['uEdgeShare'] ?? null, shares.edgeShare);
      gl.uniform1f(composite.uniforms['uCoreEdge'] ?? null, shares.coreEdge);
      gl.uniformMatrix4fv(
        composite.uniforms['uInverseViewProjection'] ?? null,
        false,
        frame.inverseViewProjection,
      );
      gl.uniform1f(composite.uniforms['uPlaneY'] ?? null, frame.planeY);
      gl.uniform1f(composite.uniforms['uRangeNone'] ?? null, REGION_RANGE_NONE);
      gl.uniform1f(composite.uniforms['uRangeFull'] ?? null, REGION_RANGE_FULL);

      drawFullScreen();
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.BLEND);
    },
    dispose(): void {
      coverage.dispose();
      gl.deleteBuffer(cornerBuffer);
      for (const held of new Set([smoothedUpload, tracedUpload])) {
        gl.deleteBuffer(held.positionBuffer);
        gl.deleteVertexArray(held.vertexArray);
      }
    },
  };
}
