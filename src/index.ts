// The library entry point. A host installs the package and imports from here.
//
// The barrel is the whole supported surface. `package.json` names this module in
// `exports`, so a host cannot deep-import a module the list below leaves out. The list
// holds `createGalaxyMap`, the three view calls and the types the public calls name, and
// it does not hold `GalaxyMapDebug`, which is the renderer probe set the browser tests
// read.
//
// `src/app/main.ts`, `index.html` and the demo data reach this module from nowhere, so
// the library build carries no page and no data.
export { createGalaxyMap } from './app/create-map';
export { decodeGrid, decodeView, encodeView } from './app/url-view';
export type {
  Category,
  DatasetContent,
  DatasetEntry,
  DatasetInfo,
  DatasetLoadResult,
  FlightOutcome,
  FlyToOptions,
  FlyToTarget,
  GalaxyMap,
  GalaxyMapOptions,
  MapView,
  RealSystem,
  StartView,
  SystemImage,
} from './app/create-map';
export type { BrowseBounds } from './camera/view';
export type { InteractionSwitches } from './camera/controls';
// The type of the `nebulae` option, so a host can name the option in typed code. Its
// value is the single export of the `./nebulae` subpath, and its members are not part of
// the supported surface: a host passes the value it imported.
export type { NebulaSource } from './render/nebula-slot';
export type {
  AddReport,
  CategoryInput,
  CategoryReject,
  CategoryReport,
  Reject,
  SystemRecordInput,
} from './scene-data/real-systems';
export type {
  Line,
  LineInput,
  LinePoint,
  ShapeInfo,
  ShapeKind,
  ShapeReject,
  ShapeReport,
  Sphere,
  SphereInput,
} from './scene-data/shapes';
export type { HudAction, HudHandle, HudOptions } from './hud/types';
