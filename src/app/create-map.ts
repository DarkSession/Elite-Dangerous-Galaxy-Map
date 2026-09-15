// The library entry point. One call builds the map and gives back its handle.
import { attachControls } from '../camera/controls';
import type { Controls } from '../camera/controls';
import { FLIGHT_MS, flightAt } from '../camera/flight';
import { planePoint, project } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { copyView, createDefaultView, normaliseView } from '../camera/view';
import type { View } from '../camera/view';
import { loadDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { HudHandle, HudOptions } from '../hud/types';
import { createRenderContext } from '../render/context';
import { createProgram } from '../render/program';
import { createFrameAccumulator, createRenderer } from '../render/renderer';
import type {
  FrameAccumulator,
  FrameStats,
  GridLevelReading,
  LookSettings,
  PassSwitches,
  Renderer,
} from '../render/renderer';
import { loadSceneData } from '../scene-data/load';
import { pickSystem } from '../scene-data/picking';
import {
  createSystemSet,
  MODEL_BOUNDS,
  safeImageUrl,
} from '../scene-data/real-systems';
import type {
  AddReport,
  Category,
  CategoryInput,
  CategoryReport,
  RealSystem,
  RealSystemSet,
  SystemRecordInput,
} from '../scene-data/real-systems';
import { coarseRegionIdAt, regionOfId } from '../scene-data/regions';
import type { CoarseRegionGrid, RegionLines } from '../scene-data/types';
import { createDatasetState } from './datasets';
import type {
  DatasetContent,
  DatasetEntry,
  DatasetInfo,
  DatasetLoadResult,
  DatasetState,
} from './datasets';
import { createGridLabelOverlay } from './grid-labels';
import type { GridLabelOverlay } from './grid-labels';
import { createLabelOverlay } from './labels';
import type { LabelOverlay, SamplingStats } from './labels';
import { createMarkerOverlay } from './markers';
import type { MarkerOverlay } from './markers';

// The HUD and a host name a record, an image and a category through the library entry
// point. The HUD lint rule forbids an import of `src/scene-data/`, so the entry point
// carries the three types.
export type { Category, RealSystem, SystemImage } from '../scene-data/real-systems';

// The dataset catalog is part of the options and of the handle, so the entry point
// carries its types as well. The HUD reads `DatasetInfo` through this module.
export type {
  DatasetContent,
  DatasetEntry,
  DatasetInfo,
  DatasetLoadResult,
} from './datasets';

/**
 * How close a selection brings the camera, in light years. A view further out than this
 * comes in to it. A view already at it or closer keeps the distance it has.
 */
export const SELECTION_DISTANCE_LY = 500;

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
  /** True draws the coordinate grid. The grid is off unless the options ask for it. */
  readonly grid?: boolean;
  /**
   * Builds the heads-up display. `true` builds it with its defaults, and an object
   * names the title, the host and the footer actions. The HUD is off when the options
   * do not ask for it, and the map then adds no element to the page.
   */
  readonly hud?: boolean | HudOptions;
  /**
   * The URL of a picture the map shows in the middle of the canvas while it starts.
   * The library removes it when `ready` settles, whether it settles or fails. A URL
   * whose scheme is neither `http` nor `https`, and which is not relative, adds no
   * element. With no URL the map adds no element.
   */
  readonly loadingImage?: string;
  /**
   * The data sets the user can switch between. Each entry carries an id, a label and a
   * `load()` the host wrote. The library calls `load()` and reads what comes back; it
   * fetches nothing itself. With no catalog the map loads nothing and the HUD shows no
   * dataset field.
   */
  readonly datasets?: readonly DatasetEntry[];
  /**
   * The id of the entry the map loads at start. With no id, and with an id the catalog
   * does not hold, the map loads the first entry.
   */
  readonly dataset?: string;
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
  /**
   * How long the last rebuild of the marker flags took, in milliseconds. The sweep runs
   * on a change of the set, the table, the visibility or the filter, and not on a
   * frame, so the reading is of the last change and not of the last frame.
   */
  categorySweepMs(): number;
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
   * The milliseconds left in the running selection flight, and 0 when none runs. The
   * browser tests read the flight from it.
   */
  selectionFlightMs(): number;
  compileTestProgram(vertex: string, fragment: string): string | null;
  /** The unmasked renderer string the card reports. */
  readonly renderer: string;
}

/** What `createGalaxyMap` gives back. */
export interface GalaxyMap {
  /** Reads categories into the table and returns the report. */
  addCategories(categories: readonly CategoryInput[]): CategoryReport;
  /** Reads records into the set and returns the report. */
  addSystems(records: readonly SystemRecordInput[]): AddReport;
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
  /** Reads one system of the set as a copy, or null outside the set. */
  getSystem(index: number): RealSystem | null;
  /** How many categories the table holds. */
  categoryCount(): number;
  /** Reads one category of the table as a copy, or null outside it. */
  getCategory(index: number): Category | null;
  /** Turns the markers of a category on or off. An unknown name changes nothing. */
  setCategoryVisible(name: string, visible: boolean): void;
  /** True when the markers of a category draw. False for a name the table lacks. */
  isCategoryVisible(name: string): boolean;
  /** Keeps the markers whose name holds the text, compared without case. */
  setNameFilter(text: string): void;
  /** Reads the filter text. */
  getNameFilter(): string;
  /** The system under a canvas pixel in CSS coordinates, or null. */
  systemAt(x: number, y: number): RealSystem | null;
  /** Reads the hovered system, or null. */
  getHover(): RealSystem | null;
  /** Reads the selected system, or null. */
  getSelection(): RealSystem | null;
  /**
   * Selects a system by its identity, which is the `id64` when the record carries one
   * and the name when it does not. `null`, and an identity the set does not hold, clear
   * the selection.
   */
  setSelection(identity: string | null): void;
  /** Calls `listener` after the selection changes. Returns an unsubscribe. */
  onSelectionChange(listener: (system: RealSystem | null) => void): () => void;
  /** Turns the marker name labels on or off. They are off when the map starts. */
  setSystemNamesVisible(on: boolean): void;
  /** True while the marker name labels draw. */
  areSystemNamesVisible(): boolean;
  /** Turns the coordinate grid on or off. */
  setGridVisible(on: boolean): void;
  /** True while the coordinate grid draws. */
  isGridVisible(): boolean;
  /**
   * Calls `listener` after the coordinate grid switch moves, whatever moved it: a
   * `setGridVisible` call, or the HUD switch, which calls that same member. The grid is
   * not part of the view state, so `onViewChange` does not carry it and a page that
   * keeps the switch reads it here. Returns an unsubscribe.
   */
  onGridChange(listener: (on: boolean) => void): () => void;
  /**
   * The name of the codex region that holds a point on the galactic plane, or null. The
   * lookup reads the `x` and the `z` of the point and ignores its `y`, because the
   * region grid is a map of the plane and a region has no upper or lower bound. It gives
   * null before the scene data loads.
   */
  regionNameAt(point: readonly [number, number, number]): string | null;
  /** The dataset catalog the options named, without the `load` functions. */
  getDatasets(): DatasetInfo[];
  /** The dataset now on the map, or null. */
  getLoadedDataset(): DatasetInfo | null;
  /**
   * Loads one dataset of the catalog: it calls the entry's `load()`, empties the set and
   * the table, and reads the two arrays that came back. A failed load leaves the map
   * with the set it already had. A second call while a first one runs wins, and the
   * first rejects as cancelled.
   */
  loadDataset(id: string): Promise<DatasetLoadResult>;
  /** Calls `listener` after the loaded dataset changes. Returns an unsubscribe. */
  onDatasetChange(listener: (dataset: DatasetInfo | null) => void): () => void;
  /**
   * The HUD handle, or null when the options do not ask for the HUD. The HUD loads by
   * dynamic import, so the member is null until `ready` settles.
   */
  readonly hud: HudHandle | null;
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

/** Puts the loading image in the middle of the canvas's box. */
function placeLoadingImage(image: HTMLImageElement, canvas: HTMLCanvasElement): void {
  // The middle of the canvas's box, and not the middle of the parent: a host may give
  // the canvas a box of its own inside a larger element.
  image.style.left = `${canvas.offsetLeft + canvas.clientWidth / 2}px`;
  image.style.top = `${canvas.offsetTop + canvas.clientHeight / 2}px`;
}

/**
 * Makes the loading image in the canvas's parent, or gives null when the options name
 * no picture, when the URL names an unsafe scheme, or when the canvas has no parent.
 * It sits over the canvas and under the HUD, and it takes no pointer input, so a drag
 * that starts on it still orbits the camera.
 */
function makeLoadingImage(
  canvas: HTMLCanvasElement,
  url: string | undefined,
): HTMLImageElement | null {
  if (url === undefined || url === '') return null;
  if (!safeImageUrl(url)) return null;
  const parent = canvas.parentElement;
  if (parent === null) return null;
  const image = canvas.ownerDocument.createElement('img');
  image.className = 'gm-loading-image';
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.style.position = 'absolute';
  // The picture keeps the size its own file gives, and the host chooses that size in
  // the file it names. The library sets no width, no height and no fit. An SVG must name
  // its size as `width` and `height` attributes: an `<img>` element reads no size from
  // the file's own CSS, and a file without the attributes grows with the box it sits in.
  image.style.transform = 'translate(-50%, -50%)';
  image.style.pointerEvents = 'none';
  // The HUD root sits at 10, so the picture is over the canvas and under the panels.
  image.style.zIndex = '5';
  placeLoadingImage(image, canvas);
  // A picture that does not load leaves no broken image mark, and it stops nothing.
  image.addEventListener('error', () => {
    image.hidden = true;
  });
  image.src = url;
  parent.appendChild(image);
  return image;
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
  const selectionListeners = new Set<(system: RealSystem | null) => void>();
  const gridListeners = new Set<(on: boolean) => void>();

  // The selection is held as an identity and not as an index, so a record replaced under
  // the same identity keeps it and an emptied set drops it.
  let selectedIdentity: string | null = null;
  let hoverIndex = -1;
  // The last pointer position over the canvas, in canvas CSS pixels. The hover pick runs
  // once per frame from it, because a pointer event can arrive faster than a frame.
  let lastPointer: { x: number; y: number } | null = null;

  // The HUD is behind a dynamic import, so a host that never asks for it does not
  // download it. The import starts in the same tick the map is built and `ready` waits
  // for it, so every caller that reads `hud` after `ready` reads the HUD.
  const hudOptions: HudOptions | null =
    options.hud === true
      ? {}
      : typeof options.hud === 'object' && options.hud !== null
        ? options.hud
        : null;
  const hudModule = hudOptions === null ? null : import('../hud/index');
  let hud: HudHandle | null = null;
  let hudDirty = false;
  let handle: GalaxyMap | null = null;

  // The flight the last selection started, or null when none runs. The module holds the
  // state and `src/camera/flight.ts` holds the arithmetic, so the flight has no timer:
  // the frame loop reads the clock once and writes the view.
  let flight: {
    readonly from: View;
    readonly to: View;
    readonly startMs: number;
  } | null = null;

  let renderer: Renderer | null = null;
  let labels: LabelOverlay | null = null;
  let markers: MarkerOverlay | null = null;
  let gridLabels: GridLabelOverlay | null = null;
  let namesOn = false;
  let gridOn = options.grid === true;
  const selectionWork: FrameAccumulator = createFrameAccumulator();
  const frameIntervals: FrameAccumulator = createFrameAccumulator();
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

  // The picture the map shows while it starts. It is made in the same tick the map is
  // built, because it covers the wait for the first frame.
  let loadingImage: HTMLImageElement | null = makeLoadingImage(
    canvas,
    options.loadingImage,
  );

  /** Takes the loading image off the page. A second call does nothing. */
  const removeLoadingImage = (): void => {
    loadingImage?.remove();
    loadingImage = null;
  };

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

  /** The identity of a record: the `id64` when it has one, and the name when it does not. */
  const identityOf = (system: RealSystem): string => system.id64 ?? system.name;

  /** One system of the set as a copy, or null outside the set. */
  const copyOf = (index: number): RealSystem | null => {
    const system = set.system(index);
    return system === null ? null : { ...system };
  };

  const announceSelection = (): void => {
    const index =
      selectedIdentity === null ? -1 : set.indexOfIdentity(selectedIdentity);
    const system = copyOf(index);
    for (const listener of selectionListeners) listener(system);
  };

  /** Writes a view into the live view and raises the listeners. */
  const takeView = (next: View): void => {
    view.cursor = [next.cursor[0], next.cursor[1], next.cursor[2]];
    view.distance = next.distance;
    view.yaw = next.yaw;
    view.pitch = next.pitch;
    normaliseView(view);
    announce();
  };

  /**
   * Drops the running flight and leaves the view where it had reached. The pointer, the
   * wheel, the movement keys and `setView` all call it, so the user is never held for
   * the length of a flight.
   */
  const endFlight = (): void => {
    flight = null;
  };

  /**
   * True while the browser asks for less movement. The map reads it at each selection and
   * not once at start up, so a user who changes the setting does not reload.
   */
  const reducedMotion = (): boolean => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    return media?.matches === true;
  };

  /**
   * Flies the camera to the selected system: the cursor on the system, the distance at
   * `min(distance, 500)`, and the yaw and the pitch unchanged. Where the browser asks for
   * less movement the view takes the end state in this frame and no flight runs.
   */
  const centreOn = (system: RealSystem): void => {
    const target: View = {
      cursor: [system.position[0], system.position[1], system.position[2]],
      distance: Math.min(view.distance, SELECTION_DISTANCE_LY),
      yaw: view.yaw,
      pitch: view.pitch,
    };
    normaliseView(target);
    if (reducedMotion()) {
      endFlight();
      takeView(target);
      return;
    }
    // A selection during a flight flies from the view as it stands, which the loop has
    // already written into `view`.
    flight = { from: copyView(view), to: target, startMs: performance.now() };
  };

  /**
   * Advances the running flight to a moment. The loop calls it once a frame before the
   * draw, so the listeners are raised as often as the map draws and no more.
   *
   * A held movement key ends the flight here, before it advances. The loop advances the
   * flight before `controls.update` moves the view, so a flight that advanced first
   * would take one frame of the ease from the user. The ease is steep at its start, so
   * that one frame is a step the user sees.
   */
  const advanceFlight = (nowMs: number): void => {
    if (flight === null) return;
    if (controls?.isMoving() === true) {
      endFlight();
      return;
    }
    const elapsed = nowMs - flight.startMs;
    const next = flightAt(flight.from, flight.to, elapsed);
    if (elapsed >= FLIGHT_MS) flight = null;
    takeView(next);
  };

  /**
   * Takes an identity. A system moves the view and, when it is not the system already
   * selected, raises the selection listeners. An identity the set does not hold, and
   * `null`, clear the selection and leave the view where it is.
   */
  const applySelection = (identity: string | null): void => {
    const index = identity === null ? -1 : set.indexOfIdentity(identity);
    const system = index < 0 ? null : set.system(index);
    const next = system === null ? null : identityOf(system);
    const changed = next !== selectedIdentity;
    selectedIdentity = next;
    if (system !== null) centreOn(system);
    if (changed) announceSelection();
  };

  /**
   * Puts one loaded dataset on the map. The order is the one `dataset-catalog` states:
   * the set and the table are emptied first, then the categories and then the records.
   * The state machine calls it after `load()` settles, so a failed load never reaches
   * the map.
   *
   * The selection and the name filter go with the set, because both name records of the
   * set that is being replaced. The view stays where it is.
   */
  const writeDataset = (content: DatasetContent): DatasetLoadResult => {
    set.clearSystemsAndCategories();
    set.setNameFilter('');
    const categories = set.addCategories(content.categories);
    const systems = set.addSystems(content.systems);
    hudDirty = true;
    if (selectedIdentity !== null) {
      selectedIdentity = null;
      announceSelection();
    }
    return { categories, systems };
  };

  /** Drops a selection the set no longer holds, after the data changes. */
  const syncSelection = (): void => {
    if (selectedIdentity === null) return;
    if (set.indexOfIdentity(selectedIdentity) >= 0) return;
    selectedIdentity = null;
    announceSelection();
  };

  // The catalog is read once, at the call. A drop is reported on the console, the way a
  // rejected record is, because the options are the host's own code.
  const datasets: DatasetState = createDatasetState({
    datasets: options.datasets,
    dataset: options.dataset,
    write: writeDataset,
  });
  for (const reject of datasets.rejected) {
    console.warn('The map dropped a dataset entry.', reject);
  }

  const drawFrame = (): void => {
    if (renderer === null) return;
    renderer.render(view);
    const size = renderer.viewport();
    // The hover pick and the overlay marks are one reading, because the two run together
    // around the draw call and the budget covers them together.
    const started = performance.now();
    // The hover pick runs once per frame and not once per pointer event, and it runs
    // again here after a camera move, because the marker under a still pointer moves
    // when the camera does.
    hoverIndex = lastPointer === null ? -1 : pickSystem(set, view, size, lastPointer);
    markers?.update({
      view,
      viewport: size,
      set,
      hoverIndex,
      selectedIndex:
        selectedIdentity === null ? -1 : set.indexOfIdentity(selectedIdentity),
      namesOn,
    });
    selectionWork.add(performance.now() - started);
    labels?.update(view, size, regionsOn && regionMode !== 'off');
    // The grid labels read the label level the grid pass drew, so a label and its lines
    // never disagree. A frame with the grid off reports a spacing of 0, which clears the
    // labels with the same call.
    gridLabels?.update({
      view,
      viewport: size,
      spacingLy: renderer.gridSpacingLy(),
      bounds: MODEL_BOUNDS,
    });
  };

  const onResize = (): void => {
    renderer?.resize();
    if (loadingImage !== null) placeLoadingImage(loadingImage, canvas);
  };

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
    markers = host === null ? null : createMarkerOverlay(host);
    gridLabels = host === null ? null : createGridLabelOverlay(host);
    renderer.setGridDraw(gridOn);

    controls = attachControls(canvas, view, {
      onChange: announce,
      onInput: endFlight,
      onPointer(pixel: { x: number; y: number } | null): void {
        lastPointer = pixel;
      },
      onClick(pixel: { x: number; y: number }): void {
        const index = pickSystem(set, view, viewport(), pixel);
        // A click that finds no system leaves the selection as it is. The user orbits
        // with the same button, so a click between markers is more often a missed grab
        // than a request to close the panel.
        if (index < 0) return;
        const system = set.system(index);
        if (system !== null) applySelection(identityOf(system));
      },
    });
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
      frameIntervals.add(now - previous);
      previous = now;
      // The flight moves the view before the draw, so the frame the user sees is the
      // frame the flight reached.
      advanceFlight(performance.now());
      controls?.update(seconds);
      refreshHud();
      drawFrame();
      frameHandle = requestAnimationFrame(loop);
    };
    frameHandle = requestAnimationFrame(loop);
  };

  /**
   * Rebuilds the HUD panels once, after a change to the data. The frame loop calls it,
   * so a host that adds its systems in many batches pays one rebuild for every batch
   * inside one frame, and a call that changes nothing pays none. A rebuild replaces
   * every row, which drops the focus of a keyboard user and the scroll of the expanded
   * list, so it must not run when the data is the same.
   */
  const refreshHud = (): void => {
    // The frame loop starts before the HUD chunk arrives. The flag holds until the HUD
    // is there to read it, so a change in that window is not lost.
    if (!hudDirty || hud === null) return;
    hudDirty = false;
    hud.refresh();
  };

  /** Builds the HUD once its chunk arrives. The map is already drawing by then. */
  const attachHud = async (): Promise<void> => {
    if (hudModule === null || hudOptions === null) return;
    const module = await hudModule;
    if (disposed || handle === null) return;
    hud = module.createHud(handle, hudOptions.host ?? canvas.parentElement, hudOptions);
  };

  // The start load runs beside the scene load, so the records are there as soon as the
  // host's `load()` gives them. `ready` waits for both: a host that reads `systemCount`
  // after `ready` then reads the set the map started with. The start load settles
  // whether or not it succeeded, so a failed dataset still leaves a drawing map.
  const startLoad = datasets.startLoad();
  const ready =
    startLoad === null
      ? start().then(attachHud)
      : Promise.all([start().then(attachHud), startLoad]).then(() => undefined);
  // The picture goes when `ready` settles, whether it settles or fails. The same call
  // reads the rejection, so a host that never reads `ready` raises no unhandled
  // rejection.
  void ready.then(removeLoadingImage, removeLoadingImage);

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
    categorySweepMs(): number {
      // The reading is of the sweep the frame before asked for, so a caller draws a
      // frame after the change it wants to measure.
      return set.lastSweepMs;
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
    selectionSampling(): SamplingStats {
      return selectionWork.read();
    },
    resetSelectionSampling(): void {
      selectionWork.reset();
    },
    frameIntervalStats(): SamplingStats {
      return frameIntervals.read();
    },
    resetFrameIntervalStats(): void {
      frameIntervals.reset();
    },
    gridVertexCount(): number {
      return renderer?.gridVertexCount() ?? 0;
    },
    gridSpacingLy(): number {
      return renderer?.gridSpacingLy() ?? 0;
    },
    gridLevels(): GridLevelReading[] {
      return renderer?.gridLevels() ?? [];
    },
    selectionFlightMs(): number {
      if (flight === null) return 0;
      const left = FLIGHT_MS - (performance.now() - flight.startMs);
      return left > 0 ? left : 0;
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

  const map: GalaxyMap = {
    addCategories(categories: readonly CategoryInput[]): CategoryReport {
      const report = set.addCategories(categories);
      if (report.added + report.replaced > 0) hudDirty = true;
      return report;
    },
    addSystems(records: readonly SystemRecordInput[]): AddReport {
      const report = set.addSystems(records);
      syncSelection();
      if (report.added + report.replaced > 0) hudDirty = true;
      return report;
    },
    clearSystems(): void {
      if (set.count > 0) hudDirty = true;
      set.clearSystems();
      syncSelection();
    },
    clearSystemsAndCategories(): void {
      if (set.count > 0 || set.categoryCount > 0) hudDirty = true;
      set.clearSystemsAndCategories();
      syncSelection();
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
      endFlight();
      if (renderer !== null) lastStats = renderer.frameStats();
      controls?.dispose();
      controls = null;
      window.removeEventListener('resize', onResize);
      hud?.dispose();
      hud = null;
      renderer?.dispose();
      renderer = null;
      labels = null;
      markers?.clear();
      markers = null;
      gridLabels?.clear();
      gridLabels = null;
      ownedHost?.remove();
      ownedHost = null;
      removeLoadingImage();
      listeners.clear();
      selectionListeners.clear();
      gridListeners.clear();
      datasets.clear();
    },
    getView(): MapView {
      return readView();
    },
    setView(next: Partial<MapView>): void {
      // A host that writes the view has taken the camera, so the flight ends here.
      endFlight();
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
    getSystem(index: number): RealSystem | null {
      // The call returns a copy, so a host cannot write the set through the reading.
      const system = set.system(index);
      return system === null ? null : { ...system };
    },
    categoryCount(): number {
      return set.categoryCount;
    },
    getCategory(index: number): Category | null {
      const category = set.category(index);
      return category === null ? null : { ...category };
    },
    setCategoryVisible(name: string, visible: boolean): void {
      set.setCategoryVisible(name, visible);
    },
    isCategoryVisible(name: string): boolean {
      return set.isCategoryVisible(name);
    },
    setNameFilter(text: string): void {
      set.setNameFilter(text);
    },
    getNameFilter(): string {
      return set.getNameFilter();
    },
    systemAt(x: number, y: number): RealSystem | null {
      return copyOf(pickSystem(set, view, viewport(), { x, y }));
    },
    getHover(): RealSystem | null {
      return copyOf(hoverIndex);
    },
    getSelection(): RealSystem | null {
      return copyOf(
        selectedIdentity === null ? -1 : set.indexOfIdentity(selectedIdentity),
      );
    },
    setSelection(identity: string | null): void {
      applySelection(identity);
    },
    onSelectionChange(listener: (system: RealSystem | null) => void): () => void {
      selectionListeners.add(listener);
      return () => {
        selectionListeners.delete(listener);
      };
    },
    setSystemNamesVisible(on: boolean): void {
      namesOn = on === true;
    },
    areSystemNamesVisible(): boolean {
      return namesOn;
    },
    setGridVisible(on: boolean): void {
      const next = on === true;
      // A set to the value the switch already holds raises no listener, so a host that
      // writes the state it read does not write its own URL fragment again.
      if (next === gridOn) return;
      gridOn = next;
      renderer?.setGridDraw(gridOn);
      if (!gridOn) gridLabels?.clear();
      for (const listener of gridListeners) listener(gridOn);
    },
    isGridVisible(): boolean {
      return gridOn;
    },
    onGridChange(listener: (on: boolean) => void): () => void {
      gridListeners.add(listener);
      return () => {
        gridListeners.delete(listener);
      };
    },
    regionNameAt(point: readonly [number, number, number]): string | null {
      if (regionGrid === null) return null;
      return regionOfId(coarseRegionIdAt(regionGrid, point[0], point[2]))?.name ?? null;
    },
    // The four dataset members are the state machine's own calls. Each one is a closure
    // of `createDatasetState` and reads no `this`, so the handle carries it as it is.
    getDatasets: datasets.getDatasets,
    getLoadedDataset: datasets.getLoadedDataset,
    loadDataset: datasets.loadDataset,
    onDatasetChange: datasets.onDatasetChange,
    get hud(): HudHandle | null {
      return hud;
    },
    debug,
  };
  handle = map;
  return map;
}
