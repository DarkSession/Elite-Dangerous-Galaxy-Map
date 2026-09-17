// Draws the shape set: the spheres first, then the lines. The pass runs after the tone
// map and after the region boundaries, over the finished frame, so it is an overlay and
// not a scene pass: no look constant of the far view changes it, and it changes none of
// them. The markers draw after it, because a marker is what the user clicks.
//
// A sphere is one instanced screen-aligned quad with a limb-brightening falloff, so a
// full set costs one draw call.
//
// A line draws in two steps, as the region band does. Each segment writes into an RGBA8
// buffer at frame size with the MAX blend equation, so the two quads of one join blend
// once and a corner carries no brighter dot. A full-screen pass then writes that buffer
// over the frame. Every segment of every line draws in one instanced call, so the whole
// pass costs three calls whatever the set holds.
import { createProgram } from './program';
import type { Program } from './program';
import type { ShapeSet } from '../scene-data/shapes';
import { MAX_LINE_POINTS, MAX_LINES, MAX_SPHERES } from '../scene-data/shapes';
import sphereVertexSource from './shaders/spheres.vert?raw';
import sphereFragmentSource from './shaders/spheres.frag?raw';
import lineVertexSource from './shaders/shape-lines.vert?raw';
import lineFragmentSource from './shaders/shape-lines.frag?raw';
import fullScreenSource from './shaders/fullscreen.vert?raw';
import compositeSource from './shaders/shape-composite.frag?raw';

/** The smallest drawn radius a sphere draws at, in CSS pixels. */
export const SPHERE_MIN_RADIUS_CSS = 1;

/** How many floats one sphere instance carries: the centre, the radius, the colour, the opacity. */
const SPHERE_FLOATS = 8;

/** How many floats one segment instance carries: the two ends, the colour, the half width. */
const SEGMENT_FLOATS = 10;

/** The largest number of segments the lines of a set hold. */
const MAX_SEGMENTS = MAX_LINE_POINTS + MAX_LINES;

/** The four corners of the sphere quad, as a triangle strip. */
const SPHERE_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

/** The four corners of the ribbon quad, as a triangle strip. */
const RIBBON_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/**
 * The alpha of a sphere at a distance from the middle of its sprite, as a share of the
 * drawn radius. `spheres.frag` holds the same rule, as `glowAlpha` holds the rule of the
 * marker glow, so a unit test reads it at its own resolution and not at the resolution of
 * a screenshot.
 *
 * It is the path length through a thin shell at an impact parameter. It is the sphere's
 * own opacity at the middle and rises to 1 at the limb, so the sphere reads as a shell
 * and not as a disc. At and beyond the limb it is 0: nothing draws where the path length
 * is unbounded.
 */
export function sphereAlpha(share: number, opacity: number): number {
  const r = Math.abs(share);
  if (r >= 1) return 0;
  return Math.min(1, opacity / Math.sqrt(1 - r * r));
}

/** What one shape pass draw needs. */
export interface ShapePassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The camera position in game coordinates. */
  readonly camera: readonly [number, number, number];
  /** How many device pixels one CSS pixel holds. */
  readonly pixelRatio: number;
  /** The focal length in device pixels. */
  readonly focal: number;
  /** The set to draw. */
  readonly set: ShapeSet;
}

/** The shape overlay pass. */
export interface ShapePass {
  /** Draws the set and gives back how many draw calls it issued. */
  draw(frame: ShapePassFrame): number;
  /** How many draw calls the last draw issued. */
  drawCalls(): number;
  /** The size of the line buffer in device pixels, or null while it holds none. */
  lineBufferSize(): [number, number] | null;
  dispose(): void;
}

/** The three programs the shape overlay needs. */
export interface ShapePrograms {
  /** Draws one quad per sphere over the frame. */
  readonly spheres: Program;
  /** Writes one quad per line segment into the line buffer. */
  readonly lines: Program;
  /** Reads the line buffer and writes it over the frame. */
  readonly composite: Program;
}

/** Compiles the three shape programs. */
export function createShapePrograms(gl: WebGL2RenderingContext): ShapePrograms {
  return {
    spheres: createProgram(gl, 'spheres', sphereVertexSource, sphereFragmentSource, [
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uFocal',
      'uMinRadius',
    ]),
    lines: createProgram(gl, 'shape-lines', lineVertexSource, lineFragmentSource, [
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uPixelRatio',
    ]),
    composite: createProgram(gl, 'shape-composite', fullScreenSource, compositeSource, [
      'uLines',
    ]),
  };
}

/** The frame-size colour target the line step writes and the composite step reads. */
interface LineTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  /** Matches the target to a drawing buffer size. */
  resize(width: number, height: number): void;
  /** The current size, or null while the target holds no storage. */
  size(): [number, number] | null;
  dispose(): void;
}

/**
 * Creates the line target. `RGBA8` holds the premultiplied colour and the coverage of the
 * ribbons, which is what the MAX equation compares.
 *
 * The target takes its storage on the first draw that holds a segment, so a map with no
 * line costs no memory for it.
 */
function createLineTarget(gl: WebGL2RenderingContext): LineTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (texture === null || framebuffer === null) {
    throw new Error('The context gave no target for the shape lines.');
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
        gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
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
 * Writes the sphere instances and gives back how many there are. The centre goes in the
 * world frame, whose third axis runs the other way to the game's, and it stays an
 * absolute position: the draw passes the camera subtraction as a uniform, as the region
 * boundary pass does.
 */
export function buildSphereInstances(set: ShapeSet, out: Float32Array): number {
  const spheres = set.spheres;
  const count = Math.min(spheres.length, MAX_SPHERES);
  for (let index = 0; index < count; index += 1) {
    const sphere = spheres[index] as (typeof spheres)[number];
    const base = index * SPHERE_FLOATS;
    out[base] = sphere.position[0];
    out[base + 1] = sphere.position[1];
    out[base + 2] = -sphere.position[2];
    out[base + 3] = sphere.radius;
    out[base + 4] = sphere.color[0] / 255;
    out[base + 5] = sphere.color[1] / 255;
    out[base + 6] = sphere.color[2] / 255;
    out[base + 7] = sphere.opacity;
  }
  return count;
}

/**
 * Writes one instance per line segment and gives back how many there are. A closed line
 * carries one more segment, from its last point back to its first.
 */
export function buildSegmentInstances(set: ShapeSet, out: Float32Array): number {
  let segments = 0;
  for (const line of set.lines) {
    const points = line.points;
    const last = line.closed ? points.length : points.length - 1;
    const half = line.width / 2;
    for (let step = 0; step < last; step += 1) {
      const start = points[step] as readonly [number, number, number];
      const end = points[(step + 1) % points.length] as readonly [
        number,
        number,
        number,
      ];
      const base = segments * SEGMENT_FLOATS;
      out[base] = start[0];
      out[base + 1] = start[1];
      out[base + 2] = -start[2];
      out[base + 3] = end[0];
      out[base + 4] = end[1];
      out[base + 5] = -end[2];
      out[base + 6] = line.color[0] / 255;
      out[base + 7] = line.color[1] / 255;
      out[base + 8] = line.color[2] / 255;
      out[base + 9] = half;
      segments += 1;
    }
  }
  return segments;
}

/**
 * Creates the shape pass and its buffers. The renderer owns the programs and the
 * full-screen vertex array, and it deletes them.
 */
export function createShapePass(
  gl: WebGL2RenderingContext,
  programs: ShapePrograms,
  fullScreenVertexArray: WebGLVertexArrayObject,
): ShapePass {
  const sphereCorners = gl.createBuffer();
  const sphereInstances = gl.createBuffer();
  const sphereArray = gl.createVertexArray();
  const ribbonCorners = gl.createBuffer();
  const segmentInstances = gl.createBuffer();
  const segmentArray = gl.createVertexArray();
  if (
    sphereCorners === null ||
    sphereInstances === null ||
    sphereArray === null ||
    ribbonCorners === null ||
    segmentInstances === null ||
    segmentArray === null
  ) {
    throw new Error('The context gave no buffer for the shapes.');
  }

  const spheres = new Float32Array(MAX_SPHERES * SPHERE_FLOATS);
  const segments = new Float32Array(MAX_SEGMENTS * SEGMENT_FLOATS);
  // The set the buffers were built from, and its version at that build. The identity is
  // held as well as the version, because a host can put a second set in through
  // `setShapes` and two sets can stand at the same version.
  let builtSet: ShapeSet | null = null;
  let builtVersion = -1;
  let sphereCount = 0;
  let segmentCount = 0;
  let calls = 0;

  gl.bindVertexArray(sphereArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereCorners);
  gl.bufferData(gl.ARRAY_BUFFER, SPHERE_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereInstances);
  gl.bufferData(gl.ARRAY_BUFFER, spheres.byteLength, gl.DYNAMIC_DRAW);
  const sphereStride = SPHERE_FLOATS * 4;
  for (const [location, size, offset] of [
    [1, 3, 0],
    [2, 1, 12],
    [3, 3, 16],
    [4, 1, 28],
  ] as const) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, sphereStride, offset);
    gl.vertexAttribDivisor(location, 1);
  }

  gl.bindVertexArray(segmentArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, ribbonCorners);
  gl.bufferData(gl.ARRAY_BUFFER, RIBBON_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, segmentInstances);
  gl.bufferData(gl.ARRAY_BUFFER, segments.byteLength, gl.DYNAMIC_DRAW);
  const segmentStride = SEGMENT_FLOATS * 4;
  for (const [location, size, offset] of [
    [1, 3, 0],
    [2, 3, 12],
    [3, 3, 24],
    [4, 1, 36],
  ] as const) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, segmentStride, offset);
    gl.vertexAttribDivisor(location, 1);
  }

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const lineTarget = createLineTarget(gl);

  /** Writes both instance buffers when the set has changed since the last draw. */
  const rebuild = (set: ShapeSet): void => {
    if (builtSet === set && builtVersion === set.version) return;
    builtSet = set;
    builtVersion = set.version;
    sphereCount = buildSphereInstances(set, spheres);
    segmentCount = buildSegmentInstances(set, segments);
    if (sphereCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, sphereInstances);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, spheres, 0, sphereCount * SPHERE_FLOATS);
    }
    if (segmentCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, segmentInstances);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, segments, 0, segmentCount * SEGMENT_FLOATS);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  };

  return {
    drawCalls(): number {
      return calls;
    },
    lineBufferSize(): [number, number] | null {
      return lineTarget.size();
    },
    draw(frame: ShapePassFrame): number {
      rebuild(frame.set);
      calls = 0;
      if (sphereCount === 0 && segmentCount === 0) return 0;

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      // The chunk offset carries the camera subtraction. The world frame's third axis
      // runs the other way to the game's, so the third part keeps its sign.
      const offset: [number, number, number] = [
        -frame.camera[0],
        -frame.camera[1],
        frame.camera[2],
      ];

      gl.disable(gl.DEPTH_TEST);

      if (sphereCount > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const program = programs.spheres;
        gl.useProgram(program.program);
        gl.uniformMatrix4fv(
          program.uniforms['uViewProjection'] ?? null,
          false,
          frame.viewProjection,
        );
        gl.uniform3f(
          program.uniforms['uChunkOffset'] ?? null,
          offset[0],
          offset[1],
          offset[2],
        );
        gl.uniform2f(program.uniforms['uTargetSize'] ?? null, width, height);
        gl.uniform1f(program.uniforms['uFocal'] ?? null, frame.focal);
        gl.uniform1f(
          program.uniforms['uMinRadius'] ?? null,
          SPHERE_MIN_RADIUS_CSS * frame.pixelRatio,
        );
        gl.bindVertexArray(sphereArray);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sphereCount);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        calls += 1;
      }

      if (segmentCount > 0) {
        // Step one: every segment into the line buffer, largest value wins. The MAX
        // equation keeps one blend where two quads of a join overlap.
        lineTarget.resize(width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, lineTarget.framebuffer);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MAX);
        const program = programs.lines;
        gl.useProgram(program.program);
        gl.uniformMatrix4fv(
          program.uniforms['uViewProjection'] ?? null,
          false,
          frame.viewProjection,
        );
        gl.uniform3f(
          program.uniforms['uChunkOffset'] ?? null,
          offset[0],
          offset[1],
          offset[2],
        );
        gl.uniform2f(program.uniforms['uTargetSize'] ?? null, width, height);
        gl.uniform1f(program.uniforms['uPixelRatio'] ?? null, frame.pixelRatio);
        gl.bindVertexArray(segmentArray);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segmentCount);
        gl.bindVertexArray(null);
        gl.blendEquation(gl.FUNC_ADD);
        gl.disable(gl.BLEND);
        calls += 1;

        // Step two: the lines, over the finished frame.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const composite = programs.composite;
        gl.useProgram(composite.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lineTarget.texture);
        gl.uniform1i(composite.uniforms['uLines'] ?? null, 0);
        gl.bindVertexArray(fullScreenVertexArray);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.disable(gl.BLEND);
        calls += 1;
      }

      return calls;
    },
    dispose(): void {
      lineTarget.dispose();
      gl.deleteBuffer(sphereCorners);
      gl.deleteBuffer(sphereInstances);
      gl.deleteBuffer(ribbonCorners);
      gl.deleteBuffer(segmentInstances);
      gl.deleteVertexArray(sphereArray);
      gl.deleteVertexArray(segmentArray);
    },
  };
}
