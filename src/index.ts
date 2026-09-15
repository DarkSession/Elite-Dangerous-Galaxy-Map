// The library entry point. A host installs the package and imports from here.
//
// The barrel is the whole supported surface. `package.json` names this module in
// `exports`, so a host cannot deep-import a module the list below leaves out. The list
// holds `createGalaxyMap` and the types the public calls name, and it does not hold
// `GalaxyMapDebug`, which is the renderer probe set the browser tests read.
//
// `src/app/main.ts`, `index.html` and the demo data reach this module from nowhere, so
// the library build carries no page and no data.
export { createGalaxyMap } from './app/create-map';
export type {
  Category,
  DatasetContent,
  DatasetEntry,
  DatasetInfo,
  DatasetLoadResult,
  GalaxyMap,
  GalaxyMapOptions,
  MapView,
  RealSystem,
  RegionMode,
  SystemImage,
} from './app/create-map';
export type {
  AddReport,
  CategoryInput,
  CategoryReject,
  CategoryReport,
  Reject,
  SystemRecordInput,
} from './scene-data/real-systems';
export type { HudAction, HudHandle, HudOptions } from './hud/types';
