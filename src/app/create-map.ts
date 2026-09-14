// The library entry point. One call builds the map and gives back its handle.
import { attachControls } from '../camera/controls';
import type { Controls } from '../camera/controls';
import { planePoint, project } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { createDefaultView, normaliseView } from '../camera/view';
import type { View } from '../camera/view';
import { loadDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import { createRenderContext } from '../render/context';
import { createProgram } from '../render/program';
import { createRenderer } from '../render/renderer';
import type {
  FrameStats,
  LookSettings,
  PassSwitches,
  Renderer,
} from '../render/renderer';
import { loadSceneData } from '../scene-data/load';
import { createSystemSet } from '../scene-data/real-systems';
import type {
  AddReport,
  CategoryReport,
  RealSystemSet,
} from '../scene-data/real-systems';
import { coarseRegionIdAt, regionOfId } from '../scene-data/regions';
import type { CoarseRegionGrid, RegionLines } from '../scene-data/types';
import { createLabelOverlay } from './labels';
import type { LabelOverlay, SamplingStats } from './labels';

/**
 * What the region overlay draws. `off` draws no boundary and places no label.
 * `simplified` draws the smoothed boundary set, and `accurate` draws the traced one,
 * which is the staircase the region data is. `accurate` places the same labels.
 */
export type RegionMode = 'off' | 'simplified' | 'accurate';

/** The mode the map takes when the host names none. */
export const DEFAULT_REGION_MODE: RegionMode = 'simplified';

/** Options for `createGalaxyMap`. */
export interface GalaxyMapOptions {
  /**
   * The element the region labels go in. With no element the library makes one in the
   * canvas's parent, so a host that gives a canvas alone gets a working map.
   */
  readonly labelHost?: HTMLElement;
  /** What the region overlay draws. The default is `simplified`. */
  readonly regionMode?: RegionMode;
}

/** A view as a host reads and writes it. */
export interface MapView {
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}

/**
 * The renderer probes the browser tests read. This is not part of the supported
 * surface, and phase 4 may change it.
 */
export interface GalaxyMapDebug {
  setPasses(passes: Partial<PassSwitches>): void;
  readonly look: LookSettings;
  measureFrames(count: number): number;
  frameStats(): FrameStats;
  resetFrameStats(): void;
  drawNow(): void;
  starVertexCount(): number;
  starDrawnCount(): number;
  starSuppressedCount(): number;
  systemMarkerCount(): number;
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
  /** The vertices of the smoothed set, whatever mode the map is in. */
  regionLinePositions(): Float32Array;
  /** The chain bounds of the smoothed set, whatever mode the map is in. */
  regionLineChains(): { first: Uint32Array; last: Uint32Array };
  regionSampleCounts(): { id: number; name: string; count: number }[];
  regionSampleTotal(): number;
  labelSampling(): SamplingStats;
  resetLabelSampling(): void;
  compileTestProgram(vertex: string, fragment: string): string | null;
  /** The unmasked renderer string the card reports. */
  readonly renderer: string;
}

/** What `createGalaxyMap` gives back. */
export interface GalaxyMap {
  /** Reads categories into the table and returns the report. */
  addCategories(categories: readonly unknown[]): CategoryReport;
  /** Reads records into the set and returns the report. */
  addSystems(records: readonly unknown[]): AddReport;
  /** Empties the system set. */
  clearSystems(): void;
  /** Empties the system set and the category table together. */
  clearSystemsAndCategories(): void;
  /** How many systems the set holds. */
  systemCount(): number;
  /** Settles when the map draws its first frame, or fails. */
  readonly ready: Promise<void>;
  /** Stops the map and releases what it holds. A second call does nothing. */
  dispose(): void;
  /** Reads the current view. */
  getView(): MapView;
  /** Replaces part or all of the current view. */
  setView(view: Partial<MapView>): void;
  /** Calls `listener` after the view changes. Returns an unsubscribe. */
  onViewChange(listener: (view: MapView) => void): () => void;
  /** Reads what the region overlay draws. */
  getRegionMode(): RegionMode;
  /**
   * Chooses what the region overlay draws, from the next frame on. A value that is not
   * one of the three leaves the mode as it was.
   */
  setRegionMode(mode: RegionMode): void;
  /** The renderer probes the browser tests read. */
  readonly debug: GalaxyMapDebug;
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Makes the label host the library owns, over the canvas, in the canvas's parent. */
function makeLabelHost(canvas: HTMLCanvasElement): HTMLElement | null {
  const parent = canvas.parentElement;
  if (parent === null) return null;
  const host = canvas.ownerDocument.createElement('div');
  host.style.position = 'absolute';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = `${canvas.clientWidth}px`;
  host.style.height = `${canvas.clientHeight}px`;
  host.style.overflow = 'hidden';
  host.style.pointerEvents = 'none';
  parent.appendChild(host);
  return host;
}

/**
 * Builds the map on a canvas and returns its handle in the same tick. The handle takes
 * categories and systems before the scene data is ready, and `ready` settles when the
 * first frame is drawn or when the card refuses the map.
 */
export function createGalaxyMap(
  canvas: HTMLCanvasElement,
  options: GalaxyMapOptions = {},
): GalaxyMap {
  // The set comes first, so a host can add systems before the first frame.
  const set: RealSystemSet = createSystemSet();
  const view: View = createDefaultView();
  const listeners = new Set<(view: MapView) => void>();

  let renderer: Renderer | null = null;
  let labels: LabelOverlay | null = null;
  let ownedHost: HTMLElement | null = null;
  let controls: Controls | null = null;
  let regionGrid: CoarseRegionGrid | null = null;
  let regionLines: RegionLines | null = null;
  let regionsOn = true;
  let regionMode: RegionMode =
    options.regionMode === 'off' ||
    options.regionMode === 'simplified' ||
    options.regionMode === 'accurate'
      ? options.regionMode
      : DEFAULT_REGION_MODE;
  let frameHandle: number | null = null;
  let disposed = false;
  // `dispose` releases the renderer, so the last reading is kept. The test that checks
  // the loop stopped reads the count before and after the call.
  let lastStats: FrameStats = { frames: 0, meanMs: 0, worstMs: 0 };

  const loadStop = new AbortController();
  const context = createRenderContext(canvas);

  const readView = (): MapView => ({
    cursor: [view.cursor[0], view.cursor[1], view.cursor[2]],
    distance: view.distance,
    yaw: view.yaw,
    pitch: view.pitch,
  });

  const announce = (): void => {
    const copy = readView();
    for (const listener of listeners) listener(copy);
  };

  const viewport = (): Viewport =>
    renderer?.viewport() ?? {
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
    };

  const drawFrame = (): void => {
    if (renderer === null) return;
    renderer.render(view);
    labels?.update(view, renderer.viewport(), regionsOn && regionMode !== 'off');
  };

  const onResize = (): void => renderer?.resize();

  const start = async (): Promise<void> => {
    if (context.gl === null) {
      throw new Error(context.error ?? 'The map cannot start.');
    }
    const gl = context.gl;

    // The workers run while the main thread compiles the programs. The star field needs
    // the model with the detail grid, because its counts and its light both read the
    // detailed density, so the grid loads beside them.
    const scenePromise = loadSceneData({ signal: loadStop.signal });
    const detailPromise = loadDetailGrid();

    await nextFrame();
    if (disposed) return;
    renderer = createRenderer(gl, canvas);
    renderer.resize();
    renderer.setSystems(set);

    const host = options.labelHost ?? makeLabelHost(canvas);
    if (host !== null && host !== options.labelHost) ownedHost = host;
    labels = host === null ? null : createLabelOverlay(host);

    controls = attachControls(canvas, view, { onChange: announce });
    window.addEventListener('resize', onResize);

    // `dispose` aborts the load, and the abort rejects the promise. That is the map
    // coming down and not a start-up failure, so `ready` settles rather than rejects.
    const scene = await scenePromise.catch((reason: unknown) => {
      if (disposed) return null;
      throw reason;
    });
    if (disposed || scene === null) return;

    // Each upload gets its own animation frame, so no single task runs long.
    await nextFrame();
    if (disposed) return;
    renderer.setVolume(scene.volume);

    await nextFrame();
    if (disposed) return;
    renderer.setPointCloud(scene.pointCloud);

    await nextFrame();
    if (disposed) return;
    renderer.setCloudSet(scene.cloudSet);

    await nextFrame();
    if (disposed) return;
    renderer.setDetail(scene.detail);

    await nextFrame();
    if (disposed) return;
    renderer.setRegionLines(scene.regionLines, scene.regionLinesTraced);
    renderer.setRegionDraw(regionMode !== 'off', regionMode === 'accurate');
    labels?.setGrid(scene.regionGrid);
    regionGrid = scene.regionGrid;
    regionLines = scene.regionLines;

    const detailGrid = await detailPromise;
    if (disposed) return;
    await nextFrame();
    if (disposed) return;
    renderer.setStarField(createGalaxyModel(parameters, detailGrid));

    await nextFrame();
    if (disposed) return;
    drawFrame();

    let previous = performance.now();
    const loop = (now: number): void => {
      const seconds = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      controls?.update(seconds);
      drawFrame();
      frameHandle = requestAnimationFrame(loop);
    };
    frameHandle = requestAnimationFrame(loop);
  };

  const ready = start();
  // A host that never reads `ready` must not raise an unhandled rejection.
  void ready.catch(() => undefined);

  const debug: GalaxyMapDebug = {
    setPasses(passes: Partial<PassSwitches>): void {
      renderer?.setPasses(passes);
      if (passes.regions !== undefined) regionsOn = passes.regions;
      drawFrame();
    },
    get look(): LookSettings {
      if (renderer === null) throw new Error('The map has no renderer.');
      return renderer.look;
    },
    measureFrames(count: number): number {
      return renderer?.measureFrames(view, count) ?? 0;
    },
    frameStats(): FrameStats {
      return renderer?.frameStats() ?? lastStats;
    },
    resetFrameStats(): void {
      renderer?.resetFrameStats();
    },
    drawNow(): void {
      drawFrame();
    },
    starVertexCount(): number {
      return renderer?.starVertexCount() ?? 0;
    },
    starDrawnCount(): number {
      return renderer?.starDrawnCount() ?? 0;
    },
    starSuppressedCount(): number {
      return renderer?.starSuppressedCount() ?? 0;
    },
    systemMarkerCount(): number {
      return renderer?.systemMarkerCount() ?? 0;
    },
    setCloseFade(value: number | null): void {
      renderer?.setCloseFade(value);
      drawFrame();
    },
    setNearPlane(value: number | null): void {
      renderer?.setNearPlane(value);
      drawFrame();
    },
    readPixel(x: number, y: number): [number, number, number, number] {
      return renderer?.readPixel(x, y) ?? [0, 0, 0, 0];
    },
    readRect(x: number, y: number, width: number, height: number): Uint8Array {
      return renderer?.readRect(x, y, width, height) ?? new Uint8Array(0);
    },
    drawingBufferSize(): [number, number] {
      return renderer?.drawingBufferSize() ?? [canvas.width, canvas.height];
    },
    viewport,
    project(point: readonly [number, number, number]): { x: number; y: number } {
      const screen = project(view, point, viewport());
      return { x: screen.x, y: screen.y };
    },
    planePointAt(x: number, y: number): [number, number, number] | null {
      return planePoint(view, { x, y }, viewport(), view.cursor[1]);
    },
    regionNameAtScreen(x: number, y: number): string | null {
      if (regionGrid === null) return null;
      const point = planePoint(view, { x, y }, viewport(), 0);
      if (point === null) return null;
      return regionOfId(coarseRegionIdAt(regionGrid, point[0], point[2]))?.name ?? null;
    },
    regionLinePositions(): Float32Array {
      return regionLines?.positions ?? new Float32Array(0);
    },
    regionLineChains(): { first: Uint32Array; last: Uint32Array } {
      return {
        first: regionLines?.first ?? new Uint32Array(0),
        last: regionLines?.last ?? new Uint32Array(0),
      };
    },
    regionSampleCounts(): { id: number; name: string; count: number }[] {
      return labels?.lastCounts().map((entry) => ({ ...entry })) ?? [];
    },
    regionSampleTotal(): number {
      return labels?.lastSampleCount() ?? 0;
    },
    labelSampling(): SamplingStats {
      return labels?.sampling() ?? { frames: 0, meanMs: 0, worstMs: 0 };
    },
    resetLabelSampling(): void {
      labels?.resetSampling();
    },
    compileTestProgram(vertex: string, fragment: string): string | null {
      const gl = context.gl;
      if (gl === null) return 'The map has no context.';
      try {
        const probe = createProgram(gl, 'probe', vertex, fragment);
        gl.deleteProgram(probe.program);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    renderer: context.renderer,
  };

  return {
    addCategories(categories: readonly unknown[]): CategoryReport {
      return set.addCategories(categories);
    },
    addSystems(records: readonly unknown[]): AddReport {
      return set.addSystems(records);
    },
    clearSystems(): void {
      set.clearSystems();
    },
    clearSystemsAndCategories(): void {
      set.clearSystemsAndCategories();
    },
    systemCount(): number {
      return set.count;
    },
    ready,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      loadStop.abort();
      if (renderer !== null) lastStats = renderer.frameStats();
      controls?.dispose();
      controls = null;
      window.removeEventListener('resize', onResize);
      renderer?.dispose();
      renderer = null;
      labels = null;
      ownedHost?.remove();
      ownedHost = null;
      listeners.clear();
    },
    getView(): MapView {
      return readView();
    },
    setView(next: Partial<MapView>): void {
      if (next.cursor !== undefined) view.cursor = [...next.cursor];
      if (next.distance !== undefined) view.distance = next.distance;
      if (next.yaw !== undefined) view.yaw = next.yaw;
      if (next.pitch !== undefined) view.pitch = next.pitch;
      normaliseView(view);
      announce();
    },
    onViewChange(listener: (view: MapView) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getRegionMode(): RegionMode {
      return regionMode;
    },
    setRegionMode(mode: RegionMode): void {
      // A value the map does not know leaves the mode as it was, as a bad view field
      // does. The host reads `getRegionMode` to see what took effect.
      if (mode !== 'off' && mode !== 'simplified' && mode !== 'accurate') return;
      if (mode === regionMode) return;
      regionMode = mode;
      renderer?.setRegionDraw(mode !== 'off', mode === 'accurate');
      drawFrame();
    },
    debug,
  };
}
