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
    glow?: boolean;
  }) => void;
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
