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
    nebulae?: boolean;
    points?: boolean;
    stars?: boolean;
    glow?: boolean;
    regions?: boolean;
    shapes?: boolean;
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
  /** How many nebula instances the last frame drew. */
  nebulaDrawnCount?: () => number;
  /** How many draw calls the last frame's nebula pass issued: one per record drawn. */
  nebulaDrawCalls?: () => number;
  /** How many records passed the size floor in the last frame, before the budget. */
  nebulaAboveFloorCount?: () => number;
  /** How much of the screen the last frame's nebulae cover, in screen areas. */
  nebulaCoveredArea?: () => number;
  /**
   * The front range and the centre range the last frame sent the point pass and the star
   * pass, in light years. The depth gate reads the pair, and no pixel states it.
   */
  nebulaSpriteRange?: () => [number, number];
  /** Whether the nebula records and the volumes reached the renderer. */
  nebulaeAttached?: () => boolean;
  /**
   * Sets how much of the volume's extinction a nebula takes, 0 to 1. At 0 the
   * pass draws what it drew before the march, so a test reads one frame at each value
   * and compares the two.
   */
  setNebulaOcclusion?: (value: number) => void;
  /**
   * Draws the nebula records in the reverse order. The pass composites without an
   * order, so the frame does not change, and one browser test reads that.
   */
  setNebulaOrderReversed?: (value: boolean) => void;
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
   * The vertices of the traced boundary set, as `x`, `y`, `z` per vertex. It is the set
   * the region overlay draws.
   */
  regionLinePositions?: () => Float32Array;
  /**
   * The first and the last vertex index of every chain of the traced set, so a reader can
   * walk the chains of the set rather than read the vertices as loose pairs.
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
  /** The spacing of the label level of the last frame, in light years. */
  gridSpacingLy?: () => number;
  /** The spacing, the screen spacing, the width and the alpha of each grid level. */
  gridLevels?: () => {
    spacingLy: number;
    screenCss: number;
    widthCss: number;
    alpha: number;
  }[];
  /** The milliseconds left in the running selection flight, and 0 when none runs. */
  selectionFlightMs?: () => number;
  /**
   * The distance in light years the zoom glide moves toward, and null when no glide
   * runs.
   */
  zoomTargetLy?: () => number | null;
  /**
   * How many background read-backs the frames since the reset took, and their mean time
   * in milliseconds. The take runs at the top of the frame, so `frameStats` does not
   * see it.
   */
  readbackStats?: () => { frames: number; meanMs: number; worstMs: number };
  /** Starts the read-back mean again. */
  resetReadbackStats?: () => void;
  /** The mean time of the icon placement sweep, in milliseconds. */
  iconSweepMs?: () => number;
  /** Wakes the frame loop, as a change of the map does. */
  wake?: () => void;
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
