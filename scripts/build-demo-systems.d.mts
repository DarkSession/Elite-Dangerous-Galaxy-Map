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
