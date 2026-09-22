// The background reading: the local brightness of the finished picture of the galaxy,
// as a small texture, so an overlay can follow what it draws over.
//
// The chain tone maps the scene target once at the full resolution of the frame, with the
// frame's own curve and exposure, then averages the tone-mapped values down to a
// sixteenth of the frame on each axis. The reading is the mean of the picture a person
// sees, which is what an overlay merges with.
//
// The order is measured and not assumed. An average in linear light first gives the mean
// scene radiance of the block, which one bright star dominates whole: a star sprite carries
// a linear luminance far above its background, so a 16 by 16 block reads 0.56 where the
// same block of the tone-mapped frame means 0.33. The reading then steps when the sprite
// crosses a texel edge. Over the disc at a zoom of 4,000 light years, with the camera
// moving 4.67 CSS pixels a frame, the linear order moves the texel under a fixed point by
// 0.2417 between two frames and this order by 0.0232. A step of that size in the reading
// is a step in the merge weight, which is a grid line that flickers.
//
// The reading also goes back to the processor, for the coordinate labels. That copy runs
// through a pixel buffer object with a fence and lands one frame later, because a
// `readPixels` into an array waits for the card in the middle of the frame.
import { createRenderTarget } from './buffers';
import type { RenderTarget } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import { halvedUp } from './reduce';
import type { ReducePass } from './reduce';
import vertexSource from './shaders/fullscreen.vert?raw';
import tonemapSource from './shaders/tonemap.frag?raw';

/** How much smaller the reading is than the frame, on each axis. */
export const BACKGROUND_DIVISOR = 16;

/** How many halvings the chain takes to reach the divisor. */
export const BACKGROUND_STEPS = 4;

/**
 * The size of the reading for a drawing buffer, in texels. Each step rounds up, so the
 * run of halvings gives `ceil(n / 16)` exactly and the last row still covers the bottom
 * of the frame. Rounding down would drop the last row of an odd level.
 */
export function backgroundReadingSize(width: number, height: number): [number, number] {
  let readingWidth = Math.max(1, width);
  let readingHeight = Math.max(1, height);
  for (let step = 0; step < BACKGROUND_STEPS; step += 1) {
    readingWidth = halvedUp(readingWidth);
    readingHeight = halvedUp(readingHeight);
  }
  return [readingWidth, readingHeight];
}

/** What the read-back cycle needs of the context, so its state machine can be read. */
export interface ReadbackHooks {
  /** Starts the copy of the current target into the slot. Gives the fence, or null. */
  start(slot: number): unknown;
  /** True when the slot's fence has passed, so the bytes are there to take. */
  passed(fence: unknown): boolean;
  /** Copies the slot's bytes out. */
  take(slot: number, into: Uint8Array): void;
  /** Drops a fence the cycle no longer holds. */
  drop(fence: unknown): void;
}

/** The ping-pong read-back of the reading, one frame late. */
export interface ReadbackCycle {
  /**
   * Takes the copy an earlier frame started, when its fence has passed. It gives true
   * when `into` now holds a reading. The frame calls it before its first draw command,
   * because a take after the draw commands drains every command queued before it.
   */
  take(into: Uint8Array): boolean;
  /**
   * Starts one copy, in a slot that is never the slot the next take reads. The frame
   * calls it after the reading is built, and only where a caller asks for a reading.
   */
  start(): void;
  /** Drops every fence the cycle holds. */
  dispose(): void;
}

/** How many pixel buffers the cycle holds. Two, so a write never meets its own read. */
export const READBACK_SLOTS = 2;

/**
 * The read-back state machine. The first take has nothing to give, because no start ran
 * before it. Each later take reads the copy an earlier start made, when its fence has
 * passed, and each start writes the other slot.
 */
export function createReadbackCycle(hooks: ReadbackHooks): ReadbackCycle {
  const fences: unknown[] = new Array<unknown>(READBACK_SLOTS).fill(null);
  let next = 0;

  return {
    take(into: Uint8Array): boolean {
      // The slot the last start wrote is the one the take reads, so the copy a frame
      // starts never lands in the buffer that same frame took its bytes from.
      const read = (next + READBACK_SLOTS - 1) % READBACK_SLOTS;
      const fence = fences[read];
      if (fence === null || !hooks.passed(fence)) return false;
      hooks.take(read, into);
      hooks.drop(fence);
      fences[read] = null;
      return true;
    },
    start(): void {
      const write = next;
      next = (next + 1) % READBACK_SLOTS;
      const held = fences[write];
      if (held !== null) {
        // A fence that has not passed by the time its slot comes round again is
        // dropped, because the copy that follows overwrites the bytes it guards.
        hooks.drop(held);
        fences[write] = null;
      }
      fences[write] = hooks.start(write) ?? null;
    },
    dispose(): void {
      for (let slot = 0; slot < READBACK_SLOTS; slot += 1) {
        const fence = fences[slot];
        if (fence !== null) hooks.drop(fence);
        fences[slot] = null;
      }
    },
  };
}

/** The read-back of the frame before, as the coordinate labels read it. */
export interface BackgroundFrame {
  readonly width: number;
  readonly height: number;
  /** Four bytes for each texel, row by row, with the top row first. */
  readonly pixels: Uint8Array;
}

/** One texel of the reading, each channel and the luminance from 0 to 1. */
export interface BackgroundTexel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** `0.2126 r + 0.7152 g + 0.0722 b`. */
  readonly luminance: number;
}

/** The whole reading, as a test probe reads it. The first texel is the top left one. */
export interface BackgroundReading {
  readonly width: number;
  readonly height: number;
  readonly texels: BackgroundTexel[];
}

/** The luminance of a colour, by the coefficients the tone map uses. */
export function backgroundLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** What the read-backs since the last reset cost. */
export interface ReadbackStats {
  /** How many read-backs landed. */
  readonly frames: number;
  /** Their mean time in milliseconds. */
  readonly meanMs: number;
  /** The worst of them, in milliseconds. */
  readonly worstMs: number;
}

/** The background reading pass. */
export interface BackgroundPass {
  /**
   * Builds the reading from the scene target. The source must be the full drawing
   * buffer size. It neither takes nor starts a read-back: the frame owns both.
   */
  render(scene: WebGLTexture, width: number, height: number, exposure: number): void;
  /**
   * Takes the copy an earlier frame started, and gives true where one landed. The frame
   * calls it before its first draw command.
   */
  take(): boolean;
  /**
   * Starts the copy of the reading the frame just built. The frame calls it after the
   * chain, and only where the caller asks for a reading.
   */
  start(): void;
  /** What the read-backs since the last reset cost. */
  readbackStats(): ReadbackStats;
  /** Starts the read-back mean again. */
  resetReadbackStats(): void;
  /** The reading of the last `render` call. */
  readonly texture: WebGLTexture;
  /** The reading target's own size, or `[0, 0]` while it holds no storage. */
  size(): [number, number];
  /** The read-back of an earlier frame, or null while none has landed. */
  frame(): BackgroundFrame | null;
  /**
   * Reads the target straight off the card, which waits for it. It is a test probe and
   * not the path the labels take. It gives null while the target holds no storage.
   */
  read(): BackgroundReading | null;
  dispose(): void;
}

/**
 * Compiles the tone map the chain starts with and builds the pass. The pass takes no
 * float flag: every target of it holds the tone-mapped picture, which is 8 bits a
 * channel like the frame.
 */
export function createBackgroundPass(
  gl: WebGL2RenderingContext,
  emptyVertexArray: WebGLVertexArrayObject,
  reduce: ReducePass,
): BackgroundPass {
  const tonemapProgram: Program = createProgram(
    gl,
    'background-tonemap',
    vertexSource,
    tonemapSource,
    ['uScene', 'uExposure'],
  );

  // Nothing holds storage until the first frame that builds a reading. A view that
  // draws no grid therefore pays nothing, which `backgroundSize()` reports.
  let steps: RenderTarget[] | null = null;
  let mapped: RenderTarget | null = null;
  let reading: RenderTarget | null = null;
  let buffers: (WebGLBuffer | null)[] | null = null;
  let cycle: ReadbackCycle | null = null;
  let pixels: Uint8Array | null = null;
  let flipped: Uint8Array | null = null;
  let landed = false;
  let readingWidth = 0;
  let readingHeight = 0;
  // What the takes since the last reset cost. The clock runs around the copy out of the
  // pixel buffer alone, which is the call that drains the command queue.
  let takeCount = 0;
  let takeTotalMs = 0;
  let takeWorstMs = 0;

  /** Matches every target and every pixel buffer to a drawing buffer size. */
  const resize = (width: number, height: number): void => {
    const [nextWidth, nextHeight] = backgroundReadingSize(width, height);
    if (steps === null) {
      // The chain carries tone-mapped values, so every target of it holds 8 bits a
      // channel, like the frame. The last halving writes the reading itself, so the
      // steps between hold one target less than the chain has halvings.
      mapped = createRenderTarget(gl, 1, 1, false);
      steps = [];
      for (let step = 0; step < BACKGROUND_STEPS - 1; step += 1) {
        steps.push(createRenderTarget(gl, 1, 1, false));
      }
      reading = createRenderTarget(gl, 1, 1, false);
    }
    // The reading's own size decides, and not the drawing buffer's. Every width from
    // 1,905 to 1,920 gives a reading 120 texels wide, so a resize inside one of those
    // buckets leaves the tone map and the three steps between at the size the buffer
    // before them had. That costs nothing a reader sees: each step blits the whole of
    // its source into the whole of its target, so the reading still covers the whole
    // frame and only resamples it. It saves five reallocations on a window drag.
    if (nextWidth === readingWidth && nextHeight === readingHeight) return;
    readingWidth = nextWidth;
    readingHeight = nextHeight;

    let stepWidth = Math.max(1, width);
    let stepHeight = Math.max(1, height);
    (mapped as RenderTarget).resize(stepWidth, stepHeight);
    for (let step = 0; step < BACKGROUND_STEPS - 1; step += 1) {
      stepWidth = halvedUp(stepWidth);
      stepHeight = halvedUp(stepHeight);
      (steps[step] as RenderTarget).resize(stepWidth, stepHeight);
    }
    (reading as RenderTarget).resize(readingWidth, readingHeight);

    // The size changed, so every buffer in flight holds the wrong count of bytes.
    cycle?.dispose();
    cycle = null;
    if (buffers !== null) {
      for (const buffer of buffers) gl.deleteBuffer(buffer);
    }
    const bytes = readingWidth * readingHeight * 4;
    buffers = [];
    for (let slot = 0; slot < READBACK_SLOTS; slot += 1) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      buffers.push(buffer);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    pixels = new Uint8Array(bytes);
    flipped = new Uint8Array(bytes);
    landed = false;

    cycle = createReadbackCycle({
      start(slot: number): unknown {
        const target = reading as RenderTarget;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, (buffers as WebGLBuffer[])[slot] ?? null);
        gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      },
      passed(fence: unknown): boolean {
        const state = gl.clientWaitSync(fence as WebGLSync, 0, 0);
        return state === gl.ALREADY_SIGNALED || state === gl.CONDITION_SATISFIED;
      },
      take(slot: number, into: Uint8Array): void {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, (buffers as WebGLBuffer[])[slot] ?? null);
        const started = performance.now();
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, into);
        const spent = performance.now() - started;
        takeCount += 1;
        takeTotalMs += spent;
        if (spent > takeWorstMs) takeWorstMs = spent;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      },
      drop(fence: unknown): void {
        gl.deleteSync(fence as WebGLSync);
      },
    });
  };

  return {
    render(scene: WebGLTexture, width: number, height: number, exposure: number): void {
      resize(width, height);

      // One tone map of the scene at the full size of the frame, with the curve and the
      // exposure the frame uses.
      const picture = mapped as RenderTarget;
      gl.bindFramebuffer(gl.FRAMEBUFFER, picture.framebuffer);
      gl.viewport(0, 0, picture.width, picture.height);
      gl.useProgram(tonemapProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene);
      gl.uniform1i(tonemapProgram.uniforms['uScene'] ?? null, 0);
      gl.uniform1f(tonemapProgram.uniforms['uExposure'] ?? null, exposure);
      gl.bindVertexArray(emptyVertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      // Four halvings of the tone-mapped picture, the last of them into the reading.
      const chain = steps as RenderTarget[];
      let source = picture.texture;
      for (const step of chain) {
        reduce.halve(source, step, null);
        source = step.texture;
      }
      reduce.halve(source, reading as RenderTarget, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    take(): boolean {
      if (cycle === null || pixels === null || !cycle.take(pixels)) return false;
      landed = true;
      return true;
    },
    start(): void {
      cycle?.start();
    },
    readbackStats(): ReadbackStats {
      return {
        frames: takeCount,
        meanMs: takeCount === 0 ? 0 : takeTotalMs / takeCount,
        worstMs: takeWorstMs,
      };
    },
    resetReadbackStats(): void {
      takeCount = 0;
      takeTotalMs = 0;
      takeWorstMs = 0;
    },
    get texture(): WebGLTexture {
      return (reading as RenderTarget).texture;
    },
    size(): [number, number] {
      return reading === null ? [0, 0] : [readingWidth, readingHeight];
    },
    frame(): BackgroundFrame | null {
      // The last reading that landed stays until another one lands or the size changes.
      // A frame that builds no reading, which is a frame with the grid off, therefore
      // leaves the one before it in place, and the first frame after the grid comes back
      // on reads the view the grid went off in. No label draws while the grid is off, so
      // nothing of that older reading reaches a person.
      if (!landed || pixels === null || flipped === null) return null;
      // `readPixels` gives the bottom row first. The reading a caller reads carries the
      // top row first, which is the order every screen box the labels hold is in.
      const stride = readingWidth * 4;
      for (let row = 0; row < readingHeight; row += 1) {
        const from = (readingHeight - 1 - row) * stride;
        flipped.set(pixels.subarray(from, from + stride), row * stride);
      }
      return { width: readingWidth, height: readingHeight, pixels: flipped };
    },
    read(): BackgroundReading | null {
      if (reading === null) return null;
      const target = reading;
      const bytes = new Uint8Array(readingWidth * readingHeight * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.readPixels(
        0,
        0,
        readingWidth,
        readingHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const texels: BackgroundTexel[] = [];
      // `readPixels` gives the bottom row first, so the rows are read in reverse and
      // the first texel of the reading is the top left one.
      for (let row = readingHeight - 1; row >= 0; row -= 1) {
        for (let column = 0; column < readingWidth; column += 1) {
          const at = (row * readingWidth + column) * 4;
          const r = (bytes[at] as number) / 255;
          const g = (bytes[at + 1] as number) / 255;
          const b = (bytes[at + 2] as number) / 255;
          texels.push({ r, g, b, luminance: backgroundLuminance(r, g, b) });
        }
      }
      return { width: readingWidth, height: readingHeight, texels };
    },
    dispose(): void {
      gl.deleteProgram(tonemapProgram.program);
      cycle?.dispose();
      if (steps !== null) {
        for (const step of steps) step.dispose();
      }
      mapped?.dispose();
      reading?.dispose();
      if (buffers !== null) {
        for (const buffer of buffers) gl.deleteBuffer(buffer);
      }
    },
  };
}
