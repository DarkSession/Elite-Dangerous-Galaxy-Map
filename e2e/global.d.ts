import type { GalaxyMapGlobal } from '../src/render/global';

/** One long task the browser reported. */
export interface LongTaskRecord {
  duration: number;
  start: number;
}

declare global {
  interface Window {
    __galaxyMap?: GalaxyMapGlobal;
    /** The long tasks the page collected, for the scene-data test. */
    __longTasks?: LongTaskRecord[];
    /** When the ready event arrived, in milliseconds after navigation start. */
    __readyAt?: number;
    /** How many context menu events reached the document without being stopped. */
    __openContextMenus?: number;
  }
}

export {};
