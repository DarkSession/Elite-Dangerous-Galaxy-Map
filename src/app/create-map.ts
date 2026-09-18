// The library entry point. One call builds the map and gives back its handle.
import { ALL_INTERACTION, attachControls, readInteraction } from '../camera/controls';
import type { Controls, InteractionSwitches } from '../camera/controls';
import { flightAt, planFlight } from '../camera/flight';
import type { FlightPlan } from '../camera/flight';
import { planePoint, project } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import {
  copyView,
  createDefaultView,
  normaliseView,
  readBounds,
  resolveBounds,
  unrestrictedBounds,
} from '../camera/view';
import type { BrowseBounds, ResolvedBounds } from '../camera/view';
import type { View } from '../camera/view';
import { loadDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { HudHandle, HudOptions } from '../hud/types';
import { createRenderContext } from '../render/context';
import { createProgram } from '../render/program';
import { createFrameAccumulator, createRenderer } from '../render/renderer';
import type {
  BackgroundReading,
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
import { createShapeSet } from '../scene-data/shapes';
import type {
  Line,
  LineInput,
  ShapeReport,
  ShapeSet,
  Sphere,
  SphereInput,
} from '../scene-data/shapes';
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
import type { GridLabelOverlay, GridLabelPlaced } from './grid-labels';
import { createLabelOverlay, STILL_FRAME } from './labels';
import type { FrameTiming, LabelOverlay, SamplingStats } from './labels';
import { createCursorMarkerOverlay } from './cursor-marker';
import type { CursorMarkerOverlay } from './cursor-marker';
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

/** What `regionNameAtExact` reads from the region cell lookup. */
type RegionLookup =
  typeof import('@elite-dangerous-almanac/core/astro/codex-region-lookup');

/**
 * The region cell lookup, loaded on the first exact query and kept after it.
 *
 * The table is about 199 KiB and only the region worker read it before. A dynamic import
 * puts it in a chunk of its own, so the entry chunk is the size it was and a map that
 * never asks never fetches it. The promise is held at module level, so a second call
 * while a first load runs waits on the same load and starts no second one.
 *
 * A **failed** load is dropped rather than kept. One network fault while the user opens
 * the first information panel would otherwise hold a rejected promise for the life of the
 * page, and the region field would read `Unknown` for every system after it, even once the
 * network comes back. The next call starts a fresh load instead.
 */
let regionLookup: Promise<RegionLookup> | null = null;

function loadRegionLookup(): Promise<RegionLookup> {
  regionLookup ??=
    import('@elite-dangerous-almanac/core/astro/codex-region-lookup').catch(
      (reason: unknown) => {
        regionLookup = null;
        throw reason;
      },
    );
  return regionLookup;
}

/** Options for `createGalaxyMap`. */
export interface GalaxyMapOptions {
  /**
   * The element the region labels go in. With no element the library makes one in the
   * canvas's parent, so a host that gives a canvas alone gets a working map.
   */
  readonly labelHost?: HTMLElement;
  /**
   * False takes the region overlay off. The overlay is on unless the options turn it off.
   * A value that is not a boolean takes the default.
   */
  readonly regions?: boolean;
  /**
   * False takes the spheres and the lines off. The shapes are on unless the options turn
   * them off. A value that is not a boolean takes the default.
   */
  readonly shapes?: boolean;
  /** True draws the coordinate grid. The grid is off unless the options ask for it. */
  readonly grid?: boolean;
  /**
   * False takes the cursor marker off. The marker is on unless the options turn it off,
   * because nothing else on the screen says where the cursor is. A host that draws its
   * own cursor turns this one off here or with `setCursorMarkerVisible`.
   */
  readonly cursorMarker?: boolean;
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
  /**
   * How much of the space the user may browse. It clamps the cursor and the far zoom
   * limit, and it changes nothing the map draws. The default is `unrestricted`, which is
   * the model bounds and a 120,000 light year far limit. A setting the map cannot read
   * takes the default.
   */
  readonly bounds?: BrowseBounds;
  /**
   * The camera the map opens at. The map takes it in the frame it draws first and does
   * not fly to it. A field the host leaves out takes the value of the default view. A
   * setting the map cannot read is ignored in whole.
   */
  readonly startView?: StartView;
  /**
   * Which of the user's inputs the map acts on. A field the host leaves out is on. A
   * setting the map cannot read leaves every switch on.
   */
  readonly interaction?: Partial<InteractionSwitches>;
}

/**
 * Where a host asks the camera to fly. `cursor` and `system` name the same field two
 * ways, and `cursor` wins where the host gives both. A field the host leaves out keeps
 * the value the view holds, so `flyTo({ distance: 100 })` is a zoom in place.
 */
export interface FlyToTarget {
  /** The point the camera centres on, in game coordinates. */
  readonly cursor?: readonly [number, number, number];
  /**
   * The identity of a system of the set, which is its `id64` where the record carries one
   * and its name where it does not. An identity the set does not hold flies nowhere.
   */
  readonly system?: string;
  /** The distance from the cursor to the camera, in light years. */
  readonly distance?: number;
  /** The camera's angle around the cursor, in degrees. */
  readonly yaw?: number;
  /** The camera's elevation above the galactic plane, in degrees. */
  readonly pitch?: number;
}

/** How a host asks for the flight to run. */
export interface FlyToOptions {
  /**
   * False takes the target in this frame and runs no flight. The default is true. The map
   * does the same where the browser asks for less movement.
   */
  readonly animate?: boolean;
}

/** How a flight ended. */
export type FlightOutcome = 'landed' | 'interrupted';

/**
 * The camera a host asks the map to open at. `cursor` and `system` name the same field
 * two ways, and `cursor` wins where the host gives both.
 */
export interface StartView {
  /** The point the camera centres on, in game coordinates. */
  readonly cursor?: readonly [number, number, number];
  /**
   * The identity of a system to centre on: the `id64` where the record carries one, and
   * the name where it does not. The host adds its records after the map is built, so the
   * map holds the identity and applies it in the first frame the set holds the record.
   */
  readonly system?: string;
  /** The distance from the cursor to the camera, in light years. */
  readonly distance?: number;
  /** The camera's angle around the cursor, in degrees. */
  readonly yaw?: number;
  /** The camera's elevation above the galactic plane, in degrees. */
  readonly pitch?: number;
}

/** How many drawn frames a pending start view waits for its record. */
const PENDING_START_FRAMES = 600;

/** True where a field the host left out, or a finite number. */
function readNumberField(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/** A finite number, or null. */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Three finite numbers, or null. */
function readPoint(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!(value as unknown[]).every((part) => Number.isFinite(part))) return null;
  const point = value as number[];
  return [point[0] as number, point[1] as number, point[2] as number];
}

/**
 * Reads a host's start view, or null where it cannot be read. An unreadable field makes
 * the whole setting unreadable, so a map never opens at half of what the host asked for.
 */
export function readStartView(value: unknown): StartView | null {
  if (value === null || typeof value !== 'object') return null;
  const source = value as {
    cursor?: unknown;
    system?: unknown;
    distance?: unknown;
    yaw?: unknown;
    pitch?: unknown;
  };
  if (!readNumberField(source.distance)) return null;
  if (!readNumberField(source.yaw)) return null;
  if (!readNumberField(source.pitch)) return null;
  const start: {
    cursor?: [number, number, number];
    system?: string;
    distance?: number;
    yaw?: number;
    pitch?: number;
  } = {};
  if (source.cursor !== undefined) {
    const cursor = source.cursor;
    if (!Array.isArray(cursor) || cursor.length !== 3) return null;
    if (!(cursor as unknown[]).every((part) => Number.isFinite(part))) return null;
    const point = cursor as number[];
    start.cursor = [point[0] as number, point[1] as number, point[2] as number];
  }
  if (source.system !== undefined) {
    if (typeof source.system !== 'string' || source.system === '') return null;
    start.system = source.system;
  }
  if (typeof source.distance === 'number') start.distance = source.distance;
  if (typeof source.yaw === 'number') start.yaw = source.yaw;
  if (typeof source.pitch === 'number') start.pitch = source.pitch;
  return start;
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
  /** The vertices of the traced set, whether the region overlay draws or not. */
  regionLinePositions(): Float32Array;
  /** The chain bounds of the traced set, whether the region overlay draws or not. */
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
   * The background reading of the last frame, and null in a frame that built none. The
   * read waits for the card, so it is a probe and not the path the labels take.
   */
  backgroundReading(): BackgroundReading | null;
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
  /**
   * Reads the browsable bounds back as the host gave them, and not the shape the map
   * works out from them.
   */
  getBounds(): BrowseBounds;
  /**
   * Replaces the browsable bounds. The view is re-clamped in this frame, and the view
   * change listeners fire where the clamp moved it. A setting the map cannot read leaves
   * the one it holds in place, which `getBounds` then reports.
   */
  setBounds(bounds: BrowseBounds): void;
  /**
   * Flies the camera to a target, on the path a selection flight takes. It does not change
   * the selection: a `system` in the target names a place and nothing more.
   *
   * The promise settles with `'landed'` where the flight reached the target and with
   * `'interrupted'` where anything ended it early, which is a second `flyTo`, a selection,
   * the user's own input, a `setView` or `dispose`. It never rejects.
   *
   * A target outside the browsable bounds is clamped, and the promise still settles with
   * `'landed'`: the flight reached the target it was allowed to reach. A target that is
   * already the view, and a `system` the set does not hold, settle with `'landed'` and run
   * no flight. The call works with every interaction switch off.
   */
  flyTo(target: FlyToTarget, options?: FlyToOptions): Promise<FlightOutcome>;
  /** True while a flight runs, whether a selection or a `flyTo` started it. */
  isFlying(): boolean;
  /**
   * Calls `listener` each time a flight ends, with how it ended. It does not fire where no
   * flight ran. Returns an unsubscribe.
   */
  onFlightEnd(listener: (how: FlightOutcome) => void): () => void;
  /** Reads every interaction switch. */
  getInteraction(): InteractionSwitches;
  /**
   * Replaces part of the interaction setting. A switch the setting does not name, and a
   * switch that is not a boolean, keeps the value it had. The change takes effect in the
   * frame it happens, so a drag in progress stops moving the view.
   */
  setInteraction(next: Partial<InteractionSwitches>): void;
  /** True while the region overlay draws its boundary lines and places its labels. */
  areRegionsVisible(): boolean;
  /**
   * Turns the region overlay on or off, from the next frame on. It rebuilds no scene
   * data: the worker already built the boundary set and the renderer holds it. A value
   * that is not a boolean leaves the state as it was.
   */
  setRegionsVisible(on: boolean): void;
  /** Reads spheres into the shape set and returns the report. */
  addSpheres(spheres: readonly SphereInput[]): ShapeReport;
  /** Reads lines into the shape set and returns the report. */
  addLines(lines: readonly LineInput[]): ShapeReport;
  /** Empties the shape set. */
  clearShapes(): void;
  /** How many spheres the shape set holds. */
  sphereCount(): number;
  /** How many lines the shape set holds. */
  lineCount(): number;
  /** Reads one sphere as a copy, or null outside the set. */
  getSphere(index: number): Sphere | null;
  /** Reads one line as a copy, or null outside the set. */
  getLine(index: number): Line | null;
  /** True while the spheres and the lines draw. */
  areShapesVisible(): boolean;
  /**
   * Turns the spheres and the lines on or off, from the next frame on. It rebuilds no
   * scene data. A value that is not a boolean leaves the state as it was.
   */
  setShapesVisible(on: boolean): void;
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
  /** Turns the cursor marker on or off. */
  setCursorMarkerVisible(on: boolean): void;
  /** True while the cursor marker draws. */
  getCursorMarkerVisible(): boolean;
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
  /**
   * The name of the codex region that holds a point, resolved on the game's own region
   * grid of 49.3494 light years, or null. It reads the `x` and the `z` of the point and
   * ignores its `y`, as `regionNameAt` does.
   *
   * `regionNameAt` reads the coarse grid, whose cells are 197.3976 light years, and it
   * answers in the same tick. It is the reading for something that follows the cursor
   * every frame, such as the HUD's top bar. This call is the reading for something that
   * names one place once, such as the information panel of a selected system, where a
   * wrong region is stated as a fact.
   *
   * The call gives a promise because the region cell table is about 199 KiB and loads on
   * the first call. The table then stays, so every call after the first answers from it.
   * A second call while a first load runs waits on the same load. A failed load rejects
   * the promise rather than throwing out of the call.
   */
  regionNameAtExact(point: readonly [number, number, number]): Promise<string | null>;
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
  // The lookup a `{ system }` line point resolves through. `indexOfIdentity` holds the
  // `id64` and the name as the record wrote it, and a line point compares the name
  // without case, so a miss falls to a folded name table. The table is built once per
  // change of the set and not once per point, because a full line set holds 65,536
  // points and a sweep of 10,000 systems for each one would break the read budget.
  let foldedNames: Map<string, number> | null = null;
  let foldedVersion = -1;
  const shapes: ShapeSet = createShapeSet(
    (identity: string): readonly [number, number, number] | null => {
      let index = set.indexOfIdentity(identity);
      if (index < 0) {
        if (foldedNames === null || foldedVersion !== set.version) {
          foldedNames = new Map<string, number>();
          foldedVersion = set.version;
          for (let slot = 0; slot < set.count; slot += 1) {
            const system = set.system(slot);
            if (system === null) continue;
            // The first record of a folded name wins, which is the order `addSystems`
            // wrote them in.
            const folded = system.name.toLowerCase();
            if (!foldedNames.has(folded)) foldedNames.set(folded, slot);
          }
        }
        index = foldedNames.get(identity.toLowerCase()) ?? -1;
      }
      return index < 0 ? null : (set.system(index)?.position ?? null);
    },
  );
  const view: View = createDefaultView();

  // The browsable space, held twice: the setting as the host gave it, which `getBounds`
  // reads back, and the shape every clamp reads. A host that asked for `auto` and read
  // back a resolved box would have to guess which mode it is in.
  let boundsSetting: BrowseBounds = readBounds(options.bounds) ?? {
    mode: 'unrestricted',
  };
  let resolvedBounds: ResolvedBounds = unrestrictedBounds();
  // The set version the resolved shape was worked out at. `auto` follows the set, so the
  // frame loop re-resolves when the set changes and not on every frame.
  let boundsSetVersion = -1;

  /**
   * Works the setting and the set's own box into the shape the clamps read. It is called
   * where the setting changes and where the set changes, and not once a frame.
   */
  const resolveBoundsNow = (): void => {
    resolvedBounds = resolveBounds(boundsSetting, set.systemBox);
    boundsSetVersion = set.version;
  };

  /**
   * Re-clamps the live view to the browsable space and raises the listeners where the
   * clamp moved it. A host that narrows the space while the camera is outside it does not
   * leave the camera there.
   */
  const reclampView = (): void => {
    const before = copyView(view);
    normaliseView(view, resolvedBounds);
    const moved =
      view.cursor[0] !== before.cursor[0] ||
      view.cursor[1] !== before.cursor[1] ||
      view.cursor[2] !== before.cursor[2] ||
      view.distance !== before.distance;
    // A glide holds a target the wheel clamped against the space of its own moment, and
    // the glide writes the distance with no clamp of its own. A space that narrows under
    // a running glide must drop it, or the glide carries the camera past the new far
    // limit. The live distance is often still inside that limit when this happens, so the
    // test reads the target and not the clamp above.
    const glide = controls?.zoomTargetLy() ?? null;
    const glideOutside = glide !== null && glide > resolvedBounds.maxDistanceLy;
    if (moved || glideOutside) controls?.endZoom();
    if (moved) announce();
  };

  // The shape is worked out once here, so a host that named `bounds` in the options gets
  // it in the first frame and not in the second.
  resolveBoundsNow();

  /**
   * The identity the start view named, held until the set holds the record. The host adds
   * its systems after the map is built, so the identity is unknown in the first frame.
   */
  let pendingStart: string | null = null;
  /** How many frames the map has drawn. A pending start expires at 600 of them. */
  let framesDrawn = 0;

  // The start view is taken here and not in the first frame, so the first frame the user
  // sees is already the view the host asked for. The map does not fly to it.
  const startView =
    options.startView === undefined ? null : readStartView(options.startView);
  if (startView !== null) {
    if (startView.distance !== undefined) view.distance = startView.distance;
    if (startView.yaw !== undefined) view.yaw = startView.yaw;
    if (startView.pitch !== undefined) view.pitch = startView.pitch;
    // `cursor` beats `system`: a host that gives both has already said where to look, and
    // waiting for a record would move the camera off that point later.
    if (startView.cursor !== undefined) {
      view.cursor = [startView.cursor[0], startView.cursor[1], startView.cursor[2]];
    } else if (startView.system !== undefined) {
      pendingStart = startView.system;
    }
    normaliseView(view, resolvedBounds);
  }

  /** Drops the pending start. Every input and every host write of the view calls it. */
  const dropPendingStart = (): void => {
    pendingStart = null;
  };

  /**
   * Centres a pending start on its record in the first frame the set holds it. The view
   * change listeners hear the move. It does not select the system: a host that wants the
   * panel open calls `setSelection`.
   */
  const applyPendingStart = (): void => {
    if (pendingStart === null) return;
    // A map whose host never adds that record does not hold the start for the life of
    // the page.
    if (framesDrawn >= PENDING_START_FRAMES) {
      dropPendingStart();
      return;
    }
    const index = set.indexOfIdentity(pendingStart);
    if (index < 0) return;
    const system = set.system(index);
    dropPendingStart();
    if (system === null) return;
    view.cursor = [system.position[0], system.position[1], system.position[2]];
    normaliseView(view, resolvedBounds);
    announce();
  };

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
    readonly plan: FlightPlan;
    readonly startMs: number;
    /** Settles the promise a `flyTo` gave its caller, and null for a selection flight. */
    readonly settle: ((how: FlightOutcome) => void) | null;
  } | null = null;

  /** The listeners `onFlightEnd` holds. */
  const flightEndListeners = new Set<(how: FlightOutcome) => void>();

  // Which of the user's inputs act on the map. The controls read it once for each input,
  // so a change takes effect in the frame it happens.
  let interaction: InteractionSwitches = readInteraction(
    ALL_INTERACTION,
    options.interaction,
  );

  // True where the view was written and not moved: `setView`, the landing of a selection
  // flight, and a view a host read from the URL fragment, which reaches the map through
  // `setView`. The next draw reads the flag and clears it, because a write of the view
  // draws no frame of its own. The label filter takes its target whole on such a frame.
  let jumped = false;

  let renderer: Renderer | null = null;
  let labels: LabelOverlay | null = null;
  let markers: MarkerOverlay | null = null;
  let gridLabels: GridLabelOverlay | null = null;
  let cursorMarker: CursorMarkerOverlay | null = null;
  let namesOn = false;
  let gridOn = options.grid === true;
  // On unless the options turn it off. The grid reads `=== true` because it is off by
  // default; the marker reads `!== false` because it is on by default.
  let cursorMarkerOn = options.cursorMarker !== false;
  const selectionWork: FrameAccumulator = createFrameAccumulator();
  const frameIntervals: FrameAccumulator = createFrameAccumulator();
  let ownedHost: HTMLElement | null = null;
  let controls: Controls | null = null;
  // What the canvas carried as its own `touch-action` before the map wrote one. `dispose`
  // puts it back, so a host gets the canvas it gave.
  let heldTouchAction: string | null = null;
  let regionGrid: CoarseRegionGrid | null = null;
  let regionLines: RegionLines | null = null;
  // The `regions` pass switch of `debug`, which the browser tests read. It is not the
  // host switch below: the pass switch belongs to the tests and the host switch to the
  // host and the HUD. Both off draw the same frame.
  let regionPassOn = true;
  let regionsVisible = typeof options.regions === 'boolean' ? options.regions : true;
  let shapesVisible = typeof options.shapes === 'boolean' ? options.shapes : true;
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
    // The write takes the distance, so the zoom glide ends here and keeps no target of
    // its own. Only the wheel glides.
    controls?.endZoom();
    view.cursor = [next.cursor[0], next.cursor[1], next.cursor[2]];
    view.distance = next.distance;
    view.yaw = next.yaw;
    view.pitch = next.pitch;
    normaliseView(view, resolvedBounds);
    announce();
  };

  /**
   * Drops the running flight and leaves the view where it had reached. The pointer, the
   * wheel, the movement keys and `setView` all call it, so the user is never held for
   * the length of a flight.
   */
  const endFlight = (): void => {
    finishFlight('interrupted');
  };

  /**
   * Ends the running flight, settles the promise a `flyTo` gave its caller and raises the
   * flight-end listeners. A call where no flight runs does nothing at all, so a listener
   * hears one call for each flight that ran and none for anything else.
   */
  const finishFlight = (how: FlightOutcome): void => {
    const running = flight;
    flight = null;
    if (running === null) return;
    running.settle?.(how);
    for (const listener of [...flightEndListeners]) listener(how);
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
   * less movement, and where the path has no length, the view takes the end state in this
   * frame and no flight runs.
   */
  const centreOn = (system: RealSystem): void => {
    const target: View = {
      cursor: [system.position[0], system.position[1], system.position[2]],
      distance: Math.min(view.distance, SELECTION_DISTANCE_LY),
      yaw: view.yaw,
      pitch: view.pitch,
    };
    // The end view is clamped to the browsable space before the path is worked out, so a
    // system outside the bounds lands on the nearest cursor the bounds allow rather than
    // moving the camera out or refusing the selection.
    normaliseView(target, resolvedBounds);
    if (reducedMotion()) {
      endFlight();
      takeView(target);
      return;
    }
    // A selection during a flight flies from the view as it stands, which the loop has
    // already written into `view`. The end view is normalised above, so the path is
    // worked out against where the flight may land and not against where the system is.
    const plan = planFlight(copyView(view), target);
    // A path of no length is the view the map already holds. Taking the end state here
    // keeps `selectionFlightMs` honest: no flight runs, so none is left to run.
    if (plan.durationMs === 0) {
      endFlight();
      takeView(target);
      return;
    }
    // A flight the selection replaces is an interrupted flight, so a `flyTo` a selection
    // cuts off settles before the new plan takes its place.
    endFlight();
    flight = { plan, startMs: performance.now(), settle: null };
  };

  /**
   * Flies the camera to a host's target. The promise it gives back settles once, with
   * `'landed'` or `'interrupted'`, and never rejects.
   */
  const flyTo = (
    target: FlyToTarget,
    flightOptions?: FlyToOptions,
  ): Promise<FlightOutcome> => {
    let settle: (how: FlightOutcome) => void = () => undefined;
    const promise = new Promise<FlightOutcome>((resolve) => {
      settle = resolve;
    });

    const asked = target === null || typeof target !== 'object' ? {} : target;
    // The host has taken the camera, so a pending start is dropped and a flight already
    // running is interrupted, whatever this call goes on to do. A call that names a
    // system the set does not hold ends both the same way: it is a `flyTo` like any
    // other, and it is the host asking for the camera.
    dropPendingStart();
    endFlight();

    const next = copyView(view);
    let place: readonly [number, number, number] | null = null;
    if (readPoint(asked.cursor) !== null) {
      place = readPoint(asked.cursor);
    } else if (typeof asked.system === 'string') {
      const index = set.indexOfIdentity(asked.system);
      const system = index < 0 ? null : set.system(index);
      if (system === null) {
        // An identity the set does not hold flies nowhere and leaves the view where the
        // call found it. `flyTo` has no pending state, so the map does not wait for the
        // record to arrive.
        settle('landed');
        return promise;
      }
      place = [system.position[0], system.position[1], system.position[2]];
    }
    if (place !== null) next.cursor = [place[0], place[1], place[2]];
    // A field that is not a finite number keeps the value the view holds, as a field the
    // host leaves out does.
    if (readNumber(asked.distance) !== null) {
      next.distance = readNumber(asked.distance) as number;
    }
    if (readNumber(asked.yaw) !== null) next.yaw = readNumber(asked.yaw) as number;
    if (readNumber(asked.pitch) !== null)
      next.pitch = readNumber(asked.pitch) as number;
    // The end view takes the browsable bounds before the path is worked out, so a target
    // outside them lands on the nearest view the bounds allow.
    normaliseView(next, resolvedBounds);

    if (flightOptions?.animate === false || reducedMotion()) {
      takeView(next);
      settle('landed');
      return promise;
    }
    const plan = planFlight(copyView(view), next);
    if (plan.durationMs === 0) {
      takeView(next);
      settle('landed');
      return promise;
    }
    flight = { plan, startMs: performance.now(), settle };
    return promise;
  };

  /**
   * Advances the running flight to a moment. The loop calls it once a frame before the
   * draw, so the listeners are raised as often as the map draws and no more.
   *
   * A held movement key ends the flight here, before it advances. The loop advances the
   * flight before `controls.update` moves the view, so a flight that advanced first
   * would take one frame of the path from the user.
   */
  const advanceFlight = (nowMs: number): void => {
    if (flight === null) return;
    if (controls?.isMoving() === true) {
      endFlight();
      return;
    }
    const elapsed = nowMs - flight.startMs;
    const next = flightAt(flight.plan, elapsed);
    // The landing is a jump and the frames before it are not. A flight in progress moves
    // the view, so the labels ride it; the landing writes the end view, and a label that
    // held its target across it would walk the width of the screen to catch up.
    const landed = elapsed >= flight.plan.durationMs;
    if (landed) jumped = true;
    takeView(next);
    // The view is written before the promise settles, so a host that awaits the flight
    // reads the view it landed on.
    if (landed) finishFlight('landed');
  };

  /**
   * Takes an identity. A system moves the view and, when it is not the system already
   * selected, raises the selection listeners. An identity the set does not hold, and
   * `null`, clear the selection and leave the view where it is.
   */
  const applySelection = (identity: string | null): void => {
    dropPendingStart();
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
    // The shapes of the entry that goes leave with it, so a route never draws over the
    // systems of the entry that comes. The listener of the new entry adds its own.
    shapes.clearShapes();
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

  /**
   * Draws one frame.
   *
   * `timing` is the time the frame covers and whether the caller wrote the view rather
   * than moved it. **Every call outside the frame loop passes `STILL_FRAME`**, which is
   * 0 seconds: such a call redraws the frame the loop last built, and a redraw must not
   * advance the label filter. A new call site follows the same rule.
   *
   * A jump is a write of the view and not a movement of it. `jumped` holds the flag from
   * the write until the next draw reads it, because `setView` and the landing of a
   * selection flight both write the view without drawing.
   */
  const drawFrame = (timing: FrameTiming = STILL_FRAME): void => {
    if (renderer === null) return;
    framesDrawn += 1;
    renderer.render(view);
    const size = renderer.viewport();
    // The hover pick and the overlay marks are one reading, because the two run together
    // around the draw call and the budget covers them together.
    const started = performance.now();
    // Before the markers and the labels, so the marker joins the overlay first. The
    // stacking is by `z-index` and not by tree order, which `src/app/plane-overlay.ts`
    // states.
    cursorMarker?.update({ view, viewport: size, on: cursorMarkerOn });
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
    labels?.update(view, size, regionPassOn && regionsVisible, {
      seconds: timing.seconds,
      jump: timing.jump || jumped,
    });
    jumped = false;
    // The grid labels read the label level the grid pass drew, so a label and its lines
    // never disagree. A frame with the grid off reports a spacing of 0, which clears the
    // labels with the same call.
    gridLabels?.update({
      view,
      viewport: size,
      spacingLy: renderer.gridSpacingLy(),
      bounds: MODEL_BOUNDS,
      browse: resolvedBounds,
      // The read-back of an earlier frame. A label's opacity is one frame behind the
      // picture, which a person does not see, and a read that waits for the card costs
      // more than the pass it reads.
      background: renderer.backgroundFrame(),
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
    renderer.setShapes(shapes);
    renderer.setShapeDraw(shapesVisible);

    const host = options.labelHost ?? makeLabelHost(canvas);
    if (host !== null && host !== options.labelHost) ownedHost = host;
    labels = host === null ? null : createLabelOverlay(host);
    markers = host === null ? null : createMarkerOverlay(host);
    gridLabels = host === null ? null : createGridLabelOverlay(host);
    cursorMarker = host === null ? null : createCursorMarkerOverlay(host);
    renderer.setGridDraw(gridOn);

    // The browser gives every touch to the map, and scrolls, pans and zooms nothing of
    // its own. The style is inline and not a rule in a style sheet: the host owns the
    // canvas and may load a reset sheet that sets `touch-action: auto`, and the only
    // sheet the library injects belongs to the HUD, which is opt-in.
    heldTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    controls = attachControls(canvas, view, {
      onChange: announce,
      onInput(): void {
        // The user has taken the camera. The flight ends and a record that arrives later
        // does not move the view back.
        endFlight();
        dropPendingStart();
      },
      reducedMotion,
      bounds: () => resolvedBounds,
      interaction: () => interaction,
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
    renderer.setRegionLines(scene.regionLines);
    renderer.setRegionDraw(regionsVisible);
    labels?.setGrid(scene.regionGrid, scene.regionFlow);
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
      // `auto` follows the set, so the shape is worked out again where the set changed
      // and not on every frame. The re-clamp then holds the camera inside the new space.
      if (set.version !== boundsSetVersion) {
        resolveBoundsNow();
        reclampView();
      }
      applyPendingStart();
      advanceFlight(performance.now());
      controls?.update(seconds);
      refreshHud();
      drawFrame({ seconds, jump: false });
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
      if (passes.regions !== undefined) regionPassOn = passes.regions;
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
    gridLabelReadings(): GridLabelPlaced[] {
      return gridLabels?.readings() ?? [];
    },
    backgroundSize(): [number, number] {
      return renderer?.backgroundSize() ?? [0, 0];
    },
    regionCoverageSize(): [number, number] | null {
      return renderer?.regionCoverageSize() ?? null;
    },
    shapeDrawCalls(): number {
      return renderer?.shapeDrawCalls() ?? 0;
    },
    shapeLineBufferSize(): [number, number] | null {
      return renderer?.shapeLineBufferSize() ?? null;
    },
    backgroundReading(): BackgroundReading | null {
      return renderer?.backgroundReading() ?? null;
    },
    selectionFlightMs(): number {
      if (flight === null) return 0;
      const left = flight.plan.durationMs - (performance.now() - flight.startMs);
      return left > 0 ? left : 0;
    },
    zoomTargetLy(): number | null {
      return controls?.zoomTargetLy() ?? null;
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
      // A line may hold the position of a system of the set, so the shapes go with it.
      shapes.clearShapes();
      syncSelection();
    },
    clearSystemsAndCategories(): void {
      if (set.count > 0 || set.categoryCount > 0) hudDirty = true;
      set.clearSystemsAndCategories();
      shapes.clearShapes();
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
      shapes.dispose();
      endFlight();
      if (renderer !== null) lastStats = renderer.frameStats();
      controls?.dispose();
      controls = null;
      if (heldTouchAction !== null) {
        canvas.style.touchAction = heldTouchAction;
        heldTouchAction = null;
      }
      window.removeEventListener('resize', onResize);
      hud?.dispose();
      hud = null;
      renderer?.dispose();
      renderer = null;
      labels = null;
      markers?.clear();
      markers = null;
      cursorMarker?.clear();
      cursorMarker = null;
      gridLabels?.clear();
      gridLabels = null;
      ownedHost?.remove();
      ownedHost = null;
      removeLoadingImage();
      listeners.clear();
      selectionListeners.clear();
      gridListeners.clear();
      flightEndListeners.clear();
      datasets.clear();
    },
    getView(): MapView {
      return readView();
    },
    setView(next: Partial<MapView>): void {
      // A host that writes the view has taken the camera, so the flight, the zoom glide
      // and the pending start all end here.
      endFlight();
      dropPendingStart();
      controls?.endZoom();
      if (next.cursor !== undefined) view.cursor = [...next.cursor];
      if (next.distance !== undefined) view.distance = next.distance;
      if (next.yaw !== undefined) view.yaw = next.yaw;
      if (next.pitch !== undefined) view.pitch = next.pitch;
      normaliseView(view, resolvedBounds);
      jumped = true;
      announce();
    },
    onViewChange(listener: (view: MapView) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getBounds(): BrowseBounds {
      return boundsSetting.mode === 'sphere'
        ? {
            mode: 'sphere',
            centre: [
              boundsSetting.centre[0],
              boundsSetting.centre[1],
              boundsSetting.centre[2],
            ],
            radiusLy: boundsSetting.radiusLy,
          }
        : { ...boundsSetting };
    },
    flyTo(target: FlyToTarget, flightOptions?: FlyToOptions): Promise<FlightOutcome> {
      return flyTo(target, flightOptions);
    },
    isFlying(): boolean {
      return flight !== null;
    },
    onFlightEnd(listener: (how: FlightOutcome) => void): () => void {
      flightEndListeners.add(listener);
      return () => {
        flightEndListeners.delete(listener);
      };
    },
    getInteraction(): InteractionSwitches {
      return { ...interaction };
    },
    setInteraction(next: Partial<InteractionSwitches>): void {
      interaction = readInteraction(interaction, next);
    },
    setBounds(next: BrowseBounds): void {
      const read = readBounds(next);
      // An unreadable setting leaves the one the map holds in place, as a bad view field
      // does. The host reads `getBounds` to see what took effect.
      if (read === null) return;
      boundsSetting = read;
      resolveBoundsNow();
      reclampView();
      drawFrame();
    },
    areRegionsVisible(): boolean {
      return regionsVisible;
    },
    setRegionsVisible(on: boolean): void {
      // A value that is not a boolean leaves the state as it was, as a bad view field
      // does. The host reads `areRegionsVisible` to see what took effect.
      if (typeof on !== 'boolean') return;
      if (on === regionsVisible) return;
      regionsVisible = on;
      renderer?.setRegionDraw(regionsVisible);
      drawFrame();
    },
    addSpheres(spheres: readonly SphereInput[]): ShapeReport {
      return shapes.addSpheres(spheres);
    },
    addLines(lines: readonly LineInput[]): ShapeReport {
      return shapes.addLines(lines);
    },
    clearShapes(): void {
      shapes.clearShapes();
    },
    sphereCount(): number {
      return shapes.sphereCount;
    },
    lineCount(): number {
      return shapes.lineCount;
    },
    getSphere(index: number): Sphere | null {
      return shapes.getSphere(index);
    },
    getLine(index: number): Line | null {
      return shapes.getLine(index);
    },
    areShapesVisible(): boolean {
      return shapesVisible;
    },
    setShapesVisible(on: boolean): void {
      if (typeof on !== 'boolean') return;
      if (on === shapesVisible) return;
      shapesVisible = on;
      renderer?.setShapeDraw(shapesVisible);
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
    setCursorMarkerVisible(on: boolean): void {
      cursorMarkerOn = on !== false;
      // The next frame places the marker again. Turning it off takes the element out of
      // the overlay at once, so a host that reads the overlay after the call sees the
      // change without a frame, as `setGridVisible` clears the grid labels.
      if (!cursorMarkerOn) cursorMarker?.clear();
    },
    getCursorMarkerVisible(): boolean {
      return cursorMarkerOn;
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
    regionNameAtExact(
      point: readonly [number, number, number],
    ): Promise<string | null> {
      return loadRegionLookup().then(
        (lookup) =>
          lookup.findCodexRegionAt({ x: point[0], z: point[2] })?.name ?? null,
      );
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
