// The types of the conversions the demo build script exports. The script itself is
// JavaScript, because node runs it directly with no build step.

/** One site of the Guardian Ruins dump and of the Guardian Structures dump. */
export interface RuinsSite {
  readonly 'Site Type'?: string;
  readonly 'System Name'?: string;
  readonly 'Body Name'?: string;
  readonly x?: string | number;
  readonly y?: string | number;
  readonly z?: string | number;
}

/** One record of the Notable Systems dump. */
export interface NotableEntry {
  readonly category?: string;
  readonly entry_name?: string;
  readonly system?: string;
  readonly html?: string;
  readonly x?: string | number;
  readonly y?: string | number;
  readonly z?: string | number;
}

/** One category of a demo set. */
export interface DemoCategory {
  readonly name: string;
  readonly color: readonly [number, number, number];
  readonly description: string;
}

/** One picture of a demo record. */
export interface DemoImage {
  readonly url: string;
  readonly caption: string;
}

/** One record of a demo set. A set without pictures carries no `images`. */
export interface DemoSystem {
  readonly name: string;
  readonly coords: { readonly x: number; readonly y: number; readonly z: number };
  readonly primaryCategory: string;
  readonly secondaryCategories: readonly string[];
  readonly description?: string;
  readonly images?: readonly DemoImage[];
  /** A field a later dump may add. The reader of the map drops it. */
  readonly [field: string]: unknown;
}

/** A demo set the script writes. */
export interface DemoSet {
  readonly source: string;
  readonly licence: string;
  readonly categories: readonly DemoCategory[];
  readonly systems: readonly DemoSystem[];
}

export declare const DUMP_URL: string;
export declare const STRUCTURES_DUMP_URL: string;
export declare const NOTABLE_DUMP_URL: string;
export declare const THUMBNAIL_BASE: string;
export declare const SOURCE_URL: string;
export declare const LICENCE: string;
export declare const CATEGORY_OF_TYPE: Record<string, DemoCategory>;
export declare const CATEGORY_OF_STRUCTURE: Record<string, DemoCategory>;
export declare const CATEGORY_OF_SUBJECT: Record<string, DemoCategory>;
export declare function describeSystem(sites: readonly RuinsSite[]): string;
export declare function describeStructureSystem(sites: readonly RuinsSite[]): string;
export declare function plainTextFromHtml(html: unknown): string;
export declare function convertRuins(dump: unknown): DemoSet;
export declare function convertStructures(dump: unknown): DemoSet;
export declare function convertNotable(dump: unknown): DemoSet;

/** One sphere of a demo set. */
export interface DemoSphere {
  readonly position: readonly [number, number, number];
  readonly radius: number;
  readonly color: readonly [number, number, number];
  readonly name?: string;
}

/**
 * One point of a demo line: a coordinate, or the name of a system the same set holds.
 */
export type DemoLinePoint =
  readonly [number, number, number] | { readonly system: string };

/** One line of a demo set. */
export interface DemoLine {
  readonly points: readonly DemoLinePoint[];
  readonly color: readonly [number, number, number];
  readonly width?: number;
  readonly closed?: boolean;
  readonly name?: string;
}

/**
 * One point or one whole route the conversion could not write. `point` is the name the
 * source gave, or null where the whole route goes. `route` is the index of a route of the
 * source, or the key of a hyperdiction pair.
 */
export interface DemoDrop {
  readonly route: number | string;
  readonly point: string | null;
  readonly reason: string;
}

/**
 * A demo set that carries shapes as well as records. The entry part prints `drops` and
 * writes the rest, so the committed file holds no `drops`.
 */
export interface DemoShapeSet extends DemoSet {
  readonly spheres: readonly DemoSphere[];
  readonly lines: readonly DemoLine[];
  readonly drops: readonly DemoDrop[];
}

/**
 * One sphere list of the UIA source, with the colour of its own material and the marker
 * category the source gives the record at its centre. `category` is null for a list the
 * source gives no record.
 */
export interface Ed3dSphereList {
  readonly key: string;
  readonly color: readonly [number, number, number];
  readonly category: string | null;
}

/** One entry of the `systems` list of an ED3D source, as the converter builds one. */
export interface Ed3dSystem {
  readonly name: string;
  readonly coords: { readonly x: number; readonly y: number; readonly z: number };
  readonly cat: readonly string[];
  readonly infos?: string;
}

/** One entry of the `routes` list of an ED3D source, as the converter builds one. */
export interface Ed3dRoute {
  readonly cat: readonly string[];
  readonly circle: boolean;
  readonly points: readonly { readonly s: string }[];
}

/** The records and the routes one waypoint table or the report file gives. */
export interface Ed3dBuild {
  readonly systems: readonly Ed3dSystem[];
  readonly routes: readonly Ed3dRoute[];
}

/** The build of the report file, which also reports what it dropped. */
export interface Ed3dHyperdictionBuild extends Ed3dBuild {
  readonly drops: readonly DemoDrop[];
}

/** The bounds of the galaxy model, on each axis. */
export interface ModelBounds {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

/** The two files the UIA source fetches at run time. */
export interface UiaExtras {
  readonly waypointTables?: readonly unknown[];
  readonly hyperdictions?: readonly Record<string, string>[];
}

export declare const UIA_SOURCE_URL: string;
export declare const ADAMASTOR_SOURCE_URL: string;
export declare const EDSM_SYSTEM_URL: string;
export declare const UIA_CSV_BASE: string;
export declare const UIA_HYPERDICTION_URL: string;
export declare const UIA_COUNT: number;
export declare const UIA_NAMES: readonly string[];
export declare const UIA_CATEGORY_COLOUR: readonly [number, number, number];
export declare const UIA_LETTER_CATEGORY: Readonly<Record<string, string>>;
export declare const UIA_DIRECTION_CATEGORY: string;
export declare const UIA_DIRECTION_LENGTH_LY: number;
export declare const UIA_HYPERDICTION_CATEGORY: string;
export declare const UIA_HOSTILE_CATEGORY: string;
export declare const UIA_RANGE_LY: number;
export declare const MODEL_BOUNDS: ModelBounds;
export declare const UIA_SPHERE_LISTS: readonly Ed3dSphereList[];
export declare const LINE_COLOUR_FALLBACK: readonly [number, number, number];
export declare function parseEd3dData(text: string): unknown;
export declare function parseCsv(text: string): Record<string, string>[];
export declare function uiaWaypointUrl(index: number): string;
export declare function uiaWaypointRows(table: unknown): Record<string, string>[];
export declare function uiaWaypointSet(
  rows: readonly Record<string, string>[],
  index: number,
): Ed3dBuild;
export declare function uiaHyperdictionSet(
  rows: readonly Record<string, string>[],
  tables: readonly (readonly Record<string, string>[])[],
): Ed3dHyperdictionBuild;
export declare function ed3dSphereRecords(
  data: unknown,
  lists: readonly Ed3dSphereList[],
): Ed3dSystem[];
export declare function rayInsideBounds(
  start: readonly [number, number, number],
  direction: readonly [number, number, number],
  limit: number,
  bounds?: ModelBounds,
): number;
export declare function ed3dRouteNames(data: unknown): string[];
export declare function convertUia(data: unknown, extras?: UiaExtras): DemoShapeSet;
export declare function convertAdamastor(
  data: unknown,
  findPosition: (name: string) => readonly [number, number, number] | null,
): DemoShapeSet;
