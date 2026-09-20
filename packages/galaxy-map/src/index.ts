// The library entry point. A host installs the package and imports from here.
//
// The barrel is the whole supported surface. `package.json` names this module in
// `exports`, so a host cannot deep-import a module the list below leaves out. The list
// holds `createGalaxyMap`, the three view calls and the types the public calls name, and
// it does not hold `GalaxyMapDebug`, which is the renderer probe set the browser tests
// read.
//
// The demo page, `apps/demo/index.html` and the demo data are all in the other package
// of the workspace and reach this module by the package name, so the library build
// carries no page and no data.
export { createGalaxyMap } from './app/create-map';
export {
  createFragmentWriter,
  decodeGrid,
  decodeView,
  encodeView,
} from './app/url-view';
export type {
  Category,
  DatasetContent,
  DatasetEntry,
  DatasetInfo,
  DatasetLoadResult,
  DatasetView,
  FlightOutcome,
  FlyToOptions,
  FlyToTarget,
  GalaxyMap,
  GalaxyMapOptions,
  MapView,
  RealSystem,
  ResolvedIcon,
  StartView,
  SystemIconInput,
  SystemImage,
} from './app/create-map';
// The fragment writer and its two types. It is a host helper: it takes a `write`
// callback, so the library never touches `window.location`.
export type { FragmentWriter, FragmentWriterOptions } from './app/url-view';
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
// The panel types. A host cannot write the return of the `details` loader, the
// `infoFields` object or an entry of `lockedOptions` in typed code without them.
// `HudAction` is one of them: it names a footer button, which `SystemDetails` carries.
export type { HudAction, SystemDetails, SystemDetailValue } from './hud/details';
export type { HudHandle, HudInfoFields, HudMapOption, HudOptions } from './hud/types';
