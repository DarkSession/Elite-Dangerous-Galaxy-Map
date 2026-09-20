// Ties the passes together and holds the frame loop's state.
import { mat4 } from 'gl-matrix';
import { cameraPosition, projectionMatrix, viewMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import type { View } from '../camera/view';
import { galaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import type { RealSystemSet } from '../scene-data/real-systems';
import type { ShapeSet } from '../scene-data/shapes';
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
  createRangeBuffer,
  createRenderTarget,
  createShapeTexture,
  createVolumeTexture,
  RANGE_EMPTY,
  readsFloatTargets,
} from './buffers';
import type {
  DetailTexture,
  RangeBuffer,
  RenderTarget,
  ShapeTexture,
  VolumeTexture,
} from './buffers';
import {
  cloudFade,
  createCloudPass,
  createCloudProgram,
  DEFAULT_CLOUD_BRIGHTNESS,
} from './cloud-pass';
import type { CloudPass } from './cloud-pass';
import { generateCloudShapes } from './cloud-shapes';
import {
  DEFAULT_NEBULA_LIGHT_GAIN,
  DEFAULT_NEBULA_OCCLUSION,
  DEFAULT_NEBULA_STEP_RATE,
} from './nebula-slot';
import type { NebulaDraw } from './nebula-slot';
import {
  createGridPass,
  createGridProgram,
  gridLabelLevel,
  gridLevelReadings,
  gridReachPerLevel,
  gridVisibility,
} from './grid-pass';
import type { GridLevelReading, GridPass } from './grid-pass';
export type { GridLevelReading } from './grid-pass';
import { createBackgroundPass } from './background-pass';
import type {
  BackgroundFrame,
  BackgroundPass,
  BackgroundReading,
} from './background-pass';
export type { BackgroundFrame, BackgroundReading } from './background-pass';
import { createCompositePass, DEFAULT_EXPOSURE } from './composite-pass';
import type { CompositePass } from './composite-pass';
import {
  createGlowPass,
  DEFAULT_GLOW_CLAMP,
  DEFAULT_GLOW_TINT,
  DEFAULT_GLOW_WEIGHT,
} from './glow-pass';
import type { GlowPass } from './glow-pass';
import { createReducePass } from './reduce';
import type { ReducePass } from './reduce';
import {
  createPointPass,
  createPointProgram,
  DEFAULT_POINT_BRIGHTNESS,
  POINT_RADIUS_LY,
} from './point-pass';
import type { PointPass } from './point-pass';
import type { Program } from './program';
import { createRegionPass, createRegionPrograms, regionFade } from './region-pass';
import type { RegionPass, RegionPrograms } from './region-pass';
import { createShapePass, createShapePrograms } from './shape-pass';
import type { ShapePass, ShapePrograms } from './shape-pass';
import {
  createStarPass,
  createStarProgram,
  effectiveStarDistance,
  handoverRadii,
  heldCloseFade,
  STAR_LIGHT,
  starWeight,
} from './star-pass';
import type { StarPass } from './star-pass';
import {
  createMarkerRangeProgram,
  createSystemPass,
  createSystemProgram,
} from './system-pass';
import type { SystemPass } from './system-pass';
import {
  createVolumePass,
  createVolumeProgram,
  DEFAULT_ABSORPTION,
  DEFAULT_EMISSION,
} from './volume-pass';
import type { VolumePass } from './volume-pass';

/** The largest device pixel ratio the canvas follows. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** What the frames the loop drew have cost since the last reset. */
export interface FrameStats {
  /** How many frames the loop drew. */
  readonly frames: number;
  /** The mean draw time of one frame, in milliseconds. */
  readonly meanMs: number;
  /** The time of the longest single frame, in milliseconds. */
  readonly worstMs: number;
}

/** Adds up the draw times of the frames the loop draws. */
export interface FrameAccumulator {
  /** Adds one frame time, in milliseconds. */
  add(ms: number): void;
  /** Reads the count, the mean and the worst. */
  read(): FrameStats;
  /** Starts the count again. */
  reset(): void;
}

/**
 * Creates the frame time accumulator. It is built like the label sweep's `sampling`, so
 * the two report the same three numbers. It times the draw call alone: the frame budget
 * requirement forbids a wait for the card in the normal loop, so these numbers are not
 * on the same scale as `measureFrames`.
 */
export function createFrameAccumulator(): FrameAccumulator {
  let frames = 0;
  let totalMs = 0;
  let worstMs = 0;
  return {
    add(ms: number): void {
      frames += 1;
      totalMs += ms;
      if (ms > worstMs) worstMs = ms;
    },
    read(): FrameStats {
      return { frames, meanMs: frames === 0 ? 0 : totalMs / frames, worstMs };
    },
    reset(): void {
      frames = 0;
      totalMs = 0;
      worstMs = 0;
    },
  };
}

/**
 * How much of the volume's extinction the frame sends for one nebula. A value outside 0
 * to 1, and a value that is not a number, take the default. The look settings are a
 * mutable handle, so the rule runs each frame, where the uniform is set.
 */
export function nebulaOcclusionOf(value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_NEBULA_OCCLUSION;
}

/** Which passes draw. */
export interface PassSwitches {
  volume: boolean;
  clouds: boolean;
  nebulae: boolean;
  points: boolean;
  stars: boolean;
  glow: boolean;
  grid: boolean;
  regions: boolean;
  shapes: boolean;
  systems: boolean;
}

/** How bright the map draws. */
export interface LookSettings {
  emission: number;
  absorption: number;
  cloudBrightness: number;
  /**
   * The light gain the nebula march scales its emission by, one value per colour
   * channel. It changes neither the alpha nor the shape.
   */
  nebulaLightGain: [number, number, number];
  /**
   * How many march steps one object-space unit of a nebula takes. The box spans two of
   * them, and a ray takes at most 256 steps whatever this holds.
   */
  nebulaStepRate: number;
  /**
   * How much of the volume's own extinction a nebula takes, 0 to 1. At 0 the pass draws
   * what it drew before the march. A value outside the range, and a value that is not a
   * number, take the default.
   */
  nebulaOcclusion: number;
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
  /**
   * Takes the draw a nebula source built. Call it in its own animation frame. Before it
   * is called the slot is empty and no nebula draws.
   *
   * The renderer holds the slot and the source fills it. The renderer therefore imports
   * no nebula pass, no record set and no volume art, and a host that asks for no
   * nebulae carries none of the three.
   */
  setNebulae(draw: NebulaDraw): void;
  /** How many nebula instances the last frame drew. */
  nebulaDrawnCount(): number;
  /** How many draw calls the last frame's nebula pass issued: one per record drawn. */
  nebulaDrawCalls(): number;
  /** How many records passed the size floor in the last frame, before the budget. */
  nebulaAboveFloorCount(): number;
  /** How much of the screen the last frame's nebulae cover, in screen areas. */
  nebulaCoveredArea(): number;
  /** Uploads the surface detail grid. Call it in its own animation frame. */
  setDetail(detail: SurfaceDetail): void;
  /**
   * Starts the star field over a galaxy model. The model must carry the detail grid,
   * because the counts and the light both read the detailed density.
   */
  setStarField(model: GalaxyModel): void;
  /** Uploads the region boundary set. Call it in its own animation frame. */
  setRegionLines(lines: RegionLines): void;
  /** Turns the region overlay on or off. */
  setRegionDraw(draw: boolean): void;
  /**
   * Takes the shape set the shape overlay draws, or null. The set is live: the renderer
   * reads its version each frame.
   */
  setShapes(set: ShapeSet | null): void;
  /** Turns the shape overlay on or off. */
  setShapeDraw(draw: boolean): void;
  /** How many draw calls the last frame's shape overlay issued. */
  shapeDrawCalls(): number;
  /** The size of the shape line buffer in device pixels, or null while it holds none. */
  shapeLineBufferSize(): [number, number] | null;
  /**
   * How many draw calls the last frame's marker pass issued: one for the colours, and one
   * more in a frame that wrote the range buffer.
   */
  markerDrawCalls(): number;
  /**
   * The size of the range buffer in device pixels, and null where the context cannot
   * blend into a float target and the map holds none.
   */
  rangeBufferSize(): [number, number] | null;
  /**
   * The range the buffer holds at one pixel, in CSS pixels from the top left, and null
   * where the map holds no range buffer. A pixel with no marker body reads `RANGE_EMPTY`.
   */
  readRange(x: number, y: number): number | null;
  /**
   * Takes the real-system set the star field suppresses by and the marker pass draws.
   * The set is live: the renderer reads its version each frame.
   */
  setSystems(set: RealSystemSet | null): void;
  /** How many vertices the last frame's star draw issued. */
  starVertexCount(): number;
  /** The sum of the drawn counts over the last frame's boxels. */
  starDrawnCount(): number;
  /** The sum of the suppressed counts over the last frame's boxels. */
  starSuppressedCount(): number;
  /** How many markers the last frame drew. */
  systemMarkerCount(): number;
  /**
   * Chooses whether the coordinate grid draws. The grid is off unless the host asks for
   * it, so no view the map drew before this pass existed changes.
   */
  setGridDraw(draw: boolean): void;
  /** How many vertices the last frame's grid draw issued. */
  gridVertexCount(): number;
  /**
   * The spacing of the label level of the last frame, in light years, and 0 in a frame
   * the grid did not draw in.
   */
  gridSpacingLy(): number;
  /**
   * What each of the six levels of the last frame drew, in order of rising spacing. The
   * reading is empty in a frame the grid did not draw in.
   */
  gridLevels(): GridLevelReading[];
  /**
   * The width and the height of the background reading's own target, and `[0, 0]`
   * before the first frame that builds one. It reports the storage and not the last
   * reading, so a test can hold the rule that a frame without the grid takes none.
   */
  backgroundSize(): [number, number];
  /**
   * The width and the height of the region overlay's coverage buffer, and null before
   * the first frame that draws the overlay. The buffer holds the full drawing buffer
   * size, which the blur of the overlay needs.
   */
  regionCoverageSize(): [number, number] | null;
  /**
   * The background reading of the last frame, read straight off the card, or null in a
   * frame that built none. The read waits for the card, so it is a test probe and not
   * the path the labels take.
   */
  backgroundReading(): BackgroundReading | null;
  /**
   * The background reading of an earlier frame, as the read-back through the pixel
   * buffer gave it, or null while none has landed. The coordinate labels read it, so a
   * label's opacity may be one frame behind the picture.
   */
  backgroundFrame(): BackgroundFrame | null;
  /**
   * Holds the close fade at a value from 0 to 1. `null` gives the fade back to the zoom
   * distance. A test holds it at 1 to read the field at a close view.
   */
  setCloseFade(value: number | null): void;
  /**
   * Holds the near plane at a value in light years. `null` gives it back to the zoom
   * distance rule. A test holds it at 10 to draw a view against the fixed near plane the
   * map used before the rule existed. The hold
   * reaches the frame alone: `project` and `planePointAt` build their matrix from the
   * rule, so a hold below 100 light years would make the drawn frame and the projected
   * pixel disagree. The scenario the hook serves reads 500 light years and above, where
   * the rule already gives 10.
   */
  setNearPlane(value: number | null): void;
  /** Draws one frame and adds its time to the frame statistics. */
  render(view: View): void;
  /** The mean and the worst frame time since the last reset. */
  frameStats(): FrameStats;
  /** Starts the frame time mean again. */
  resetFrameStats(): void;
  /** Draws frames and returns the mean draw-to-finish time in milliseconds. */
  measureFrames(view: View, count: number): number;
  /** Chooses which passes draw. */
  setPasses(passes: Partial<PassSwitches>): void;
  /**
   * Sets how much of the volume's extinction a nebula takes. It writes the same
   * field as `look.nebulaOcclusion`, and the frame holds the range, so the two routes
   * give the same picture.
   */
  setNebulaOcclusion(value: number): void;
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
  // The scene targets are `RGBA16F`, which blends with this extension alone.
  const float = gl.getExtension('EXT_color_buffer_float') !== null;
  // The range buffer is `R32F`, and WebGL2 refuses the `MIN` blend into a 32-bit float
  // target without a second extension. It therefore takes a flag of its own: a context
  // that gives one and not the other keeps its half-float scene targets and takes the
  // no-range fallback.
  const rangeFloat = readsFloatTargets(gl);
  const triangle = createFullScreenTriangle(gl);
  const pointProgram: Program = createPointProgram(gl);
  const gridProgram: Program = createGridProgram(gl);
  const starProgram: Program = createStarProgram(gl);
  const systemProgram: Program = createSystemProgram(gl);
  // The range program writes into the range buffer alone, so a context that cannot blend
  // into a float target compiles none of it.
  const markerRangeProgram: Program | null = rangeFloat
    ? createMarkerRangeProgram(gl)
    : null;
  const regionPrograms: RegionPrograms = createRegionPrograms(gl);
  const shapePrograms: ShapePrograms = createShapePrograms(gl);
  const cloudProgram: Program = createCloudProgram(gl);
  const volumeProgram: Program = createVolumeProgram(gl);
  const composite: CompositePass = createCompositePass(gl, triangle.vertexArray);

  const shapeTexture: ShapeTexture = createShapeTexture(gl, generateCloudShapes());

  // The range buffer carries the marker bodies to the shape pass. Where the context
  // cannot blend into a float target the map holds none: every sphere then draws at a
  // share of 1 and the line step caps nothing, which is the frame this change replaces.
  const rangeBuffer: RangeBuffer | null = rangeFloat
    ? createRangeBuffer(gl, 2, 2)
    : null;

  const halfTarget: RenderTarget = createRenderTarget(gl, 2, 2, float);
  const sceneTarget: RenderTarget = createRenderTarget(gl, 2, 2, float);
  const reduce: ReducePass = createReducePass(gl, triangle.vertexArray);
  const glowPass: GlowPass = createGlowPass(gl, triangle.vertexArray, float, reduce);
  // The reading holds no storage until the first frame that builds one, so a view that
  // draws no grid pays nothing for it.
  const backgroundPass: BackgroundPass = createBackgroundPass(
    gl,
    triangle.vertexArray,
    reduce,
  );

  let pointPass: PointPass | null = null;
  let starPass: StarPass | null = null;
  let starField: StarField | null = null;
  let systemSet: RealSystemSet | null = null;
  let systemPass: SystemPass | null = null;
  let systemMarkers = 0;
  let starModel: GalaxyModel | null = null;
  let starVertices = 0;
  let starStars = 0;
  let starSuppressed = 0;
  let closeHold: number | null = null;
  let nearHold: number | null = null;
  const gridPass: GridPass = createGridPass(gl, gridProgram, triangle.vertexArray);
  let gridDraw = false;
  let gridVertices = 0;
  let gridSpacingOfFrame = 0;
  let backgroundOfFrame = false;
  let gridLevelsOfFrame: GridLevelReading[] = [];
  let regionPass: RegionPass | null = null;
  let regionDraw = true;
  const shapePass: ShapePass = createShapePass(gl, shapePrograms, triangle.vertexArray);
  let shapeSet: ShapeSet | null = null;
  let shapeDraw = true;
  let shapeCalls = 0;
  let markerCalls = 0;
  let cloudPass: CloudPass | null = null;
  let nebulaDraw: NebulaDraw | null = null;
  let nebulaDrawn = 0;
  let nebulaCalls = 0;
  let nebulaAboveFloor = 0;
  let nebulaCovered = 0;
  let volumePass: VolumePass | null = null;
  let volumeTexture: VolumeTexture | null = null;
  let volumeBox: DensityVolume | null = null;
  let detailTexture: DetailTexture | null = null;

  const passes: PassSwitches = {
    volume: true,
    clouds: true,
    nebulae: true,
    points: true,
    stars: true,
    glow: true,
    grid: true,
    regions: true,
    shapes: true,
    systems: true,
  };
  const look: LookSettings = {
    emission: DEFAULT_EMISSION,
    absorption: DEFAULT_ABSORPTION,
    cloudBrightness: DEFAULT_CLOUD_BRIGHTNESS,
    nebulaLightGain: [...DEFAULT_NEBULA_LIGHT_GAIN],
    nebulaStepRate: DEFAULT_NEBULA_STEP_RATE,
    nebulaOcclusion: DEFAULT_NEBULA_OCCLUSION,
    pointBrightness: DEFAULT_POINT_BRIGHTNESS,
    exposure: DEFAULT_EXPOSURE,
    glowWeight: DEFAULT_GLOW_WEIGHT,
    glowTint: DEFAULT_GLOW_TINT,
    glowClamp: DEFAULT_GLOW_CLAMP,
  };

  const frames: FrameAccumulator = createFrameAccumulator();

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

  // The six grid reaches, filled again for each frame the grid draws in. The buffer is
  // held here so the draw path allocates nothing.
  const gridReach: number[] = [0, 0, 0, 0, 0, 0];
  const syncPixel = new Uint8Array(4);
  // One pixel of the range buffer, for the probe the browser tests read.
  const rangePixel = new Float32Array(1);

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
      projectionMatrix(view, { width, height }, nearHold ?? undefined),
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

    // The nebulae join the volume and the clouds in the half-resolution target, after
    // the cloud sprites. The glow then reads them with the rest of the source, and the
    // tone map reads them with the rest of the scene. The blend is source-over, so a
    // dark nebula attenuates what the two passes before it drew.
    nebulaDrawn = 0;
    nebulaCalls = 0;
    nebulaAboveFloor = 0;
    nebulaCovered = 0;
    if (passes.nebulae && nebulaDraw !== null) {
      const area = viewport();
      // The march reads the volume the volume pass draws. Where the volume pass does
      // not draw, the record takes no extinction: a nebula must not be dimmed by
      // material the frame does not show.
      const marched = passes.volume && volumeTexture !== null && volumeBox !== null;
      const detail = detailTexture;
      const box = volumeBox;
      // The draw chooses the records from this frame. The size floor and the budget are
      // stated in CSS pixels, so the frame carries the canvas height and the field of
      // view beside the size of the target the boxes draw into.
      nebulaDraw.draw({
        viewProjection: viewProjection as Float32Array,
        chunkOffset: [-camera[0], -camera[1], camera[2]],
        camera: [camera[0], camera[1], camera[2]],
        distance: view.distance,
        targetSize: [halfTarget.width, halfTarget.height],
        canvasHeightCss: area.height,
        canvasWidthCss: area.width,
        fieldOfViewDegrees: FIELD_OF_VIEW_DEGREES,
        lightGain: [
          look.nebulaLightGain[0],
          look.nebulaLightGain[1],
          look.nebulaLightGain[2],
        ],
        stepRate: look.nebulaStepRate,
        volume: marched && volumeTexture !== null ? volumeTexture.texture : null,
        detail: detail === null ? null : detail.texture,
        boxMin:
          box === null
            ? [0, 0, 0]
            : [
                box.origin[0] - camera[0],
                box.origin[1] - camera[1],
                camera[2] - (box.origin[2] + box.extent[2]),
              ],
        // A box of zero size would divide by zero in the shader. The march never runs
        // without a volume, and the value is a placeholder for the frame that has none.
        boxSize:
          box === null ? [1, 1, 1] : [box.extent[0], box.extent[1], box.extent[2]],
        centre:
          box === null
            ? [0, 0, 0]
            : [
                box.origin[0] + 0.5 * box.extent[0] - camera[0],
                box.origin[1] + 0.5 * box.extent[1] - camera[1],
                camera[2] - (box.origin[2] + 0.5 * box.extent[2]),
              ],
        lo: box === null ? 0 : box.lo,
        span: box === null ? 0 : box.hi - box.lo,
        epsilon: box === null ? 0 : box.epsilon,
        absorption: look.absorption,
        detailScale: detail === null ? 0 : detail.detail.scale / 127,
        // The rule sits here, where the uniform is set, and not in a setter: `look` is
        // a handle the caller may write to in place, so a clamp in the setter alone is
        // gone around by a write to `debug.look`.
        occlusion: marched ? nebulaOcclusionOf(look.nebulaOcclusion) : 0,
      });
      nebulaDrawn = nebulaDraw.drawnCount;
      nebulaCalls = nebulaDraw.drawCalls;
      nebulaAboveFloor = nebulaDraw.aboveFloorCount;
      nebulaCovered = nebulaDraw.coveredArea;
    }

    // The scene target holds the sum of the scene passes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
    gl.viewport(0, 0, sceneTarget.width, sceneTarget.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    composite.blit(halfTarget.texture);

    // The glow adds a blurred copy of the volume, the clouds and the nebulae, so a
    // halo surrounds the disc.
    if (passes.glow && (passes.volume || passes.clouds || passes.nebulae)) {
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
    // The field and the handover read the effective zoom distance, which holds at 640
    // light years, so the base size class never steps at 320 and the point cloud's near
    // void does not halve inside the band the closest zoom opened.
    const starDistance = effectiveStarDistance(view.distance);
    const handover = handoverRadii(starDistance);
    // The weight follows the zoom distance alone while the field stands. The star
    // switch does not change it, so a frame drawn with the star pass off holds the same
    // point cloud as the frame drawn with it on. A field that has not loaded yet is the
    // one case that gives the point cloud its near field back, so the first frames of a
    // close view are not empty.
    const hasField = starPass !== null && starField !== null;
    const drawsStars = passes.stars && hasField;
    const weight = hasField ? starWeight(view.distance) : 0;
    // The close fade takes the field's light out of the frame as the camera comes in. It
    // multiplies the star pass's weight alone: the point pass keeps the handover weight,
    // so the light the field gives up leaves the frame rather than moving to the cloud.
    const close = heldCloseFade(closeHold, view.distance);
    starVertices = 0;
    starStars = 0;
    starSuppressed = 0;
    systemMarkers = 0;

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
    // far view drew before the star field existed. The guard reads the handover weight
    // alone and not the product, so the field still builds its table and the sweep still
    // runs below 640 light years, where the close fade holds the light at 0.
    if (drawsStars && weight > 0 && starPass !== null && starField !== null) {
      const table = starField.update(camera, starDistance);
      starPass.draw({
        viewProjection: viewProjection as Float32Array,
        focal,
        weight: weight * close,
        handover,
        table,
      });
      starVertices = starPass.vertexCount;
      starStars = table.drawnStars;
      starSuppressed = table.suppressedStars;
    }

    // The tone map writes the frame the user sees.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    composite.tonemap(sceneTarget.texture, look.exposure);

    // The coordinate grid draws over the tone map and before the region overlay and the
    // markers, so a boundary and a marker both draw over a grid line and the grid adds
    // no light the tone map reads.
    gridVertices = 0;
    const pixelRatio = width / Math.max(1, canvas.clientWidth);
    const focalCss = focal / pixelRatio;
    // The grid fades in as the camera comes near: nothing at 12,000 light years and
    // further, full at 4,000 and nearer. A band of 0 draws nothing at all, so the pass
    // does not run and the three probes read what they read for a grid that is off.
    const band = gridVisibility(view.distance);
    backgroundOfFrame = passes.grid && gridDraw && band > 0;
    if (backgroundOfFrame) {
      // The reading is built from the scene target and not from the frame the user
      // sees, so the region overlay and the markers are not in it: the grid merges with
      // the galaxy and not with the other overlays.
      backgroundPass.render(sceneTarget.texture, width, height, look.exposure);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);

      gridSpacingOfFrame = gridLabelLevel(focalCss, view.distance);
      gridLevelsOfFrame = gridLevelReadings(focalCss, view.distance);
      gridVertices = gridPass.draw({
        inverseViewProjection: inverseViewProjection as Float32Array,
        cursor: view.cursor,
        camera,
        pixelRatio,
        bounds: galaxyModel.bounds,
        band,
        // Every level reaches 100 of its own lines each side of the cursor and no
        // further, so the reach of a level follows the level and never the zoom.
        reach: gridReachPerLevel(gridReach),
        background: backgroundPass.texture,
      });
    } else {
      // The three probes must agree: a frame with no grid reports no vertices, no
      // spacing and no levels, and not the readings of the frame the grid last drew in.
      gridSpacingOfFrame = 0;
      gridLevelsOfFrame = [];
    }

    // The region boundaries are an overlay, not scene light. They draw over the
    // finished frame with alpha blending. A fade of 0 draws nothing at all, so the far
    // view is the frame it was before the overlay existed.
    const regions = regionFade(view.distance);
    if (passes.regions && regionDraw && regionPass !== null && regions > 0) {
      regionPass.draw({
        viewProjection: viewProjection as Float32Array,
        inverseViewProjection: inverseViewProjection as Float32Array,
        // The galactic plane is `y = 0` in game coordinates, and the world frame is
        // camera-relative, so the plane sits one camera height below the origin.
        planeY: -camera[1],
        chunkOffset: [-camera[0], -camera[1], camera[2]],
        fade: regions,
        pixelRatio,
      });
    }

    // The markers draw over the tone map and over the boundary overlay, and before the
    // shapes. A sphere is a space that holds systems, so it must be able to wash the
    // markers inside it and behind it, and it can only do that over markers the frame
    // already holds. The range buffer is what keeps it off the markers in front of it.
    const drawnShapes = passes.shapes && shapeDraw ? shapeSet : null;
    // The instance buffers are written here and not in the draw below, because the marker
    // pass needs to know whether a sphere draws before it draws itself.
    const shapeCounts =
      drawnShapes === null
        ? { spheres: 0, segments: 0 }
        : shapePass.prepare(drawnShapes);
    // A map with no shape that draws writes no range, and costs what it costs without the
    // buffer. A line reads the buffer as a sphere does: the line step caps its own wash
    // over a marker body, and a set of lines and no sphere is an ordinary set, so the
    // range draw follows the shapes and not the spheres alone.
    const rangeTarget =
      shapeCounts.spheres > 0 || shapeCounts.segments > 0 ? rangeBuffer : null;
    if (rangeTarget !== null) {
      // The shape steps read the buffer at their own fragment coordinate, so it holds the
      // drawing buffer size and not a share of it. The size follows the first frame that
      // draws a shape and not the resize, because 1920x1080 of one float a pixel is
      // 8.3 MB and a map that draws no shape reads none of it.
      rangeTarget.resize(width, height);
      // The clear runs here and not in the marker pass, because a frame with a sphere and
      // no marker must read an empty buffer and not the markers of an older frame.
      gl.bindFramebuffer(gl.FRAMEBUFFER, rangeTarget.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearBufferfv(gl.COLOR, 0, [RANGE_EMPTY, 0, 0, 0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    }

    markerCalls = 0;
    if (passes.systems && systemPass !== null && systemSet !== null) {
      systemMarkers = systemPass.draw({
        viewProjection: viewProjection as Float32Array,
        camera,
        // The cursor in the camera-relative world frame, whose third axis runs the other
        // way to the game's. The draw-range cut measures from this point.
        cursorOffset: [
          view.cursor[0] - camera[0],
          view.cursor[1] - camera[1],
          camera[2] - view.cursor[2],
        ],
        pixelRatio,
        set: systemSet,
        range: rangeTarget === null ? null : rangeTarget.framebuffer,
      });
      markerCalls = systemPass.drawCalls();
    }

    // The shapes draw last: the spheres over the markers, washing each by how much of the
    // shell lies behind it, and then the lines. A line carries no range of its own, so it
    // draws after the spheres and a limb never erases a route.
    shapeCalls = 0;
    if (drawnShapes !== null) {
      shapeCalls = shapePass.draw({
        viewProjection: viewProjection as Float32Array,
        camera,
        pixelRatio,
        focal,
        set: drawnShapes,
        range: rangeTarget === null ? null : rangeTarget.texture,
      });
    }
  };

  return {
    resize,
    setVolume(volume: DensityVolume): void {
      // The renderer owns the texture, because the volume pass draws it and the nebula
      // pass marches it. One upload serves both.
      volumeTexture?.dispose();
      volumeBox = volume;
      volumeTexture = createVolumeTexture(gl, volume);
      volumePass = createVolumePass(
        gl,
        volumeProgram,
        volumeTexture,
        triangle.vertexArray,
      );
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
    setNebulae(draw: NebulaDraw): void {
      // The source builds the draw and throws on volumes the textures cannot hold or
      // on a context that gives no buffer. The old draw is disposed after the new one
      // arrives, so a call that throws leaves the frame drawing the draw it had.
      nebulaDraw?.dispose();
      nebulaDraw = draw;
    },
    nebulaDrawnCount(): number {
      return nebulaDrawn;
    },
    nebulaDrawCalls(): number {
      return nebulaCalls;
    },
    nebulaAboveFloorCount(): number {
      return nebulaAboveFloor;
    },
    nebulaCoveredArea(): number {
      return nebulaCovered;
    },
    setDetail(detail: SurfaceDetail): void {
      detailTexture?.dispose();
      detailTexture = createDetailTexture(gl, detail);
    },
    setRegionLines(lines: RegionLines): void {
      regionPass?.dispose();
      regionPass = createRegionPass(gl, regionPrograms, lines, triangle.vertexArray);
    },
    setRegionDraw(draw: boolean): void {
      regionDraw = draw;
    },
    setShapes(set: ShapeSet | null): void {
      shapeSet = set;
    },
    setShapeDraw(draw: boolean): void {
      shapeDraw = draw;
    },
    shapeDrawCalls(): number {
      return shapeCalls;
    },
    shapeLineBufferSize(): [number, number] | null {
      return shapePass.lineBufferSize();
    },
    markerDrawCalls(): number {
      return markerCalls;
    },
    rangeBufferSize(): [number, number] | null {
      return rangeBuffer === null ? null : [rangeBuffer.width, rangeBuffer.height];
    },
    readRange(x: number, y: number): number | null {
      if (rangeBuffer === null) return null;
      // The buffer takes the drawing buffer size on the first frame that draws a shape,
      // so before that frame it is the 2 x 2 it started at. A read of the canvas
      // coordinate would then fall outside it, so the caller gets `null` instead.
      if (rangeBuffer.width !== canvas.width || rangeBuffer.height !== canvas.height) {
        return null;
      }
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      const deviceX = Math.min(canvas.width - 1, Math.max(0, Math.round(x * ratio)));
      const deviceY = Math.min(canvas.height - 1, Math.max(0, Math.round(y * ratio)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, rangeBuffer.framebuffer);
      // `readPixels` counts rows from the bottom and the caller counts them from the top.
      gl.readPixels(
        deviceX,
        canvas.height - 1 - deviceY,
        1,
        1,
        gl.RED,
        gl.FLOAT,
        rangePixel,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return rangePixel[0] as number;
    },
    setStarField(model: GalaxyModel): void {
      starPass?.dispose();
      starModel = model;
      starField = createStarField(model, {
        starLight: STAR_LIGHT,
        systems: systemSet,
      });
      starPass = createStarPass(gl, starProgram);
    },
    setSystems(set: RealSystemSet | null): void {
      systemSet = set;
      systemPass?.dispose();
      systemPass =
        set === null ? null : createSystemPass(gl, systemProgram, markerRangeProgram);
      // The field holds the set it was made with, so a set that arrives after the model
      // needs a new field. The model is the only other input, so this costs one build.
      if (starModel !== null) {
        starField = createStarField(starModel, {
          starLight: STAR_LIGHT,
          systems: set,
        });
      }
    },
    starVertexCount(): number {
      return starVertices;
    },
    starDrawnCount(): number {
      return starStars;
    },
    starSuppressedCount(): number {
      return starSuppressed;
    },
    systemMarkerCount(): number {
      return systemMarkers;
    },
    setGridDraw(draw: boolean): void {
      gridDraw = draw;
    },
    gridVertexCount(): number {
      return gridVertices;
    },
    gridSpacingLy(): number {
      return gridSpacingOfFrame;
    },
    gridLevels(): GridLevelReading[] {
      return gridLevelsOfFrame;
    },
    backgroundSize(): [number, number] {
      return backgroundPass.size();
    },
    regionCoverageSize(): [number, number] | null {
      return regionPass?.coverageSize() ?? null;
    },
    backgroundReading(): BackgroundReading | null {
      return backgroundOfFrame ? backgroundPass.read() : null;
    },
    backgroundFrame(): BackgroundFrame | null {
      return backgroundPass.frame();
    },
    setCloseFade(value: number | null): void {
      closeHold = value;
    },
    setNearPlane(value: number | null): void {
      nearHold = value;
    },
    render(view: View): void {
      const start = performance.now();
      drawFrame(view);
      frames.add(performance.now() - start);
    },
    frameStats(): FrameStats {
      return frames.read();
    },
    resetFrameStats(): void {
      frames.reset();
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
    setNebulaOcclusion(value: number): void {
      look.nebulaOcclusion = value;
    },
    setPasses(next: Partial<PassSwitches>): void {
      if (next.volume !== undefined) passes.volume = next.volume;
      if (next.clouds !== undefined) passes.clouds = next.clouds;
      if (next.nebulae !== undefined) passes.nebulae = next.nebulae;
      if (next.points !== undefined) passes.points = next.points;
      if (next.stars !== undefined) passes.stars = next.stars;
      if (next.grid !== undefined) passes.grid = next.grid;
      if (next.regions !== undefined) passes.regions = next.regions;
      if (next.shapes !== undefined) passes.shapes = next.shapes;
      if (next.glow !== undefined) passes.glow = next.glow;
      if (next.systems !== undefined) passes.systems = next.systems;
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
      systemPass?.dispose();
      rangeBuffer?.dispose();
      gridPass.dispose();
      regionPass?.dispose();
      shapePass.dispose();
      cloudPass?.dispose();
      nebulaDraw?.dispose();
      volumeTexture?.dispose();
      detailTexture?.dispose();
      shapeTexture.dispose();
      glowPass.dispose();
      backgroundPass.dispose();
      reduce.dispose();
      gl.deleteProgram(pointProgram.program);
      gl.deleteProgram(starProgram.program);
      gl.deleteProgram(systemProgram.program);
      if (markerRangeProgram !== null) gl.deleteProgram(markerRangeProgram.program);
      gl.deleteProgram(gridProgram.program);
      gl.deleteProgram(regionPrograms.ribbon.program);
      gl.deleteProgram(regionPrograms.composite.program);
      gl.deleteProgram(shapePrograms.spheres.program);
      gl.deleteProgram(shapePrograms.lines.program);
      gl.deleteProgram(shapePrograms.composite.program);
      gl.deleteProgram(cloudProgram.program);
      gl.deleteProgram(volumeProgram.program);
      composite.dispose();
      triangle.dispose();
      halfTarget.dispose();
      sceneTarget.dispose();
    },
  };
}
