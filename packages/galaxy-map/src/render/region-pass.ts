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
// each side at the reference range, which is 17.28 CSS pixels at 1,080 rows, and the
// coverage is an exact distance to the segment blended with MAX, so the sharpest corner of
// the traced set is already a round turn of that half width. What the width does not do is
// hide the raster: the traced set is a smoothed line and reads 0.06 CSS pixels of roughness
// at the nearest range that draws, against the lattice polyline's 1.26.
import { smoothStep } from '../math';
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
 * The share of the coverage channel the band's edge takes. The top of the band is flat
 * over the rest of its width.
 *
 * The edge was 4 CSS pixels, capped at a quarter of the half width. The half width now
 * follows the range, so a fixed number of CSS pixels would be a quarter of the band at
 * the near end of the range and the whole of it at the far end, and the band would change
 * its profile as it narrows. A share keeps one profile at every width.
 */
export const REGION_EDGE_SHARE = 0.25;

/**
 * The share of the band's whole width the core takes. The core is a part of the band, so
 * it is a share and grows with it: 8.6 CSS pixels across at 1,080 rows against the
 * band's 34.6.
 */
export const REGION_CORE_SHARE = 0.25;

/**
 * Half the width of the transition from the outer tone to the core tone, as a share of
 * the coverage channel. It is 1.5 CSS pixels over the 17.28 half width of 1,080 rows,
 * which is the width the old fixed rule gave at the reference range, held as a share for
 * the same reason the edge is.
 */
export const REGION_CORE_EDGE_SHARE = 0.087;

/** The side of one cell of the region grid the traced set runs along, in light years. */
export const REGION_CELL_LY = 49.3494;

/** The share of the viewport height the band's half width takes. */
export const REGION_BAND_HALF_WIDTH_SHARE = 0.016;

/** The smallest half width the band takes, in CSS pixels. */
export const REGION_BAND_HALF_WIDTH_MIN_CSS = 8;

/** The largest half width the band takes, in CSS pixels. */
export const REGION_BAND_HALF_WIDTH_MAX_CSS = 24;

/**
 * The smallest half width the band takes at any range, in CSS pixels. It binds at a range
 * of 103,680 light years at 1,080 rows, which is beyond the far rim of the galaxy from
 * any view the map draws, so it is there to keep a far line drawn and not to shape it.
 */
export const REGION_BAND_HALF_WIDTH_FLOOR_CSS = 2;

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
 *
 * The figure is 5,000 light years. It was 8,000, which took the lines away further out
 * than the owner wants.
 */
export const REGION_RANGE_NONE = 5000;

/**
 * The range at and above which a line draws in full, in light years. The figure is
 * 8,000. It was 12,000, which is now `REGION_WIDTH_RANGE` alone.
 */
export const REGION_RANGE_FULL = 8000;

/**
 * The range at which the band carries its base width, in light years. Beyond it the
 * half width falls as `1 / range`.
 *
 * This is the width's own figure and not the range at which the fade reaches full. The
 * two were one constant. They are two now: the fade says where a line draws, and this
 * range says how wide it is.
 */
export const REGION_WIDTH_RANGE = 12000;

/** The four corners of the ribbon quad, as a triangle strip. */
const RIBBON_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/** How many bytes one vertex of the boundary set takes. */
const VERTEX_BYTES = 12;

/**
 * How much of the overlay draws at a zoom distance, 0 to 1. It is full at 20,000 light
 * years and below and falls to nothing at 30,000, which is the zoom at which the whole
 * galaxy is in the frame and a boundary stops carrying a reading.
 *
 * The close end of the band is gone from this rule. The range fade in the composite
 * shader holds it per pixel, so a close zoom keeps the lines near the horizon.
 */
export function regionFade(distance: number): number {
  return 1 - smoothStep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance);
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

/**
 * The band's half width at one range, in CSS pixels. It is the base width at the
 * reference range and nearer, and it falls as `1 / range` beyond it, held at the floor.
 *
 * The band bounds an area of the galactic plane, so it belongs to the picture and takes a
 * size in the picture. A band that held 34.6 CSS pixels at every range covered a region on
 * the far side of the galaxy from edge to edge.
 *
 * The shader works this out per vertex. This function is the same rule on the processor,
 * for the tests and for the view searches.
 */
export function regionBandHalfWidthAtRange(
  viewportHeightCss: number,
  range: number,
): number {
  const base = regionBandHalfWidthCss(viewportHeightCss);
  const width = (base * REGION_WIDTH_RANGE) / Math.max(range, 1);
  return Math.min(base, Math.max(REGION_BAND_HALF_WIDTH_FLOOR_CSS, width));
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
      'uBaseHalfWidth',
      'uFloorHalfWidth',
      'uReferenceRange',
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
): RegionPass {
  const cornerBuffer = gl.createBuffer();
  if (cornerBuffer === null) {
    throw new Error('The context gave no buffer for the region boundaries.');
  }
  // The corner steps once per vertex of the quad. The two endpoints step once per
  // segment, and the draw loop points them at the chain it is about to draw.
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

  const drawn = upload(lines);

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
      const floorHalfWidth = REGION_BAND_HALF_WIDTH_FLOOR_CSS * frame.pixelRatio;
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
      gl.uniform1f(ribbon.uniforms['uBaseHalfWidth'] ?? null, halfWidth);
      gl.uniform1f(ribbon.uniforms['uFloorHalfWidth'] ?? null, floorHalfWidth);
      // The reference range is the range at which the band carries its base width. It is
      // its own constant, and it is not the range at which the fade reaches full.
      gl.uniform1f(ribbon.uniforms['uReferenceRange'] ?? null, REGION_WIDTH_RANGE);

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
      // The two shares of the coverage channel the profile reads. Both are constants: the
      // coverage is already normalised by the half width, so a share is a fixed part of
      // the band at every width and the profile does not change as the band narrows.
      gl.uniform1f(composite.uniforms['uEdgeShare'] ?? null, REGION_EDGE_SHARE);
      gl.uniform1f(composite.uniforms['uCoreEdge'] ?? null, REGION_CORE_EDGE_SHARE);
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
      gl.deleteBuffer(drawn.positionBuffer);
      gl.deleteVertexArray(drawn.vertexArray);
    },
  };
}
