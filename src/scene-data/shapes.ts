// The shape set: the spheres and the lines the host gives the map. A shape is drawn and
// is never picked, and it carries its own colour rather than a category. This module owns
// the shape of a sphere record and a line record: nothing else reads a raw one. Nothing
// here knows about WebGL.

/** The largest number of spheres the set holds. */
export const MAX_SPHERES = 1024;

/**
 * The largest number of lines the set holds.
 *
 * The UIA demo set draws one line for each hyperdiction pair the Canonn report file holds,
 * which came to 983 lines when the set was built, and that file grows with every report.
 * The cost of the bound is the segment buffer of the pass, which holds
 * `MAX_LINE_POINTS + MAX_LINES` segments, so 4,096 costs 4.6 per cent more than 1,024.
 */
export const MAX_LINES = 4096;

/** The largest number of points the lines of the set hold together. */
export const MAX_LINE_POINTS = 65536;

/** The opacity a sphere takes when it names none. */
export const DEFAULT_SPHERE_OPACITY = 0.18;

/** The width a line takes when it names none, in CSS pixels. */
export const DEFAULT_LINE_WIDTH_CSS = 2;

/** The widest a line draws, in CSS pixels. */
export const MAX_LINE_WIDTH_CSS = 16;

/** One point of a line: a game coordinate, or the identity of a system. */
export type LinePoint = readonly [number, number, number] | { readonly system: string };

/**
 * What a host passes to `addSpheres`. The type states the contract and the reader holds
 * it: every field is still checked at run time, because the data comes from a file or a
 * network call the compiler does not see.
 *
 * The index signature lets a record carry fields the reader drops.
 */
export interface SphereInput {
  /** The centre in game coordinates, in light years. */
  readonly position: readonly [number, number, number];
  /** The radius in light years. It is above 0. */
  readonly radius: number;
  /** Red, green and blue, each from 0 to 255. */
  readonly color: readonly [number, number, number];
  /** How deep the shell reads at its middle. The default is 0.18. */
  readonly opacity?: number;
  /** What the shape stands for. The map draws no label for it. */
  readonly name?: string;
  /** A field the reader drops. */
  readonly [field: string]: unknown;
}

/** One sphere the set holds. */
export interface Sphere {
  readonly position: readonly [number, number, number];
  readonly radius: number;
  readonly color: readonly [number, number, number];
  readonly opacity: number;
  readonly name?: string;
}

/** What a host passes to `addLines`. */
export interface LineInput {
  /** At least two points, each a coordinate or a system reference. */
  readonly points: readonly LinePoint[];
  /** Red, green and blue, each from 0 to 255. */
  readonly color: readonly [number, number, number];
  /** How wide the ribbon draws, in CSS pixels. The default is 2. */
  readonly width?: number;
  /** True joins the last point to the first. The default is false. */
  readonly closed?: boolean;
  /** What the shape stands for. The map draws no label for it. */
  readonly name?: string;
  /** A field the reader drops. */
  readonly [field: string]: unknown;
}

/** One line the set holds. Its points are resolved game coordinates. */
export interface Line {
  readonly points: readonly (readonly [number, number, number])[];
  readonly color: readonly [number, number, number];
  readonly width: number;
  readonly closed: boolean;
  readonly name?: string;
}

/** Why the reader rejected a shape. */
export type ShapeRejectReason =
  | 'bad-position'
  | 'bad-radius'
  | 'bad-color'
  | 'bad-opacity'
  | 'bad-width'
  | 'bad-points'
  | 'bad-point'
  | 'unknown-system'
  | 'over-capacity'
  | 'over-point-capacity';

/** One shape the reader rejected. */
export interface ShapeReject {
  /** Where the shape sat in the call. */
  readonly index: number;
  readonly reason: ShapeRejectReason;
}

/** What `addSpheres` and `addLines` give back. */
export interface ShapeReport {
  readonly added: number;
  readonly rejected: ShapeReject[];
}

/**
 * Where a system reference points. The shape set reads it when a line is added, so a
 * later change to the system set does not move a line that is already in.
 */
export type SystemLookup = (
  identity: string,
) => readonly [number, number, number] | null;

/** The spheres and the lines, which the host fills through the handle. */
export interface ShapeSet {
  /** Reads spheres into the set and reports what it did. */
  addSpheres(spheres: readonly SphereInput[]): ShapeReport;
  /** Reads lines into the set and reports what it did. */
  addLines(lines: readonly LineInput[]): ShapeReport;
  /** Empties both lists. */
  clearShapes(): void;
  /** How many spheres the set holds. */
  readonly sphereCount: number;
  /** How many lines the set holds. */
  readonly lineCount: number;
  /** How many points the lines of the set hold together. */
  readonly linePointCount: number;
  /** Rises on every change to the set. */
  readonly version: number;
  /** The spheres, in the order they were added. The renderer reads them. */
  readonly spheres: readonly Sphere[];
  /** The lines, in the order they were added. The renderer reads them. */
  readonly lines: readonly Line[];
  /** One sphere as a copy, or null outside the set. */
  getSphere(index: number): Sphere | null;
  /** One line as a copy, or null outside the set. */
  getLine(index: number): Line | null;
  /** Empties the set and releases what it holds. */
  dispose(): void;
}

/** Three finite numbers, or null. */
function readPoint(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: number[] = [];
  for (const part of value) {
    if (typeof part !== 'number' || !Number.isFinite(part)) return null;
    parts.push(part);
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** Three finite numbers from 0 to 255, or null. */
function readColor(value: unknown): [number, number, number] | null {
  const parts = readPoint(value);
  if (parts === null) return null;
  for (const part of parts) {
    if (part < 0 || part > 255) return null;
  }
  return parts;
}

/** A string of at least one character, or null. */
function readName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}

/**
 * The opacity of a sphere record. It gives the default when the field is absent and
 * `null` on a value that is not a finite number above 0 and at most 1.
 */
function readOpacity(value: unknown): number | null {
  if (value === undefined) return DEFAULT_SPHERE_OPACITY;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 1) return null;
  return value;
}

/**
 * The width of a line record, in CSS pixels. It gives the default when the field is
 * absent and `null` on a value that is not a finite number above 0 and at most 16.
 */
function readWidth(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LINE_WIDTH_CSS;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_LINE_WIDTH_CSS) return null;
  return value;
}

/** The identity a line point names, or null when the point is not a reference. */
function readSystemReference(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const named = (value as { readonly system?: unknown }).system;
  return readName(named);
}

/**
 * Builds the shape set. `findSystem` reads a system identity, which is the `id64` as a
 * string or the name compared without case, and gives that system's position back. The
 * set reads it while `addLines` runs and never again, so a line holds the position the
 * system had when the line went in.
 */
export function createShapeSet(findSystem: SystemLookup): ShapeSet {
  let spheres: Sphere[] = [];
  let lines: Line[] = [];
  let linePointCount = 0;
  let version = 0;

  /** Reads one sphere, or gives the reason the reader dropped it. */
  const readSphere = (input: SphereInput): Sphere | ShapeRejectReason => {
    const position = readPoint(input.position);
    if (position === null) return 'bad-position';
    const radius = input.radius;
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
      return 'bad-radius';
    }
    const color = readColor(input.color);
    if (color === null) return 'bad-color';
    const opacity = readOpacity(input.opacity);
    if (opacity === null) return 'bad-opacity';
    // A `name` that is not a string of at least one character is dropped, and the shape
    // is still read. The name carries no meaning to the map, which draws no label for a
    // shape, so a bad one is not a reason to lose the picture.
    const name = readName(input.name);
    const sphere: Sphere = { position, radius, color, opacity };
    return name === null ? sphere : { ...sphere, name };
  };

  /** Reads one line, or gives the reason the reader dropped it. */
  const readLine = (input: LineInput): Line | ShapeRejectReason => {
    const given = input.points;
    if (!Array.isArray(given) || given.length < 2) return 'bad-points';
    const points: [number, number, number][] = [];
    for (const entry of given) {
      const coordinate = readPoint(entry);
      if (coordinate !== null) {
        points.push(coordinate);
        continue;
      }
      const identity = readSystemReference(entry);
      // An entry that is neither form is a fault in the call. A reference the system set
      // does not hold is a fault in the data, and each one has its own reason.
      if (identity === null) return 'bad-point';
      const found = findSystem(identity);
      // A route that has lost a waypoint is wrong and not shorter, so the whole line goes.
      if (found === null) return 'unknown-system';
      points.push([found[0], found[1], found[2]]);
    }
    const color = readColor(input.color);
    if (color === null) return 'bad-color';
    const width = readWidth(input.width);
    if (width === null) return 'bad-width';
    // `closed` carries no reject reason, so a value that is not a boolean reads as the
    // default. The field says how to draw the line and not what the line is.
    const closed = input.closed === true;
    const name = readName(input.name);
    const line: Line = { points, color, width, closed };
    return name === null ? line : { ...line, name };
  };

  return {
    addSpheres(input: readonly SphereInput[]): ShapeReport {
      const rejected: ShapeReject[] = [];
      let added = 0;
      for (let index = 0; index < input.length; index += 1) {
        const read = readSphere(input[index] as SphereInput);
        if (typeof read === 'string') {
          rejected.push({ index, reason: read });
          continue;
        }
        // The capacity is read after the fields, so an entry that is both bad and past
        // the cap reports its own fault and the host can fix it.
        if (spheres.length >= MAX_SPHERES) {
          rejected.push({ index, reason: 'over-capacity' });
          continue;
        }
        spheres.push(read);
        added += 1;
      }
      if (added > 0) version += 1;
      return { added, rejected };
    },

    addLines(input: readonly LineInput[]): ShapeReport {
      const rejected: ShapeReject[] = [];
      let added = 0;
      for (let index = 0; index < input.length; index += 1) {
        const read = readLine(input[index] as LineInput);
        if (typeof read === 'string') {
          rejected.push({ index, reason: read });
          continue;
        }
        if (lines.length >= MAX_LINES) {
          rejected.push({ index, reason: 'over-capacity' });
          continue;
        }
        // A line goes in whole or not at all, so the point capacity is read against the
        // whole line and a line that would cross it is dropped.
        if (linePointCount + read.points.length > MAX_LINE_POINTS) {
          rejected.push({ index, reason: 'over-point-capacity' });
          continue;
        }
        lines.push(read);
        linePointCount += read.points.length;
        added += 1;
      }
      if (added > 0) version += 1;
      return { added, rejected };
    },

    clearShapes(): void {
      if (spheres.length === 0 && lines.length === 0) return;
      spheres = [];
      lines = [];
      linePointCount = 0;
      version += 1;
    },

    get sphereCount(): number {
      return spheres.length;
    },

    get lineCount(): number {
      return lines.length;
    },

    get linePointCount(): number {
      return linePointCount;
    },

    get version(): number {
      return version;
    },

    get spheres(): readonly Sphere[] {
      return spheres;
    },

    get lines(): readonly Line[] {
      return lines;
    },

    getSphere(index: number): Sphere | null {
      const found = spheres[index];
      if (found === undefined) return null;
      const copy: Sphere = {
        position: [found.position[0], found.position[1], found.position[2]],
        radius: found.radius,
        color: [found.color[0], found.color[1], found.color[2]],
        opacity: found.opacity,
      };
      return found.name === undefined ? copy : { ...copy, name: found.name };
    },

    getLine(index: number): Line | null {
      const found = lines[index];
      if (found === undefined) return null;
      const copy: Line = {
        points: found.points.map((point) => [point[0], point[1], point[2]] as const),
        color: [found.color[0], found.color[1], found.color[2]],
        width: found.width,
        closed: found.closed,
      };
      return found.name === undefined ? copy : { ...copy, name: found.name };
    },

    dispose(): void {
      spheres = [];
      lines = [];
      linePointCount = 0;
      version += 1;
    },
  };
}
