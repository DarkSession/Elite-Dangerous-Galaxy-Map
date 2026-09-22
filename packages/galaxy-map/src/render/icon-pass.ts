// Draws the icon stacks and their arrows on the canvas, after the markers and after the
// shapes, over the finished frame.
//
// The stacks were DOM elements until this pass existed. A DOM element draws over every
// pixel the canvas drew at its place, so the overlay had to hide a whole 28 pixel icon
// while the drawn centre of a nearer marker lay inside its box. The pass replaces that
// with a per-pixel test: it samples the marker range buffer that `marker-range.frag`
// already writes, and an icon fragment discards where a nearer marker body covers it.
//
// The pass splits into `prepare` and `draw`, as the shape pass does and for the same
// reason: the renderer allocates the range buffer only in a frame that needs it, and it
// has to know the stack count **before** the marker pass draws.
//
// A stack is its arrow and its icons together, so the two go in one instance stream, the
// arrow of a stack before its own icons and the furthest stack first. One draw call then
// gives the order. Two calls cannot: the second draws every one of its quads over every
// quad of the first, whatever the range.
import {
  ARROW_HEIGHT_CSS,
  ARROW_WIDTH_CSS,
  arrowApexCss,
  ICON_CSS_SIZE,
  iconBottomCss,
  MAX_ICON_STACKS,
} from '../scene-data/icon-stack';
import { MAX_ICONS } from '../scene-data/marker-icons';
import type { ResolvedIcon } from '../scene-data/marker-icons';
import { markerCssSize } from '../scene-data/marker-size';
import {
  createNearestKeep,
  offerNearest,
  resetNearest,
} from '../scene-data/nearest-keep';
import type { RealSystemSet } from '../scene-data/real-systems';
import { createIconTextures, NO_ICON_LAYER } from './icon-textures';
import type { IconTextureOptions, IconTextures } from './icon-textures';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/icons.vert?raw';
import fragmentSource from './shaders/icons.frag?raw';

/** How many icons a frame draws: 4 for each of the 32 stacks. */
export const MAX_STACK_ICONS = MAX_ICON_STACKS * MAX_ICONS;

/**
 * How much nearer a marker has to be before it hides an icon, as a share of the icon's
 * own range.
 *
 * The stack's own marker sits at the stack's own range, so a strict comparison would
 * leave it alone if the two numbers were the same bits. They are not: the marker's range
 * comes from `length(aOffset)` on the card and the icon's from `Math.sqrt` here, so the
 * two differ by an ulp or two.
 *
 * A relative bias scales with the range, which a fixed one would not. 1e-5 is about
 * 80 times the `float32` relative step of 1.2e-7 and far below any separation the eye
 * reads: at 120,000 light years it is 1.2 light years, and at 50 light years it is
 * 0.0005.
 *
 * The number holds only while the fragment reads the range buffer at `highp`, which
 * `icons.frag` states on the sampler. A sampler with no precision takes `lowp`, and the
 * comparison then turns at about a two-thousandth of the range whatever this value says.
 */
export const ICON_RANGE_BIAS = 1e-5;

/**
 * How many floats one instance carries: the box, three of data, the range and the kind.
 *
 * An icon and an arrow share the layout, because they share the stream. The three data
 * floats hold the texture layer of an icon in the first one, and the three parts of an
 * arrow's fill.
 */
const INSTANCE_FLOATS = 9;

/** How many instances one frame can hold: one arrow and up to four icons per stack. */
const MAX_INSTANCES = MAX_STACK_ICONS + MAX_ICON_STACKS;

/** The value of the kind attribute for an icon. */
const KIND_ICON = 0;

/** The value of the kind attribute for an arrow. */
const KIND_ARROW = 1;

/** The four corners of the quad, as a triangle strip, with 0,0 at the top left. */
const QUAD_CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

/** What the handle reports about one icon or one arrow the frame placed. */
export interface IconPlacement {
  /** Which of the two the entry is. */
  readonly kind: 'icon' | 'arrow';
  /** The index of the system the stack belongs to. */
  readonly systemIndex: number;
  /** The place of the icon in the record's own order, and 0 for an arrow. */
  readonly stackIndex: number;
  /** The box in CSS pixels from the top left of the canvas. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The arrow's fill, and the icon's own colour, each part 0 to 255. */
  readonly color: readonly [number, number, number];
  /** The vector the icon draws, and an empty string for an arrow. */
  readonly url: string;
}

/** What one icon pass frame reads. */
export interface IconPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The camera position in game coordinates. */
  readonly camera: readonly [number, number, number];
  /**
   * The cursor in the camera-relative world frame, whose third axis runs the other way
   * to the game's. The draw-range cut measures from it, as `systems.vert` does, so the
   * pass keeps the stacks of the markers the frame drew and no others.
   */
  readonly cursorOffset: readonly [number, number, number];
  /** The near plane in light years, so a system behind it carries no stack. */
  readonly near: number;
  /** Device pixels per CSS pixel. */
  readonly pixelRatio: number;
  /** The set to read. */
  readonly set: RealSystemSet;
  /** The selected system, or -1. Its stack rises by the height of the pin. */
  readonly selectedIndex: number;
  /**
   * The range buffer the marker pass wrote, or null where the map holds none. With none
   * every icon draws over every marker, which is the frame the map drew before any such
   * rule existed.
   */
  readonly range: WebGLTexture | null;
}

/** The icon stack pass. */
export interface IconPass {
  /**
   * Selects and places the stacks of one frame and gives back how many it kept. The
   * renderer reads it before the marker pass draws, because the marker pass writes the
   * range buffer only in a frame that needs it.
   */
  prepare(frame: Omit<IconPassFrame, 'range'>): number;
  /** Draws what `prepare` placed and gives back how many draw calls it issued. */
  draw(frame: IconPassFrame): number;
  /** How many draw calls the last draw issued. */
  drawCalls(): number;
  /**
   * The mean time of the last `SWEEP_SAMPLES` placement sweeps, in milliseconds. A
   * browser test reads it through the handle to hold the sweep to its budget.
   */
  sweepMeanMs(): number;
  /** What the last `prepare` placed, in draw order, which is the furthest stack first. */
  placements(): IconPlacement[];
  /**
   * Forgets what the last frame placed. The renderer calls it in a frame that runs no
   * `prepare`, so a frame with the switch off reports no placement rather than the
   * placements of the frame before it.
   */
  clear(): void;
  dispose(): void;
}

/**
 * Compiles the one program the pass draws with. It draws an icon and an arrow, because
 * the two share one instance stream and therefore one draw call.
 */
export function createIconProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'icons', vertexSource, fragmentSource, [
    'uViewportPx',
    'uIcons',
    'uRange',
    'uHasRange',
    'uRangeBias',
  ]);
}

/** How many sweeps the mean of the time probe covers. */
const SWEEP_SAMPLES = 120;

/** What `createIconPass` takes besides the context and the program. */
export interface IconPassOptions {
  /** Passed straight to the texture array. A unit run gives its own rasteriser. */
  readonly textures?: IconTextureOptions;
}

/**
 * Creates the icon pass, its buffers and its texture array. The renderer owns the
 * program and deletes it.
 */
export function createIconPass(
  gl: WebGL2RenderingContext,
  program: Program,
  options: IconPassOptions = {},
): IconPass {
  const corners = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  const array = gl.createVertexArray();
  if (corners === null || instanceBuffer === null || array === null) {
    throw new Error('The context gave no buffer for the icon stacks.');
  }

  const textures: IconTextures = createIconTextures(gl, options.textures);
  const keep = createNearestKeep(MAX_ICON_STACKS);
  // What the last sweeps cost. The ring holds one reading per sweep, so the probe reads
  // the frames of the measurement and not every frame since the map opened.
  const sweepMs = new Float64Array(SWEEP_SAMPLES);
  let sweepAt = 0;
  let sweepCount = 0;
  const instances = new Float32Array(MAX_INSTANCES * INSTANCE_FLOATS);
  // What the frame placed, held as parallel arrays so the draw path allocates nothing.
  // `placements()` builds the objects, and only a test calls it.
  const placeKind = new Uint8Array(MAX_INSTANCES);
  const placeSystem = new Int32Array(MAX_INSTANCES);
  const placeStack = new Int32Array(MAX_INSTANCES);
  const placeBox = new Float32Array(MAX_INSTANCES * 4);
  const placeColor = new Float32Array(MAX_INSTANCES * 3);
  const placeUrl: string[] = [];
  // One counter for the placements and the instances, because every placement writes one
  // instance and the two therefore hold the same order.
  let placed = 0;
  let calls = 0;

  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);

  // The box, the data, the range and the kind of one instance, icon or arrow.
  gl.bindVertexArray(array);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, instances.byteLength, gl.DYNAMIC_DRAW);
  for (const [location, size, offset] of [
    [1, 4, 0],
    [2, 3, 16],
    [3, 1, 28],
    [4, 1, 32],
  ] as const) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      size,
      gl.FLOAT,
      false,
      INSTANCE_FLOATS * 4,
      offset,
    );
    gl.vertexAttribDivisor(location, 1);
  }

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  /** Notes one placed box, so `placements()` can report it without a frame allocation. */
  const note = (
    kind: 0 | 1,
    systemIndex: number,
    stackIndex: number,
    left: number,
    top: number,
    width: number,
    height: number,
    color: readonly [number, number, number],
    url: string,
  ): void => {
    placeKind[placed] = kind;
    placeSystem[placed] = systemIndex;
    placeStack[placed] = stackIndex;
    placeBox[placed * 4] = left;
    placeBox[placed * 4 + 1] = top;
    placeBox[placed * 4 + 2] = width;
    placeBox[placed * 4 + 3] = height;
    placeColor[placed * 3] = color[0];
    placeColor[placed * 3 + 1] = color[1];
    placeColor[placed * 3 + 2] = color[2];
    placeUrl[placed] = url;
    placed += 1;
  };

  /**
   * Selects and places the stacks of one frame. `prepare` times it, so the frame's own
   * reading covers the whole walk and nothing else.
   */
  const sweep = (frame: Omit<IconPassFrame, 'range'>): number => {
    placed = 0;
    const set = frame.set;
    // A set in which no record holds an icon costs no per-frame work at all. The icon
    // switch defaults on, so without this a host that names no icon would begin
    // paying for a sweep of its own set.
    if (set.iconIndexCount === 0) return 0;

    textures.setPixelRatio(frame.pixelRatio);

    const matrix = frame.viewProjection;
    const camera = frame.camera;
    const cursor = frame.cursorOffset;
    const positions = set.positions;
    const flags = set.markerFlags;
    // The sweep reads the set's flat views and builds no record and no category for a
    // candidate. `drawRanges` holds the draw range of the category each record draws
    // through, which is the limit a stack is cut at.
    const limits = set.drawRanges;
    const iconStarts = set.iconStarts;
    const iconCounts = set.iconCounts;
    const iconVectors = set.iconVectors;
    const count = set.count;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const indices = set.iconIndices;

    resetNearest(keep);
    for (let at = 0; at < indices.length; at += 1) {
      const index = indices[at] as number;
      // A stale entry: the record that named an icon was replaced by one that names
      // none. It costs one read and draws nothing.
      if (index < 0 || index >= count) continue;
      if (flags[index] !== 1) continue;
      if (iconCounts[index] === 0) continue;

      // The offset is built with `Math.fround` per axis, which reproduces bit for bit
      // the `float32` the marker position buffer holds. The range from it is therefore
      // the range the card measures the marker at, to within the square root.
      const base = index * 3;
      const x = Math.fround((positions[base] as number) - camera[0]);
      const y = Math.fround((positions[base + 1] as number) - camera[1]);
      // The world frame's third axis runs the other way to the game's.
      const z = Math.fround(camera[2] - (positions[base + 2] as number));

      // The cut measures from the cursor, as `systems.vert` does, so the pass keeps
      // the stacks of the markers the frame drew. The size measures from the camera.
      const limit = limits[index] as number;
      const cx = x - cursor[0];
      const cy = y - cursor[1];
      const cz = z - cursor[2];
      if (cx * cx + cy * cy + cz * cz > limit * limit) continue;

      // `Math.sqrt` and not `Math.hypot`: the guard of `Math.hypot` against an overflow
      // costs time on each candidate, and no range of the galaxy comes near one.
      const range = Math.sqrt(x * x + y * y + z * z);
      // A full keeper refuses a range at or past its furthest entry. This is the test
      // `offerNearest` makes first, so the kept set does not change, and a stack it
      // refuses costs no projection.
      if (
        keep.count === keep.limit &&
        range >= (keep.ranges[keep.limit - 1] as number)
      ) {
        continue;
      }

      const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
      if (clipW <= frame.near) continue;
      const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      const deviceX = (clipX / clipW + 1) * halfWidth;
      const deviceY = (1 - clipY / clipW) * halfHeight;
      // A candidate outside the viewport is dropped before any other work.
      if (deviceX < 0 || deviceY < 0 || deviceX > width || deviceY > height) continue;

      offerNearest(keep, index, range);
    }

    const stackCount = keep.count;
    if (stackCount === 0) return 0;

    const ratio = frame.pixelRatio;
    // The quad is 28 CSS pixels square, which is what the size rule states. It is not
    // the texture side: `iconLayerSide` floors the ratio at 1, so a screen under a
    // ratio of 1 holds a readable texture, and a quad of that side would draw a 56 CSS
    // pixel icon at a ratio of 0.5 over a stack step of 15 device pixels.
    const iconSide = Math.max(1, Math.round(ICON_CSS_SIZE * ratio));
    const arrowWidth = Math.max(1, Math.round(ARROW_WIDTH_CSS * ratio));
    const arrowHeight = Math.max(1, Math.round(ARROW_HEIGHT_CSS * ratio));

    // The furthest stack first, so a nearer stack draws over a further one. The keeper
    // holds its entries nearest first, so the walk runs backwards.
    for (let slot = keep.count - 1; slot >= 0; slot -= 1) {
      const index = keep.indices[slot] as number;
      const range = keep.ranges[slot] as number;
      const iconAt = iconStarts[index] as number;
      const iconsHeld = iconCounts[index] as number;
      if (iconsHeld === 0) continue;

      const base = index * 3;
      const x = Math.fround((positions[base] as number) - camera[0]);
      const y = Math.fround((positions[base + 1] as number) - camera[1]);
      const z = Math.fround(camera[2] - (positions[base + 2] as number));
      const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
      const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      const deviceX = (clipX / clipW + 1) * halfWidth;
      const centreYCss = ((1 - clipY / clipW) * halfHeight) / ratio;
      const markerCss = markerCssSize(range);
      const selected = index === frame.selectedIndex;

      // The arrow goes first, under the lowest icon and before the icons of its own
      // stack in the stream. It draws for every kept stack, whatever the state of the
      // vectors: a record with icons has an arrow.
      const lowest = iconVectors[iconAt] as ResolvedIcon;
      const arrowTop = Math.round(
        arrowApexCss(centreYCss, markerCss, selected) * ratio - arrowHeight,
      );
      const arrowLeft = Math.round(deviceX - arrowWidth / 2);
      const arrowBase = placed * INSTANCE_FLOATS;
      instances[arrowBase] = arrowLeft;
      instances[arrowBase + 1] = arrowTop;
      instances[arrowBase + 2] = arrowWidth;
      instances[arrowBase + 3] = arrowHeight;
      instances[arrowBase + 4] = (lowest.color[0] as number) / 255;
      instances[arrowBase + 5] = (lowest.color[1] as number) / 255;
      instances[arrowBase + 6] = (lowest.color[2] as number) / 255;
      instances[arrowBase + 7] = range;
      instances[arrowBase + 8] = KIND_ARROW;
      note(
        1,
        index,
        0,
        arrowLeft / ratio,
        arrowTop / ratio,
        arrowWidth / ratio,
        arrowHeight / ratio,
        lowest.color,
        '',
      );

      for (let at = 0; at < iconsHeld; at += 1) {
        const icon = iconVectors[iconAt + at];
        if (icon === undefined) continue;
        // An icon draws only once its vector is ready. Loading is asynchronous, so the
        // first frames after a record arrives may draw fewer icons than it names, and
        // a URL the browser refuses never becomes ready. The rest of the stack draws.
        const layer = textures.layerOf(icon.url);
        if (layer === NO_ICON_LAYER) continue;
        // The icon keeps the place its index of the record gives, so a vector that is
        // not ready leaves a gap rather than moving the ones above it down.
        const top = Math.round(
          iconBottomCss(centreYCss, markerCss, at, selected) * ratio - iconSide,
        );
        const left = Math.round(deviceX - iconSide / 2);
        const iconBase = placed * INSTANCE_FLOATS;
        instances[iconBase] = left;
        instances[iconBase + 1] = top;
        instances[iconBase + 2] = iconSide;
        instances[iconBase + 3] = iconSide;
        instances[iconBase + 4] = layer;
        // The other two data floats carry an arrow's fill, and an icon leaves them at 0.
        instances[iconBase + 5] = 0;
        instances[iconBase + 6] = 0;
        instances[iconBase + 7] = range;
        instances[iconBase + 8] = KIND_ICON;
        note(
          0,
          index,
          at,
          left / ratio,
          top / ratio,
          iconSide / ratio,
          iconSide / ratio,
          icon.color,
          icon.url,
        );
      }
    }

    return stackCount;
  };

  return {
    prepare(frame: Omit<IconPassFrame, 'range'>): number {
      const startedMs = performance.now();
      const kept = sweep(frame);
      sweepMs[sweepAt] = performance.now() - startedMs;
      sweepAt = (sweepAt + 1) % SWEEP_SAMPLES;
      if (sweepCount < SWEEP_SAMPLES) sweepCount += 1;
      return kept;
    },
    sweepMeanMs(): number {
      if (sweepCount === 0) return 0;
      let total = 0;
      for (let at = 0; at < sweepCount; at += 1) total += sweepMs[at] as number;
      return total / sweepCount;
    },

    draw(frame: IconPassFrame): number {
      calls = 0;
      if (placed === 0) return 0;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const hasRange = frame.range === null ? 0 : 1;

      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances, 0, placed * INSTANCE_FLOATS);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(program.program);
      gl.uniform2f(program.uniforms['uViewportPx'] ?? null, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures.texture());
      gl.uniform1i(program.uniforms['uIcons'] ?? null, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, frame.range);
      gl.uniform1i(program.uniforms['uRange'] ?? null, 1);
      gl.uniform1f(program.uniforms['uHasRange'] ?? null, hasRange);
      gl.uniform1f(program.uniforms['uRangeBias'] ?? null, ICON_RANGE_BIAS);
      // The arrow's slanted edges carry a one pixel ramp, so the stream blends with its
      // alpha. The icon plate is opaque, so a blended plate writes the pixels a plate
      // with the blend off writes.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(array);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, placed);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      calls = 1;

      return calls;
    },

    clear(): void {
      placed = 0;
      calls = 0;
    },

    drawCalls(): number {
      return calls;
    },

    placements(): IconPlacement[] {
      const list: IconPlacement[] = [];
      for (let at = 0; at < placed; at += 1) {
        list.push({
          kind: placeKind[at] === 1 ? 'arrow' : 'icon',
          systemIndex: placeSystem[at] as number,
          stackIndex: placeStack[at] as number,
          left: placeBox[at * 4] as number,
          top: placeBox[at * 4 + 1] as number,
          width: placeBox[at * 4 + 2] as number,
          height: placeBox[at * 4 + 3] as number,
          color: [
            placeColor[at * 3] as number,
            placeColor[at * 3 + 1] as number,
            placeColor[at * 3 + 2] as number,
          ],
          url: placeUrl[at] ?? '',
        });
      }
      return list;
    },

    dispose(): void {
      textures.dispose();
      gl.deleteBuffer(corners);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteVertexArray(array);
    },
  };
}
