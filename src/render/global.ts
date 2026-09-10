// The object the page exposes for the browser tests.

/** A view as the test hooks read and write it. */
export interface TestView {
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}

/** What the page puts on `window.__galaxyMap`. */
export interface GalaxyMapGlobal {
  /** The unmasked renderer string the card reports. */
  renderer: string;
  /** True once the scene data is in the GPU and the first frame is drawn. */
  ready: boolean;
  /** The error the page shows, or null. */
  error: string | null;
  /** Renders a number of frames and returns the mean draw-to-finish time in ms. */
  measureFrames?: (count: number) => number;
  /** Reads the current view. */
  getView?: () => TestView;
  /** Replaces the current view. */
  setView?: (view: Partial<TestView>) => void;
  /** Chooses which passes draw. */
  setPasses?: (passes: {
    volume?: boolean;
    clouds?: boolean;
    points?: boolean;
    stars?: boolean;
    glow?: boolean;
    regions?: boolean;
  }) => void;
  /** How many vertices the last frame's star draw issued. */
  starVertexCount?: () => number;
  /** The sum of the drawn counts over the last frame's boxels. */
  starDrawnCount?: () => number;
  /** The boundary vertices the page drew, as `x`, `y`, `z` per vertex. */
  regionLinePositions?: () => Float32Array;
  /**
   * The signed curvature of every boundary vertex, in reciprocal light years, indexed
   * as the vertices are. The value at a vertex belongs to the primitive that starts
   * there, and zero is a straight primitive. A reader needs it to measure to the drawn
   * line, because a primitive is an arc and its chord is not what the page draws.
   */
  regionLineCurvature?: () => Float32Array;
  /**
   * The first and the last vertex index of every chain, so a reader can walk the
   * chains of the boundary set rather than read the vertices as loose pairs.
   */
  regionLineChains?: () => { first: Uint32Array; last: Uint32Array };
  /** Projects a game position to a CSS pixel on the canvas. */
  project?: (point: [number, number, number]) => { x: number; y: number };
  /** Reads one pixel of the drawing buffer, in CSS pixels from the top left. */
  readPixel?: (x: number, y: number) => [number, number, number, number];
  /**
   * Reads a rectangle of the drawing buffer, in CSS pixels from the top left. The
   * result holds four bytes per pixel, row by row, and the first row is the top one.
   */
  readRect?: (x: number, y: number, width: number, height: number) => Uint8Array;
  /** The drawing buffer size in device pixels. */
  drawingBufferSize?: () => [number, number];
  /** Draws one frame at once. */
  drawNow?: () => void;
  /** The plane point under a CSS pixel, at the cursor's height. */
  planePointAt?: (x: number, y: number) => [number, number, number] | null;
  /** Compiles one program. Returns null on success, or the error text. */
  compileTestProgram?: (vertex: string, fragment: string) => string | null;
  /**
   * The labels the last frame placed, with the scale each one draws at. A test reads
   * it to check the size a region's label falls to before it leaves the page.
   */
  regionLabelPlacements?: () => { id: number; name: string; scale: number }[];
  /**
   * The mean and the worst label placement time in ms, with the frames they cover and
   * the work of the last frame, since the reset.
   */
  labelPlacement?: () => {
    frames: number;
    meanMs: number;
    worstMs: number;
    projections: number;
    vertexProjections: number;
    unprojections: number;
    steps: number;
  };
  /**
   * The name of the region under a CSS pixel, read from the coarse region grid at the
   * plane `y = 0`. A test reads it to work out for itself which regions a frame shows,
   * rather than reading the counts the label code made.
   */
  regionNameAtScreen?: (x: number, y: number) => string | null;
  /**
   * The centre of every region and the clearance there, as the worker measured them. A
   * test reads it to check that a label sits on the centre of its region.
   */
  regionCentres?: () => {
    id: number;
    name: string;
    x: number;
    z: number;
    clearanceLy: number;
  }[];
  /** Starts the label placement time mean again. */
  resetLabelPlacement?: () => void;
}

declare global {
  interface Window {
    __galaxyMap?: GalaxyMapGlobal;
  }
}

/** Reads, or creates, the object the browser tests use. */
export function galaxyMapGlobal(scope: Window = window): GalaxyMapGlobal {
  const existing = scope.__galaxyMap;
  if (existing !== undefined) return existing;
  const created: GalaxyMapGlobal = { renderer: '', ready: false, error: null };
  scope.__galaxyMap = created;
  return created;
}
