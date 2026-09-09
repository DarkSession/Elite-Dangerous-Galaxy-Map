// Ties the passes together and holds the frame loop's state.
import { mat4 } from 'gl-matrix';
import { cameraPosition, projectionMatrix, viewMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import type { View } from '../camera/view';
import type { GalaxyModel } from '../galaxy-model/model';
import { createStarField } from '../scene-data/star-field';
import type { StarField } from '../scene-data/star-field';
import type {
  CloudSet,
  DensityVolume,
  PointCloud,
  RegionLines,
  SurfaceDetail,
} from '../scene-data/types';
import {
  createCloudBuffers,
  createDetailTexture,
  createFullScreenTriangle,
  createRenderTarget,
  createShapeTexture,
} from './buffers';
import type { DetailTexture, RenderTarget, ShapeTexture } from './buffers';
import {
  cloudFade,
  createCloudPass,
  createCloudProgram,
  DEFAULT_CLOUD_BRIGHTNESS,
} from './cloud-pass';
import type { CloudPass } from './cloud-pass';
import { generateCloudShapes } from './cloud-shapes';
import { createCompositePass, DEFAULT_EXPOSURE } from './composite-pass';
import type { CompositePass } from './composite-pass';
import {
  createGlowPass,
  DEFAULT_GLOW_CLAMP,
  DEFAULT_GLOW_TINT,
  DEFAULT_GLOW_WEIGHT,
} from './glow-pass';
import type { GlowPass } from './glow-pass';
import {
  createPointPass,
  createPointProgram,
  DEFAULT_POINT_BRIGHTNESS,
  POINT_RADIUS_LY,
} from './point-pass';
import type { PointPass } from './point-pass';
import type { Program } from './program';
import { createRegionPass, createRegionProgram, regionFade } from './region-pass';
import type { RegionPass } from './region-pass';
import {
  createStarPass,
  createStarProgram,
  handoverRadii,
  STAR_LIGHT,
  starWeight,
} from './star-pass';
import type { StarPass } from './star-pass';
import {
  createVolumePass,
  createVolumeProgram,
  DEFAULT_ABSORPTION,
  DEFAULT_EMISSION,
} from './volume-pass';
import type { VolumePass } from './volume-pass';

/** The largest device pixel ratio the canvas follows. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** Which passes draw. */
export interface PassSwitches {
  volume: boolean;
  clouds: boolean;
  points: boolean;
  stars: boolean;
  glow: boolean;
  regions: boolean;
}

/** How bright the map draws. */
export interface LookSettings {
  emission: number;
  absorption: number;
  cloudBrightness: number;
  pointBrightness: number;
  exposure: number;
  glowWeight: number;
  glowTint: number;
  glowClamp: number;
}

/** The renderer. */
export interface Renderer {
  /** Matches the drawing buffer to the canvas and the device pixel ratio. */
  resize(): void;
  /** Uploads the density volume. Call it in its own animation frame. */
  setVolume(volume: DensityVolume): void;
  /** Uploads the point cloud. Call it in its own animation frame. */
  setPointCloud(cloud: PointCloud): void;
  /** Uploads the cloud set. Call it in its own animation frame. */
  setCloudSet(set: CloudSet): void;
  /** Uploads the surface detail grid. Call it in its own animation frame. */
  setDetail(detail: SurfaceDetail): void;
  /**
   * Starts the star field over a galaxy model. The model must carry the detail grid,
   * because the counts and the light both read the detailed density.
   */
  setStarField(model: GalaxyModel): void;
  /** Uploads the region boundary set. Call it in its own animation frame. */
  setRegionLines(lines: RegionLines): void;
  /** How many vertices the last frame's star draw issued. */
  starVertexCount(): number;
  /** The sum of the drawn counts over the last frame's boxels. */
  starDrawnCount(): number;
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
  /**
   * Reads a rectangle of pixels, in CSS pixels from the top left. The result holds
   * four bytes per pixel, row by row, and the first row is the top one. It throws a
   * `RangeError` if any part of the rectangle is outside the drawing buffer.
   */
  readRect(x: number, y: number, width: number, height: number): Uint8Array;
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
  const starProgram: Program = createStarProgram(gl);
  const regionProgram: Program = createRegionProgram(gl);
  const cloudProgram: Program = createCloudProgram(gl);
  const volumeProgram: Program = createVolumeProgram(gl);
  const composite: CompositePass = createCompositePass(gl, triangle.vertexArray);

  const shapeTexture: ShapeTexture = createShapeTexture(gl, generateCloudShapes());

  const halfTarget: RenderTarget = createRenderTarget(gl, 2, 2, float);
  const sceneTarget: RenderTarget = createRenderTarget(gl, 2, 2, float);
  const glowPass: GlowPass = createGlowPass(gl, triangle.vertexArray, float);

  let pointPass: PointPass | null = null;
  let starPass: StarPass | null = null;
  let starField: StarField | null = null;
  let starVertices = 0;
  let starStars = 0;
  let regionPass: RegionPass | null = null;
  let cloudPass: CloudPass | null = null;
  let volumePass: VolumePass | null = null;
  let volumeBox: DensityVolume | null = null;
  let detailTexture: DetailTexture | null = null;

  const passes: PassSwitches = {
    volume: true,
    clouds: true,
    points: true,
    stars: true,
    glow: true,
    regions: true,
  };
  const look: LookSettings = {
    emission: DEFAULT_EMISSION,
    absorption: DEFAULT_ABSORPTION,
    cloudBrightness: DEFAULT_CLOUD_BRIGHTNESS,
    pointBrightness: DEFAULT_POINT_BRIGHTNESS,
    exposure: DEFAULT_EXPOSURE,
    glowWeight: DEFAULT_GLOW_WEIGHT,
    glowTint: DEFAULT_GLOW_TINT,
    glowClamp: DEFAULT_GLOW_CLAMP,
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
    glowPass.resize(width, height);
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
      const detail = detailTexture;
      volumePass.draw({
        inverseViewProjection: inverseViewProjection as Float32Array,
        boxMin: [
          origin[0] - camera[0],
          origin[1] - camera[1],
          camera[2] - (origin[2] + extent[2]),
        ],
        boxSize: [extent[0], extent[1], extent[2]],
        // The volume box is centred on the galactic centre in the plane, so the
        // fade by radius needs no value from the model. The test "has its plane
        // mid-point at the model centre" in `src/scene-data/volume.test.ts` holds that.
        centre: [
          origin[0] + 0.5 * extent[0] - camera[0],
          origin[1] + 0.5 * extent[1] - camera[1],
          camera[2] - (origin[2] + 0.5 * extent[2]),
        ],
        emission: look.emission,
        absorption: look.absorption,
        detail: detail === null ? null : detail.texture,
        detailScale: detail === null ? 0 : detail.detail.scale / 127,
      });
    }

    // The cloud sprites join the volume in the half-resolution target, so the glow
    // reads the same source as the halo it made before. The pass needs the galactic
    // centre for its fade at the rim, and the volume box carries it, so the pass
    // waits for the volume. One scene message sets the volume before the cloud set.
    if (passes.clouds && cloudPass !== null && volumeBox !== null) {
      const halfFocal =
        halfTarget.height / (2 * Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360));
      const origin = volumeBox.origin;
      const extent = volumeBox.extent;
      cloudPass.draw({
        viewProjection: viewProjection as Float32Array,
        chunkOffset: [-camera[0], -camera[1], camera[2]],
        centre: [
          origin[0] + 0.5 * extent[0] - camera[0],
          origin[1] + 0.5 * extent[1] - camera[1],
          camera[2] - (origin[2] + 0.5 * extent[2]),
        ],
        targetSize: [halfTarget.width, halfTarget.height],
        spriteScale: halfFocal,
        brightness: look.cloudBrightness,
        fade: cloudFade(view.distance),
      });
    }

    // The scene target holds the sum of the scene passes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
    gl.viewport(0, 0, sceneTarget.width, sceneTarget.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    composite.blit(halfTarget.texture);

    // The glow adds a blurred copy of the volume and the clouds, so a halo
    // surrounds the disc.
    if (passes.glow && (passes.volume || passes.clouds)) {
      glowPass.render(
        halfTarget.texture,
        look.glowWeight,
        look.glowTint,
        look.glowClamp,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
      gl.viewport(0, 0, sceneTarget.width, sceneTarget.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      composite.blit(glowPass.texture);
      gl.disable(gl.BLEND);
    }

    // The star field takes the near field over from the point cloud below a zoom
    // distance of 8,000 light years. The two carry one weight between them, so their
    // shares sum to 1 at every range and the total light does not change.
    const focal = height / (2 * Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360));
    const handover = handoverRadii(view.distance);
    const drawsStars = passes.stars && starPass !== null && starField !== null;
    const weight = drawsStars ? starWeight(view.distance) : 0;
    starVertices = 0;
    starStars = 0;

    if (passes.points && pointPass !== null) {
      pointPass.draw({
        viewProjection: viewProjection as Float32Array,
        chunkOffset: [-camera[0], -camera[1], camera[2]],
        pointScale: focal * POINT_RADIUS_LY,
        brightness: look.pointBrightness,
        handoverWeight: weight,
        handover,
      });
    }

    // A weight of 0 draws nothing, so above 8,000 light years the frame is the one the
    // far view drew before the star field existed.
    if (drawsStars && weight > 0 && starPass !== null && starField !== null) {
      const table = starField.update(camera, view.distance);
      starPass.draw({
        viewProjection: viewProjection as Float32Array,
        focal,
        weight,
        handover,
        table,
      });
      starVertices = starPass.vertexCount;
      starStars = table.drawnStars;
    }

    // The tone map writes the frame the user sees.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    composite.tonemap(sceneTarget.texture, look.exposure);

    // The region boundaries are an overlay, not scene light. They draw over the
    // finished frame with alpha blending. A fade of 0 draws nothing at all, so the far
    // view is the frame it was before the overlay existed.
    const regions = regionFade(view.distance);
    if (passes.regions && regionPass !== null && regions > 0) {
      regionPass.draw({
        viewProjection: viewProjection as Float32Array,
        chunkOffset: [-camera[0], -camera[1], camera[2]],
        fade: regions,
      });
    }
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
    setCloudSet(set: CloudSet): void {
      cloudPass?.dispose();
      cloudPass = createCloudPass(
        gl,
        cloudProgram,
        createCloudBuffers(gl, set),
        shapeTexture,
      );
    },
    setDetail(detail: SurfaceDetail): void {
      detailTexture?.dispose();
      detailTexture = createDetailTexture(gl, detail);
    },
    setRegionLines(lines: RegionLines): void {
      regionPass?.dispose();
      regionPass = createRegionPass(gl, regionProgram, lines);
    },
    setStarField(model: GalaxyModel): void {
      starPass?.dispose();
      starField = createStarField(model, { starLight: STAR_LIGHT });
      starPass = createStarPass(gl, starProgram);
    },
    starVertexCount(): number {
      return starVertices;
    },
    starDrawnCount(): number {
      return starStars;
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
      if (next.clouds !== undefined) passes.clouds = next.clouds;
      if (next.points !== undefined) passes.points = next.points;
      if (next.stars !== undefined) passes.stars = next.stars;
      if (next.regions !== undefined) passes.regions = next.regions;
      if (next.glow !== undefined) passes.glow = next.glow;
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
    readRect(x: number, y: number, width: number, height: number): Uint8Array {
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      const wide = Math.max(1, Math.round(width * ratio));
      const tall = Math.max(1, Math.round(height * ratio));
      const left = Math.round(x * ratio);
      const top = Math.round(y * ratio);
      // A rectangle that leaves the frame is a fault in the caller. A silent move back
      // inside would give a test a different sample from the one it asked for.
      if (
        left < 0 ||
        top < 0 ||
        left + wide > canvas.width ||
        top + tall > canvas.height
      ) {
        throw new RangeError(
          `readRect ${x},${y} ${width}x${height} leaves the ` +
            `${canvas.width}x${canvas.height} drawing buffer`,
        );
      }
      const rows = new Uint8Array(wide * tall * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(
        left,
        canvas.height - top - tall,
        wide,
        tall,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rows,
      );
      // `readPixels` gives the bottom row first, so the copy turns the block over.
      const result = new Uint8Array(rows.length);
      const stride = wide * 4;
      for (let row = 0; row < tall; row += 1) {
        result.set(
          rows.subarray((tall - 1 - row) * stride, (tall - row) * stride),
          row * stride,
        );
      }
      return result;
    },
    dispose(): void {
      pointPass?.dispose();
      starPass?.dispose();
      regionPass?.dispose();
      cloudPass?.dispose();
      volumePass?.dispose();
      detailTexture?.dispose();
      shapeTexture.dispose();
      glowPass.dispose();
      gl.deleteProgram(pointProgram.program);
      gl.deleteProgram(starProgram.program);
      gl.deleteProgram(regionProgram.program);
      gl.deleteProgram(cloudProgram.program);
      gl.deleteProgram(volumeProgram.program);
      composite.dispose();
      triangle.dispose();
      halfTarget.dispose();
      sceneTarget.dispose();
    },
  };
}
