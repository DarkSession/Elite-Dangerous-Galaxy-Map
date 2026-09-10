// Draws the galactic codex region boundaries as lines on the galactic plane. The pass
// runs after the tone map, over the finished frame, so it is an overlay and not a
// scene pass: no look constant of the far view changes it, and it changes none of them.
//
// The line is a two-tone ribbon and it draws in two steps. The first step cuts each
// primitive into sub-chords, expands every sub-chord into a screen-space quad and
// writes its coverage into a single-channel buffer with the MAX blend equation, so a
// join keeps the smallest distance rather than blending twice. The second step reads
// that buffer once and writes the core colour and the outline colour over the frame.
//
// A primitive is an arc with a signed curvature, and a curvature of zero is a straight
// line. The sub-chords are what put a curve on the screen: the fragment shader
// measures distance in screen pixels, which holds the line to 4 CSS pixels at any
// obliquity, and a circle on the plane projects to a conic that no cheap distance
// field answers. So the pass keeps the fragment shader as it is and cuts the curve up
// here.
import { toWorldPositions } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import { NEAR_PLANE } from '../camera/projection';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import { arcThrough } from '../scene-data/arc';
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

/**
 * How far a sub-chord may sit from the arc it cuts across, in CSS pixels.
 *
 * The value comes from a sweep of 0.5, 0.25 and 0.125 read in the browser, on the run
 * the no-facet test walks: a curve of 5,913 light years radius at a zoom of 8,000, whose
 * drawn direction the test fits over a window of 12 CSS pixels.
 *
 * **What the reading is made of.** The arc itself turns **1.492 degrees** over one
 * window, because a circle of radius R turns `window / R`. That is the floor and no
 * sagitta reaches below it. The measure carries about **0.5 degrees** of its own,
 * because it takes the drawn line's position from a weighted centroid and a fraction of
 * a pixel of error over a 12 pixel baseline is a fraction of a degree. The rest is the
 * sub-chord expansion, and it is what this constant buys: **0.31 degrees at 0.5, and
 * nothing measurable at 0.25 or below**.
 *
 * The reading is 2.283 degrees at 0.5, 1.977 at 0.25 and 2.192 at 0.125, against the
 * bound of 3 the drawn scenario holds. It stops falling at 0.25: the rise at 0.125 sits
 * inside the measure's own noise, so the tighter value adds no smoothness the frame can
 * show and costs 41 percent more sub-chords, 127 against 90, and 41 percent more
 * instances, 40,663 against 28,842. The frame budget reads the same at all three, 1.54
 * ms against 16.7, so the cost is not what decides it.
 */
export const REGION_SUB_SEGMENT_SAGITTA_CSS = 0.25;

/**
 * The largest number of sub-chords one primitive takes. It bounds the work of a frame
 * and it is never reached inside the zoom band: measured over the built set from 500
 * to 30,000 light years at 1920x1080, the worst chain asks for 90.
 */
export const REGION_MAX_SUB_SEGMENTS = 256;

/** The four corners of the ribbon quad, as a triangle strip. */
const RIBBON_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/** How many bytes one vertex of the boundary set takes. */
const VERTEX_BYTES = 12;

/** How many bytes one curvature of the boundary set takes. */
const CURVATURE_BYTES = 4;

/** The sweep and the radius of one arc, which is all the sub-chord count reads. */
export interface RegionArc {
  /** The angle the arc turns through, in radians. It carries the sign of the curvature. */
  readonly sweep: number;
  /** The radius, in light years. */
  readonly radius: number;
}

/**
 * The arcs of every chain of a boundary set, straight primitives left out.
 *
 * A straight primitive has no sagitta at any sub-chord count, so it asks for nothing
 * and the count reads the arcs alone.
 */
export function regionChainArcs(lines: RegionLines): RegionArc[][] {
  const chains: RegionArc[][] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    const arcs: RegionArc[] = [];
    for (let vertex = first; vertex < last; vertex += 1) {
      const curvature = lines.curvature[vertex] as number;
      if (curvature === 0) continue;
      const arc = arcThrough(
        lines.positions[vertex * 3] as number,
        lines.positions[vertex * 3 + 2] as number,
        lines.positions[(vertex + 1) * 3] as number,
        lines.positions[(vertex + 1) * 3 + 2] as number,
        curvature,
      );
      arcs.push({ sweep: arc.sweep, radius: arc.radius });
    }
    chains.push(arcs);
  }
  return chains;
}

/**
 * The smallest number of light years one CSS pixel covers anywhere in a frame.
 *
 * A point of the galactic plane is never nearer the camera than the camera's own
 * height above the plane, and the point of the frame that sits at the widest angle
 * from the view axis is a corner. So the smallest depth along that axis is the height
 * times the cosine of the corner angle, and the scale follows from the focal length in
 * CSS pixels. The height takes the near plane as its floor, because a camera on the
 * plane itself asks for a scale of zero.
 */
export function smallestLightYearsPerPixel(
  cameraHeightLy: number,
  widthCss: number,
  heightCss: number,
): number {
  const tanUp = Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360);
  const tanAcross = (tanUp * widthCss) / heightCss;
  const focal = heightCss / (2 * tanUp);
  const widest = Math.sqrt(1 + tanAcross * tanAcross + tanUp * tanUp);
  return Math.max(NEAR_PLANE, Math.abs(cameraHeightLy)) / (focal * widest);
}

/**
 * How many sub-chords one primitive of a chain takes at a zoom.
 *
 * The count comes from the **sagitta** and not from the turn. The sagitta of a
 * sub-chord over a sub-angle is `R (1 - cos(sub / 2))`, so at a fixed sub-angle it
 * grows with the radius: a wide gentle arc facets before a tight one does. The count
 * is the smallest whose sagitta, in CSS pixels, stays under the bound.
 *
 * One number covers a whole draw call, which is one chain, because the expansion runs
 * on the attribute divisor. So the count answers for the worst arc of that chain at
 * the zoom of this frame, and a chain of tight local arcs does not pay for a 25,000
 * light year curve in another chain.
 */
export function regionSubSegments(
  arcs: readonly RegionArc[],
  lightYearsPerPixel: number,
): number {
  const budget = REGION_SUB_SEGMENT_SAGITTA_CSS * lightYearsPerPixel;
  let count = 1;
  for (const arc of arcs) {
    // A budget of two radii or more holds the whole circle, so one sub-chord does.
    if (budget >= 2 * arc.radius) continue;
    const subAngle = Math.acos(Math.min(1, Math.max(-1, 1 - budget / arc.radius)));
    if (subAngle <= 0) return REGION_MAX_SUB_SEGMENTS;
    const wanted = Math.ceil(Math.abs(arc.sweep) / (2 * subAngle));
    if (wanted > count) count = wanted;
  }
  return Math.min(REGION_MAX_SUB_SEGMENTS, Math.max(1, count));
}

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
  /**
   * The smallest number of light years one CSS pixel covers anywhere in the frame.
   * The sub-chord count of every chain reads it, so a curve holds its sagitta under
   * a quarter of a CSS pixel wherever it is drawn.
   */
  readonly lightYearsPerPixel: number;
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
      'uSubCount',
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
  const curvatureBuffer = gl.createBuffer();
  const cornerBuffer = gl.createBuffer();
  if (
    vertexArray === null ||
    positionBuffer === null ||
    curvatureBuffer === null ||
    cornerBuffer === null
  ) {
    throw new Error('The context gave no buffer for the region boundaries.');
  }

  gl.bindVertexArray(vertexArray);

  // The corner steps once per vertex of the quad, so its divisor stays 0. The two
  // endpoints and the curvature step once per primitive, and the draw loop points them
  // at the chain it is about to draw and sets their divisor to its sub-chord count.
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, RIBBON_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, toWorldPositions(lines.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);

  // The curvature is one value per vertex, indexed as the vertices are, so it binds at
  // the same per-chain offset as the positions. The world frame the card reads negates
  // `z`, and the shader turns the other way for it, so the value travels unchanged.
  gl.bindBuffer(gl.ARRAY_BUFFER, curvatureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, lines.curvature, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const chainArcs = regionChainArcs(lines);
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
      // One instanced call per chain. A primitive reads the shared vertex array at two
      // offsets one vertex apart, so the endpoints need no second buffer. The divisor
      // holds a primitive's three attributes over the sub-chords it takes, and the
      // shader reads the sub-index from `gl_InstanceID`.
      for (let chain = 0; chain < lines.chainCount; chain += 1) {
        const first = lines.first[chain] as number;
        const segments = (lines.last[chain] as number) - first;
        if (segments < 1) continue;
        const sub = regionSubSegments(
          chainArcs[chain] as RegionArc[],
          frame.lightYearsPerPixel,
        );
        gl.uniform1i(ribbon.uniforms['uSubCount'] ?? null, sub);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
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
        gl.bindBuffer(gl.ARRAY_BUFFER, curvatureBuffer);
        gl.vertexAttribPointer(
          3,
          1,
          gl.FLOAT,
          false,
          CURVATURE_BYTES,
          first * CURVATURE_BYTES,
        );
        gl.vertexAttribDivisor(0, sub);
        gl.vertexAttribDivisor(1, sub);
        gl.vertexAttribDivisor(3, sub);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segments * sub);
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
      gl.deleteBuffer(curvatureBuffer);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
