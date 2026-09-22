// The renderer probes the browser tests read.
//
// The set is not part of the supported surface: `src/index.ts` does not export it and
// the wiki holds no page for it. It lived in `create-map.ts`, which is the entry point
// a host reads, and it is 400 lines of probe there.
//
// `createDebug` takes one dependency object of getters, because every thing it reads is
// built after the map handle is: the renderer, the context, the controls and the three
// overlays each arrive with the start chain.
import type { Controls } from '../camera/controls';
import { planePoint, project } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import type { HudHandle } from '../hud/types';
import type { RenderContextResult } from '../render/context';
import { createProgram } from '../render/program';
import type {
  BackgroundReading,
  FrameAccumulator,
  FrameStats,
  GridLevelReading,
  IconPlacement,
  LookSettings,
  PassSwitches,
  ReadbackStats,
  Renderer,
} from '../render/renderer';
import type { RealSystemSet } from '../scene-data/real-systems';
import { coarseRegionIdAt, regionOfId } from '../scene-data/regions';
import type { ShapeSet } from '../scene-data/shapes';
import type { CoarseRegionGrid, RegionLines } from '../scene-data/types';
import type { GridLabelOverlay, GridLabelPlaced } from './grid-labels';
import type { LabelOverlay, SamplingStats } from './labels';

/**
 * The renderer probes the browser tests read. This is not part of the supported
 * surface, and phase 4 may change it.
 */
export interface GalaxyMapDebug {
  setPasses(passes: Partial<PassSwitches>): void;
  /**
   * Sets how much of the volume's extinction a nebula takes, 0 to 1. It writes
   * the same field as `look.nebulaOcclusion`. The setter sits beside the mutable handle
   * because the browser tests reach the hook through `window.__galaxyMap`, where a named
   * call is what the page can expose and type. The frame holds the range, so both routes
   * give the same picture.
   */
  setNebulaOcclusion(value: number): void;
  /**
   * Draws the nebula records in the reverse order. The pass composites without an
   * order, so the frame does not change, and the browser test that reads that is the
   * one caller.
   */
  setNebulaOrderReversed(value: boolean): void;
  readonly look: LookSettings;
  measureFrames(count: number): number;
  frameStats(): FrameStats;
  resetFrameStats(): void;
  drawNow(): void;
  /**
   * Wakes the frame loop, as a change of the map does. A pointer move renders no canvas,
   * so a browser test that holds the map awake with pointer moves calls this beside each
   * one.
   */
  wake(): void;
  starVertexCount(): number;
  starDrawnCount(): number;
  starSuppressedCount(): number;
  systemMarkerCount(): number;
  /** How many nebula instances the last frame drew. */
  nebulaDrawnCount(): number;
  /** How many draw calls the last frame's nebula pass issued. */
  nebulaDrawCalls(): number;
  /** How many records passed the size floor in the last frame, before the budget. */
  nebulaAboveFloorCount(): number;
  /** How much of the screen the last frame's nebulae cover, in screen areas. */
  nebulaCoveredArea(): number;
  /**
   * The front range and the centre range the last frame sent the two sprite passes, in
   * light years.
   */
  nebulaSpriteRange(): [number, number];
  /**
   * Whether the nebula records and the volumes reached the renderer. The start chain does
   * not wait for them, so a caller that reads the pass must wait for this.
   */
  nebulaeAttached(): boolean;
  /**
   * How long the last rebuild of the marker flags took, in milliseconds. The sweep runs
   * on a change of the set, the table, the visibility or the filter, and not on a
   * frame, so the reading is of the last change and not of the last frame.
   */
  categorySweepMs(): number;
  /**
   * How long the last sweep of the shape flags took, in milliseconds. It follows the same
   * rule as `categorySweepMs`, over the spheres and the lines.
   */
  shapeSweepMs(): number;
  /** Holds the close fade at a value from 0 to 1, or `null` for the zoom distance. */
  setCloseFade(value: number | null): void;
  /**
   * Holds the near plane in light years, or `null` for the zoom distance rule. The hold
   * reaches the frame alone: `project` and `planePointAt` build their matrix from the
   * rule, so a hold below 100 light years would make the drawn frame and the projected
   * pixel disagree. The scenario the hook serves reads 500 light years and above, where
   * the rule already gives 10.
   */
  setNearPlane(value: number | null): void;
  readPixel(x: number, y: number): [number, number, number, number];
  readRect(x: number, y: number, width: number, height: number): Uint8Array;
  drawingBufferSize(): [number, number];
  viewport(): Viewport;
  project(point: readonly [number, number, number]): { x: number; y: number };
  planePointAt(x: number, y: number): [number, number, number] | null;
  regionNameAtScreen(x: number, y: number): string | null;
  /** The vertices of the traced set, whether the region overlay draws or not. */
  regionLinePositions(): Float32Array;
  /** The chain bounds of the traced set, whether the region overlay draws or not. */
  regionLineChains(): { first: Uint32Array; last: Uint32Array };
  regionSampleCounts(): { id: number; name: string; count: number }[];
  regionSampleTotal(): number;
  labelSampling(): SamplingStats;
  resetLabelSampling(): void;
  /**
   * How long the category panel's last count pass took, in milliseconds, and 0 where
   * the map holds no HUD. The pass runs once per change of the filter text and reads
   * each thing once per category it names.
   */
  categoryCountMs(): number;
  /**
   * The hover pick, the pin, the ring and the name label placement of the frames the
   * loop drew since the last reset. The work runs around the draw call, so `frameStats`
   * does not see it.
   */
  selectionSampling(): SamplingStats;
  resetSelectionSampling(): void;
  /**
   * The interval between the animation frames the loop drew since the last reset. It
   * covers everything the browser does per frame, so it is what shows a dropped frame.
   */
  frameIntervalStats(): SamplingStats;
  resetFrameIntervalStats(): void;
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
   * The crossing labels of the last frame, each with its text, its box in CSS pixels,
   * the drawn alpha of its level at its crossing and the opacity it was given. The
   * opacity is a product of two numbers and only one of them reaches a pixel, so a test
   * cannot read the line factor from the picture alone.
   */
  gridLabelReadings(): GridLabelPlaced[];
  /**
   * The width and the height of the background reading's own target, and `[0, 0]`
   * before the first frame that builds one. It reports the storage and not the last
   * reading, so a frame without the grid can be held to taking none.
   */
  backgroundSize(): [number, number];
  /**
   * The width and the height of the region overlay's coverage buffer, and null before
   * the first frame that draws the overlay. The buffer holds the full drawing buffer
   * size, which the blur of the overlay needs.
   */
  regionCoverageSize(): [number, number] | null;
  /**
   * How many draw calls the shape pass made in the last frame. The count is fixed at
   * three whatever the shape count, and 0 in a frame that drew no shape.
   */
  shapeDrawCalls(): number;
  /**
   * The width and the height of the shape pass's line buffer, and null before the first
   * frame that drew a line.
   */
  shapeLineBufferSize(): [number, number] | null;
  /**
   * How many draw calls the marker pass made in the last frame. It is 1 in a frame with
   * markers and no sphere, and 2 in a frame that also wrote the range buffer.
   */
  markerDrawCalls(): number;
  /**
   * Where each icon and each arrow of the last frame drew, in CSS pixels from the top
   * left of the canvas. The list is empty in a frame that drew no stack. The renderer
   * places the stacks, so this is the only reading of them: they are pixels on the
   * canvas and not elements in the overlay.
   */
  iconPlacements(): IconPlacement[];
  /**
   * How many draw calls the icon pass made in the last frame. It is 1 in a frame with a
   * stack, whatever the stack count, and 0 in a frame that drew none. The arrows and the
   * icons share one instance stream, so one call draws them all.
   */
  iconDrawCalls(): number;
  /**
   * The mean time of the last 120 icon placement sweeps, in milliseconds. The sweep runs
   * in the frame, before the marker pass draws, so a caller draws its frames and then
   * reads this.
   */
  iconSweepMs(): number;
  /**
   * The width and the height of the range buffer, and null where the context cannot blend
   * into a float target. A test reads it to tell the range path from the fallback.
   */
  rangeBufferSize(): [number, number] | null;
  /**
   * The range the range buffer holds at one pixel, in CSS pixels from the top left, in
   * light years. A pixel where no marker body drew reads a value above every drawable
   * range, and the reading is null where the map holds no range buffer.
   */
  readRange(x: number, y: number): number | null;
  /**
   * The background reading of the last frame, and null in a frame that built none. The
   * read waits for the card, so it is a probe and not the path the labels take.
   */
  backgroundReading(): BackgroundReading | null;
  /**
   * The width and the height of the read-back that landed, and null while none has.
   * The coordinate labels read that copy, so this says a reading reached them. The
   * pixels stay in the map: a probe that carried 32 kB of them to the test would cost
   * more than the read-back it reports on.
   */
  backgroundFrame(): [number, number] | null;
  /**
   * How many background read-backs the frames since the last reset took, and what they
   * cost in milliseconds.
   */
  readbackStats(): ReadbackStats;
  /** Starts the read-back mean again. */
  resetReadbackStats(): void;
  /**
   * The milliseconds left in the running selection flight, and 0 when none runs. The
   * browser tests read the flight from it.
   */
  selectionFlightMs(): number;
  /**
   * The distance in light years the zoom glide moves toward, and null when no glide
   * runs. The browser tests read it to wait for the camera to settle.
   */
  zoomTargetLy(): number | null;
  compileTestProgram(vertex: string, fragment: string): string | null;
  /**
   * The unmasked renderer string the card reports. It is empty until `ready` settles,
   * because the context is made after the scene workers start.
   */
  readonly renderer: string;
}

/**
 * What the probe set reads. `create-map.ts` builds it once and holds it, and each getter
 * reads the thing as it stands, so a probe called before the start chain finishes reads
 * the null it should.
 */
export interface DebugDeps {
  /** The renderer, and null before the context is made or after `dispose`. */
  renderer(): Renderer | null;
  /** The render context, which carries the card's own renderer string. */
  context(): RenderContextResult | null;
  /** The camera controls. */
  controls(): Controls | null;
  /** The region label overlay. */
  labels(): LabelOverlay | null;
  /** The coordinate label overlay. */
  gridLabels(): GridLabelOverlay | null;
  /** The HUD, and null on a map that asked for none. */
  hud(): HudHandle | null;
  /** The coarse region grid the scene data carries. */
  regionGrid(): CoarseRegionGrid | null;
  /** The traced region boundary set. */
  regionLines(): RegionLines | null;
  /** The frame readings the renderer held when it was disposed. */
  lastStats(): FrameStats;
  /** True once the nebula records and the volumes reached the renderer. */
  nebulaeAttached(): boolean;
  /** The milliseconds left in the running selection flight, and 0 when none runs. */
  flightLeftMs(): number;
  /** Takes the `regions` pass switch, which the map reads beside its own. */
  setRegionPass(on: boolean): void;
  /** Draws one frame outside the loop. */
  drawFrame(): void;
  /** Wakes the frame loop. */
  wake(): void;
  /** The drawing area in CSS pixels. */
  viewport(): Viewport;
  /** The canvas the map draws on. */
  readonly canvas: HTMLCanvasElement;
  /** The view the map holds. The map writes it in place, so the object is enough. */
  readonly view: View;
  /** The real-system set. */
  readonly set: RealSystemSet;
  /** The shape set. */
  readonly shapes: ShapeSet;
  /** The two accumulators the map fills each frame. */
  readonly selectionWork: FrameAccumulator;
  readonly frameIntervals: FrameAccumulator;
}

/** Builds the probe set over one dependency object. */
export function createDebug(deps: DebugDeps): GalaxyMapDebug {
  return {
    setPasses(passes: Partial<PassSwitches>): void {
      deps.renderer()?.setPasses(passes);
      if (passes.regions !== undefined) deps.setRegionPass(passes.regions);
      deps.drawFrame();
    },
    setNebulaOcclusion(value: number): void {
      deps.renderer()?.setNebulaOcclusion(value);
      deps.drawFrame();
    },
    setNebulaOrderReversed(value: boolean): void {
      deps.renderer()?.setNebulaOrderReversed(value);
      deps.drawFrame();
    },
    get look(): LookSettings {
      const held = deps.renderer();
      if (held === null) throw new Error('The map has no renderer.');
      return held.look;
    },
    measureFrames(count: number): number {
      return deps.renderer()?.measureFrames(deps.view, count) ?? 0;
    },
    frameStats(): FrameStats {
      return deps.renderer()?.frameStats() ?? deps.lastStats();
    },
    resetFrameStats(): void {
      deps.renderer()?.resetFrameStats();
    },
    nebulaDrawnCount(): number {
      return deps.renderer()?.nebulaDrawnCount() ?? 0;
    },
    nebulaDrawCalls(): number {
      return deps.renderer()?.nebulaDrawCalls() ?? 0;
    },
    nebulaAboveFloorCount(): number {
      return deps.renderer()?.nebulaAboveFloorCount() ?? 0;
    },
    nebulaCoveredArea(): number {
      return deps.renderer()?.nebulaCoveredArea() ?? 0;
    },
    nebulaSpriteRange(): [number, number] {
      return deps.renderer()?.nebulaSpriteRange() ?? [0, 0];
    },
    nebulaeAttached(): boolean {
      return deps.nebulaeAttached();
    },
    drawNow(): void {
      deps.drawFrame();
    },
    wake(): void {
      deps.wake();
    },
    starVertexCount(): number {
      return deps.renderer()?.starVertexCount() ?? 0;
    },
    starDrawnCount(): number {
      return deps.renderer()?.starDrawnCount() ?? 0;
    },
    starSuppressedCount(): number {
      return deps.renderer()?.starSuppressedCount() ?? 0;
    },
    categorySweepMs(): number {
      // The reading is of the sweep the frame before asked for, so a caller draws a
      // frame after the change it wants to measure.
      return deps.set.lastSweepMs;
    },
    shapeSweepMs(): number {
      // The flags of the shapes are read while the frame draws, so the reading is of the
      // last frame and a caller draws one after the change it wants to measure.
      return deps.shapes.lastSweepMs;
    },
    systemMarkerCount(): number {
      return deps.renderer()?.systemMarkerCount() ?? 0;
    },
    setCloseFade(value: number | null): void {
      deps.renderer()?.setCloseFade(value);
      deps.drawFrame();
    },
    setNearPlane(value: number | null): void {
      deps.renderer()?.setNearPlane(value);
      deps.drawFrame();
    },
    readPixel(x: number, y: number): [number, number, number, number] {
      return deps.renderer()?.readPixel(x, y) ?? [0, 0, 0, 0];
    },
    readRect(x: number, y: number, width: number, height: number): Uint8Array {
      return deps.renderer()?.readRect(x, y, width, height) ?? new Uint8Array(0);
    },
    drawingBufferSize(): [number, number] {
      return (
        deps.renderer()?.drawingBufferSize() ?? [deps.canvas.width, deps.canvas.height]
      );
    },
    viewport: deps.viewport,
    project(point: readonly [number, number, number]): { x: number; y: number } {
      const screen = project(deps.view, point, deps.viewport());
      return { x: screen.x, y: screen.y };
    },
    planePointAt(x: number, y: number): [number, number, number] | null {
      return planePoint(deps.view, { x, y }, deps.viewport(), deps.view.cursor[1]);
    },
    regionNameAtScreen(x: number, y: number): string | null {
      const grid = deps.regionGrid();
      if (grid === null) return null;
      const point = planePoint(deps.view, { x, y }, deps.viewport(), 0);
      if (point === null) return null;
      return regionOfId(coarseRegionIdAt(grid, point[0], point[2]))?.name ?? null;
    },
    regionLinePositions(): Float32Array {
      return deps.regionLines()?.positions ?? new Float32Array(0);
    },
    regionLineChains(): { first: Uint32Array; last: Uint32Array } {
      const lines = deps.regionLines();
      return {
        first: lines?.first ?? new Uint32Array(0),
        last: lines?.last ?? new Uint32Array(0),
      };
    },
    regionSampleCounts(): { id: number; name: string; count: number }[] {
      return (
        deps
          .labels()
          ?.lastCounts()
          .map((entry) => ({ ...entry })) ?? []
      );
    },
    regionSampleTotal(): number {
      return deps.labels()?.lastSampleCount() ?? 0;
    },
    labelSampling(): SamplingStats {
      return deps.labels()?.sampling() ?? { frames: 0, meanMs: 0, worstMs: 0 };
    },
    resetLabelSampling(): void {
      deps.labels()?.resetSampling();
    },
    categoryCountMs(): number {
      return deps.hud()?.categoryCountMs() ?? 0;
    },
    selectionSampling(): SamplingStats {
      return deps.selectionWork.read();
    },
    resetSelectionSampling(): void {
      deps.selectionWork.reset();
    },
    frameIntervalStats(): SamplingStats {
      return deps.frameIntervals.read();
    },
    resetFrameIntervalStats(): void {
      deps.frameIntervals.reset();
    },
    gridVertexCount(): number {
      return deps.renderer()?.gridVertexCount() ?? 0;
    },
    gridSpacingLy(): number {
      return deps.renderer()?.gridSpacingLy() ?? 0;
    },
    gridLevels(): GridLevelReading[] {
      return deps.renderer()?.gridLevels() ?? [];
    },
    gridLabelReadings(): GridLabelPlaced[] {
      return deps.gridLabels()?.readings() ?? [];
    },
    backgroundSize(): [number, number] {
      return deps.renderer()?.backgroundSize() ?? [0, 0];
    },
    regionCoverageSize(): [number, number] | null {
      return deps.renderer()?.regionCoverageSize() ?? null;
    },
    shapeDrawCalls(): number {
      return deps.renderer()?.shapeDrawCalls() ?? 0;
    },
    shapeLineBufferSize(): [number, number] | null {
      return deps.renderer()?.shapeLineBufferSize() ?? null;
    },
    markerDrawCalls(): number {
      return deps.renderer()?.markerDrawCalls() ?? 0;
    },
    iconPlacements(): IconPlacement[] {
      return deps.renderer()?.iconPlacements() ?? [];
    },
    iconDrawCalls(): number {
      return deps.renderer()?.iconDrawCalls() ?? 0;
    },
    iconSweepMs(): number {
      return deps.renderer()?.iconSweepMs() ?? 0;
    },
    rangeBufferSize(): [number, number] | null {
      return deps.renderer()?.rangeBufferSize() ?? null;
    },
    readRange(x: number, y: number): number | null {
      return deps.renderer()?.readRange(x, y) ?? null;
    },
    backgroundReading(): BackgroundReading | null {
      return deps.renderer()?.backgroundReading() ?? null;
    },
    backgroundFrame(): [number, number] | null {
      const held = deps.renderer()?.backgroundFrame() ?? null;
      return held === null ? null : [held.width, held.height];
    },
    readbackStats(): ReadbackStats {
      return deps.renderer()?.readbackStats() ?? { frames: 0, meanMs: 0, worstMs: 0 };
    },
    resetReadbackStats(): void {
      deps.renderer()?.resetReadbackStats();
    },
    selectionFlightMs(): number {
      return deps.flightLeftMs();
    },
    zoomTargetLy(): number | null {
      return deps.controls()?.zoomTargetLy() ?? null;
    },
    compileTestProgram(vertex: string, fragment: string): string | null {
      const gl = deps.context()?.gl ?? null;
      if (gl === null) return 'The map has no context.';
      try {
        const probe = createProgram(gl, 'probe', vertex, fragment);
        gl.deleteProgram(probe.program);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    get renderer(): string {
      return deps.context()?.renderer ?? '';
    },
  };
}
