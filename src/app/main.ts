// The demo page: build the map, own the URL fragment, and expose the test hooks.
import type { View } from '../camera/view';
import { galaxyMapGlobal } from '../render/global';
import { createGalaxyMap } from './create-map';
import type { GalaxyMap } from './create-map';
import { createFragmentWriter, parseViewFragment } from './url-view';

/** The event the page sends once the scene data is drawn for the first time. */
export const READY_EVENT = 'galaxy-map-ready';

const canvas = document.getElementById('map');
const labelHost = document.getElementById('labels');
const messageBox = document.getElementById('message');

function showMessage(text: string): void {
  if (messageBox === null) return;
  messageBox.textContent = text;
  messageBox.hidden = false;
}

/** Replaces the fragment of the page URL. The page owns the URL, not the library. */
function writeFragment(fragment: string): void {
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, '', url);
}

/**
 * Puts the demo data set on the map: 15 categories and 381 Guardian systems, which
 * `THIRD_PARTY_NOTICES.md` names. The page is a host application, so it supplies the
 * records through the same two calls any other host uses. The library bundles no data.
 *
 * The dev server alone runs this. `import.meta.env.DEV` is a constant in the production
 * build, so the bundler drops the block and the import with it. That matters: the
 * browser suite serves the production build, and its scenarios read an empty set for
 * the baseline image, the marker count and the byte-identical far view.
 */
async function loadDemoSystems(map: GalaxyMap): Promise<void> {
  const demo = await import('./demo-systems.json');
  const categories = map.addCategories(demo.default.categories);
  const systems = map.addSystems(demo.default.systems);
  console.info('The demo data set is on the map.', {
    categories: categories.added,
    systems: systems.added,
    rejected: systems.rejected.length,
  });
  for (const reject of systems.rejected.slice(0, 5)) {
    console.warn('The demo reader rejected a record.', reject);
  }
}

function start(target: HTMLCanvasElement): void {
  const global = galaxyMapGlobal();
  const map: GalaxyMap = createGalaxyMap(
    target,
    labelHost === null ? {} : { labelHost: labelHost as HTMLElement },
  );
  window.galaxyMap = map;
  // The entry point itself, so a browser test can build a second map with a canvas of
  // its own and check what the library makes when the host gives no options.
  window.galaxyMapFactory = createGalaxyMap;

  // The page parses the fragment, gives the view to the handle, and writes it back.
  map.setView(parseViewFragment(window.location.hash));
  // The writer formats the object it was given at every write, so the page keeps this
  // one current from the handle's own view changes.
  const pageView: View = map.getView();
  const writer = createFragmentWriter(pageView, { write: writeFragment });
  map.onViewChange((view) => {
    pageView.cursor = view.cursor;
    pageView.distance = view.distance;
    pageView.yaw = view.yaw;
    pageView.pitch = view.pitch;
    writer.schedule();
  });

  const debug = map.debug;
  global.getView = () => map.getView();
  global.setView = (next) => map.setView(next);
  global.project = (point) => debug.project(point);
  global.setPasses = (next) => debug.setPasses(next);
  global.starVertexCount = () => debug.starVertexCount();
  global.starDrawnCount = () => debug.starDrawnCount();
  global.starSuppressedCount = () => debug.starSuppressedCount();
  global.systemMarkerCount = () => debug.systemMarkerCount();
  global.setCloseFade = (value) => debug.setCloseFade(value);
  global.setNearPlane = (value) => debug.setNearPlane(value);
  global.frameStats = () => debug.frameStats();
  global.resetFrameStats = () => debug.resetFrameStats();
  global.drawingBufferSize = () => debug.drawingBufferSize();
  global.readPixel = (x, y) => debug.readPixel(x, y);
  global.readRect = (x, y, width, height) => debug.readRect(x, y, width, height);
  global.measureFrames = (count) => debug.measureFrames(count);
  global.drawNow = () => debug.drawNow();
  global.planePointAt = (x, y) => debug.planePointAt(x, y);
  global.regionSampleCounts = () => debug.regionSampleCounts();
  global.regionSampleTotal = () => debug.regionSampleTotal();
  global.labelSampling = () => debug.labelSampling();
  global.resetLabelSampling = () => debug.resetLabelSampling();
  global.regionNameAtScreen = (x, y) => debug.regionNameAtScreen(x, y);
  global.regionLinePositions = () => debug.regionLinePositions();
  global.regionLineChains = () => debug.regionLineChains();
  global.compileTestProgram = (vertex, fragment) =>
    debug.compileTestProgram(vertex, fragment);

  window.addEventListener('hashchange', () => {
    map.setView(parseViewFragment(window.location.hash));
  });

  if (import.meta.env.DEV) {
    void loadDemoSystems(map).catch((error: unknown) => {
      // The demo data is not the map. A failure here leaves the map drawing.
      console.warn('The demo data set did not load.', error);
    });
  }

  map.ready.then(
    () => {
      global.renderer = debug.renderer;
      global.ready = true;
      window.dispatchEvent(new Event(READY_EVENT));
    },
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      global.error = text;
      showMessage(text);
    },
  );
}

if (!(canvas instanceof HTMLCanvasElement)) {
  showMessage('The page has no canvas with the id "map".');
} else {
  start(canvas);
}
