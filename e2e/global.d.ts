import type {
  GalaxyMap,
  GalaxyMapOptions,
} from '../packages/galaxy-map/src/app/create-map';
import type { NebulaSource } from '../packages/galaxy-map/src/render/nebula-slot';
import type { GalaxyMapGlobal } from '../packages/galaxy-map/src/render/global';

/** One long task the browser reported. */
export interface LongTaskRecord {
  duration: number;
  start: number;
}

declare global {
  interface Window {
    __galaxyMap?: GalaxyMapGlobal;
    /** The handle the demo page builds with the library entry point. */
    galaxyMap?: GalaxyMap;
    /** The library entry point, so a test can build a map of its own. */
    galaxyMapFactory?: (
      canvas: HTMLCanvasElement,
      options?: GalaxyMapOptions,
    ) => GalaxyMap;
    /** The nebula source, so a test can build a map with it and a map without it. */
    galaxyMapNebulae?: NebulaSource;
    /** The long tasks the page collected, for the scene-data test. */
    __longTasks?: LongTaskRecord[];
    /** When the ready event arrived, in milliseconds after navigation start. */
    __readyAt?: number;
    /** How many context menu events reached the document without being stopped. */
    __openContextMenus?: number;
    /** How many times the view change listener of the zoom glide test was called. */
    __viewChangeCount?: number;
    /** The names the selection listeners heard, for the selection tests. */
    __selectionLog?: (string | null)[];
    /** The second map the HUD tests build, with the HUD on. */
    __hudMap?: GalaxyMap;
    /** The second map the information panel tests build, with a details loader. */
    __panelMap?: GalaxyMap;
    /** The names of the systems the details loader was called with. */
    __detailsCalls?: string[];
    /** The signals the details loader was given, in the order of the calls. */
    __detailsSignals?: AbortSignal[];
    /** The second map the name label option tests build. */
    __namesMap?: GalaxyMap;
    /** The second map the start-view tests build, with a `startView` of their own. */
    __startMap?: GalaxyMap;
    /** The map the touch tests build, over a canvas that states no `touch-action`. */
    __touchMap?: GalaxyMap;
    /** The second map the dataset tests build, with a catalog of their own. */
    __datasetMap?: GalaxyMap;
    /** The second map the nebula tests build, with no nebula source. */
    __plainMap?: GalaxyMap;
    /** The ids of the entries whose `load()` the dataset tests' catalog called. */
    __datasetLoads?: string[];
    /** The systems the HUD footer action was called with. */
    __hudActionCalls?: string[];
    /** How many times the search box called the name filter. */
    __filterCalls?: number;
    /** How many times the map asked the HUD to rebuild its panels. */
    __hudRefreshCalls?: number;
    /** How each flight ended, for the flight-end listener test. */
    __flightEnds?: ('landed' | 'interrupted')[];
  }
}

export {};
