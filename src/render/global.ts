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
    systems?: boolean;
    grid?: boolean;
  }) => void;
  /** How many vertices the last frame's star draw issued. */
  starVertexCount?: () => number;
  /** The sum of the drawn counts over the last frame's boxels. */
  starDrawnCount?: () => number;
  /** The sum of the suppressed counts over the last frame's boxels. */
  starSuppressedCount?: () => number;
  /** How many markers the last frame drew. */
  systemMarkerCount?: () => number;
  /**
   * Holds the close fade at a value from 0 to 1, or gives it back to the zoom distance
   * with `null`. A test holds it at 1 to read the invented field at a close view.
   */
  setCloseFade?: (value: number | null) => void;
  /**
   * Holds the near plane at a value in light years, or gives it back to the zoom
   * distance rule with `null`. A test holds it at 10 to draw a view against the fixed
   * near plane the map used before the rule existed. The hold
   * reaches the frame alone: `project` and `planePointAt` build their matrix from the
   * rule, so a hold below 100 light years would make the drawn frame and the projected
   * pixel disagree. The scenario the hook serves reads 500 light years and above, where
   * the rule already gives 10.
   */
  setNearPlane?: (value: number | null) => void;
  /** The mean and the worst frame time in ms, with the frames they cover. */
  frameStats?: () => { frames: number; meanMs: number; worstMs: number };
  /** Starts the frame time mean again. */
  resetFrameStats?: () => void;
  /**
   * The vertices of the smoothed boundary set, as `x`, `y`, `z` per vertex. It is the
   * set the `simplified` mode draws, whatever mode the map is in.
   */
  regionLinePositions?: () => Float32Array;
  /**
   * The first and the last vertex index of every chain of the smoothed set, so a reader
   * can walk the chains of the set rather than read the vertices as loose pairs.
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
   * The regions the last label sweep found, with the samples each one holds, most
   * first. A test reads it to check that every label names a region on the screen.
   */
  regionSampleCounts?: () => { id: number; name: string; count: number }[];
  /** How many samples of the last sweep landed on the plane inside the model bounds. */
  regionSampleTotal?: () => number;
  /**
   * The mean and the worst label sweep time in ms, with the frames they cover, since
   * the reset.
   */
  labelSampling?: () => { frames: number; meanMs: number; worstMs: number };
  /**
   * The name of the region under a CSS pixel, read from the coarse region grid at the
   * plane `y = 0`. A test reads it to work out for itself which regions a frame shows,
   * rather than reading the counts the label code made.
   */
  regionNameAtScreen?: (x: number, y: number) => string | null;
  /** Starts the label sweep time mean again. */
  resetLabelSampling?: () => void;
  /**
   * The mean and the worst time of the hover pick and the overlay marks, with the
   * frames they cover, since the reset. The work runs around the draw call, so
   * `frameStats` does not see it.
   */
  selectionSampling?: () => { frames: number; meanMs: number; worstMs: number };
  /** Starts the selection work mean again. */
  resetSelectionSampling?: () => void;
  /**
   * The mean and the worst interval between animation frames, with the frames they
   * cover, since the reset. It covers everything the browser does per frame, so it is
   * what shows a dropped frame.
   */
  frameIntervalStats?: () => { frames: number; meanMs: number; worstMs: number };
  /** Starts the animation frame interval mean again. */
  resetFrameIntervalStats?: () => void;
  /** How many vertices the last frame's grid draw issued. */
  gridVertexCount?: () => number;
  /** The spacing of the grid of the last frame, in light years. */
  gridSpacingLy?: () => number;
  /** The plane offsets of the vertices the last grid draw issued, three floats each. */
  gridPlanes?: () => Float32Array;
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
