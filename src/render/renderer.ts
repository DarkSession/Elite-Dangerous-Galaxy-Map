// Ties the passes together and holds the frame loop's state.
import { mat4 } from 'gl-matrix';
import { cameraPosition, projectionMatrix, viewMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import type { View } from '../camera/view';
import type { DensityVolume, PointCloud } from '../scene-data/types';
import { createFullScreenTriangle, createRenderTarget } from './buffers';
import type { RenderTarget } from './buffers';
import { createCompositePass, DEFAULT_EXPOSURE } from './composite-pass';
import type { CompositePass } from './composite-pass';
import { createPointPass, createPointProgram, POINT_RADIUS_LY } from './point-pass';
import type { PointPass } from './point-pass';
import type { Program } from './program';
import {
  createVolumePass,
  createVolumeProgram,
  DEFAULT_ABSORPTION,
  DEFAULT_EMISSION,
} from './volume-pass';
import type { VolumePass } from './volume-pass';

/** The largest device pixel ratio the canvas follows. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** The brightness of one point cloud sample. */
export const DEFAULT_POINT_BRIGHTNESS = 1.5;

/** Which passes draw. */
export interface PassSwitches {
  volume: boolean;
  points: boolean;
}

/** How bright the map draws. */
export interface LookSettings {
  emission: number;
  absorption: number;
  pointBrightness: number;
  exposure: number;
}

/** The renderer. */
export interface Renderer {
  /** Matches the drawing buffer to the canvas and the device pixel ratio. */
  resize(): void;
  /** Uploads the density volume. Call it in its own animation frame. */
  setVolume(volume: DensityVolume): void;
  /** Uploads the point cloud. Call it in its own animation frame. */
  setPointCloud(cloud: PointCloud): void;
  /** Draws one frame. */
  render(view: View): void;
  /** Draws frames and returns the mean draw-to-finish time in milliseconds. */
  measureFrames(view: View, count: number): number;
  /** Chooses which passes draw. */
  setPasses(passes: Partial<PassSwitches>): void;
  /** Reads the look settings, which the caller may change in place. */
  readonly look: LookSettings;
  /** The drawing area in CSS pixels. */
  viewport(): Viewport;
  /** The drawing buffer size in device pixels. */
  drawingBufferSize(): [number, number];
  /** Reads one pixel, in CSS pixels from the top left. */
  readPixel(x: number, y: number): [number, number, number, number];
  dispose(): void;
}

/** Creates the renderer and compiles every program. */
export function createRenderer(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
): Renderer {
  const float = gl.getExtension('EXT_color_buffer_float') !== null;
  const triangle = createFullScreenTriangle(gl);
  const pointProgram: Program = createPointProgram(gl);
  const volumeProgram: Program = createVolumeProgram(gl);
  const composite: CompositePass = createCompositePass(gl, triangle.vertexArray);

  const halfTarget: RenderTarget = createRenderTarget(gl, 2, 2, float);
  const sceneTarget: RenderTarget = createRenderTarget(gl, 2, 2, float);

  let pointPass: PointPass | null = null;
  let volumePass: VolumePass | null = null;
  let volumeBox: DensityVolume | null = null;

  const passes: PassSwitches = { volume: true, points: true };
  const look: LookSettings = {
    emission: DEFAULT_EMISSION,
    absorption: DEFAULT_ABSORPTION,
    pointBrightness: DEFAULT_POINT_BRIGHTNESS,
    exposure: DEFAULT_EXPOSURE,
  };

  const viewProjection = mat4.create();
  const inverseViewProjection = mat4.create();

  const resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    sceneTarget.resize(width, height);
    halfTarget.resize(Math.max(1, width >> 1), Math.max(1, height >> 1));
  };

  const syncPixel = new Uint8Array(4);

  // `gl.finish()` alone does not wait in this browser: the commands sit in the
  // renderer process's command buffer and the call returns at once. Reading one pixel
  // forces the round trip to the card, so the measurement holds the GPU work. A fence
  // does not help here, because the client only learns that it is signalled between
  // tasks, and this loop never yields.
  const waitForGpu = (): void => {
    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
  };

  const viewport = (): Viewport => ({
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
  });

  const drawFrame = (view: View): void => {
    resize();
    const width = canvas.width;
    const height = canvas.height;

    mat4.multiply(
      viewProjection,
      projectionMatrix({ width, height }),
      viewMatrix(view),
    );
    mat4.invert(inverseViewProjection, viewProjection);

    const camera = cameraPosition(view);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // The volume draws first, at half resolution.
    gl.bindFramebuffer(gl.FRAMEBUFFER, halfTarget.framebuffer);
    gl.viewport(0, 0, halfTarget.width, halfTarget.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (passes.volume && volumePass !== null && volumeBox !== null) {
      const origin = volumeBox.origin;
      const extent = volumeBox.extent;
      volumePass.draw({
        inverseViewProjection: inverseViewProjection as Float32Array,
        boxMin: [
          origin[0] - camera[0],
          origin[1] - camera[1],
          camera[2] - (origin[2] + extent[2]),
        ],
        boxSize: [extent[0], extent[1], extent[2]],
        emission: look.emission,
        absorption: look.absorption,
      });
    }

    // The scene target holds the sum of both passes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
    gl.viewport(0, 0, sceneTarget.width, sceneTarget.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    composite.blit(halfTarget.texture);

    if (passes.points && pointPass !== null) {
      const focal = height / (2 * Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360));
      pointPass.draw({
        viewProjection: viewProjection as Float32Array,
        chunkOffset: [-camera[0], -camera[1], camera[2]],
        pointScale: focal * POINT_RADIUS_LY,
        brightness: look.pointBrightness,
      });
    }

    // The tone map writes the frame the user sees.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    composite.tonemap(sceneTarget.texture, look.exposure);
  };

  return {
    resize,
    setVolume(volume: DensityVolume): void {
      volumePass?.dispose();
      volumeBox = volume;
      volumePass = createVolumePass(gl, volumeProgram, volume, triangle.vertexArray);
    },
    setPointCloud(cloud: PointCloud): void {
      pointPass?.dispose();
      pointPass = createPointPass(gl, pointProgram, cloud);
    },
    render(view: View): void {
      drawFrame(view);
    },
    measureFrames(view: View, count: number): number {
      if (count < 1) return 0;
      // A first frame warms the pipeline, so the mean measures steady state.
      drawFrame(view);
      waitForGpu();
      let total = 0;
      for (let index = 0; index < count; index += 1) {
        const start = performance.now();
        drawFrame(view);
        waitForGpu();
        total += performance.now() - start;
      }
      return total / count;
    },
    setPasses(next: Partial<PassSwitches>): void {
      if (next.volume !== undefined) passes.volume = next.volume;
      if (next.points !== undefined) passes.points = next.points;
    },
    look,
    viewport,
    drawingBufferSize(): [number, number] {
      return [canvas.width, canvas.height];
    },
    readPixel(x: number, y: number): [number, number, number, number] {
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      const deviceX = Math.min(canvas.width - 1, Math.max(0, Math.round(x * ratio)));
      const deviceY = Math.min(canvas.height - 1, Math.max(0, Math.round(y * ratio)));
      const pixel = new Uint8Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(
        deviceX,
        canvas.height - 1 - deviceY,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      return [
        pixel[0] as number,
        pixel[1] as number,
        pixel[2] as number,
        pixel[3] as number,
      ];
    },
    dispose(): void {
      pointPass?.dispose();
      volumePass?.dispose();
      gl.deleteProgram(pointProgram.program);
      gl.deleteProgram(volumeProgram.program);
      composite.dispose();
      triangle.dispose();
      halfTarget.dispose();
      sceneTarget.dispose();
    },
  };
}
