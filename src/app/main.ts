// The demo page: build the map, own the URL fragment, and expose the test hooks.
import type { View } from '../camera/view';
import { galaxyMapGlobal } from '../render/global';
import type { CategoryInput, SystemRecordInput } from '../scene-data/real-systems';
import { createGalaxyMap } from './create-map';
import type { DatasetContent, DatasetEntry, GalaxyMap } from './create-map';
import { createFragmentWriter, parseGridFragment, parseViewFragment } from './url-view';

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
 * Reads one demo file into the two arrays the map takes.
 *
 * JSON holds no tuple, so the module types a colour as `number[]` while `CategoryInput`
 * states three numbers. The page therefore casts the categories through `unknown`. That
 * is the point at which the file data enters, and the reader still checks every field.
 */
function demoSet(file: {
  categories: unknown;
  systems: readonly SystemRecordInput[];
}): DatasetContent {
  return {
    categories: file.categories as unknown as readonly CategoryInput[],
    systems: file.systems,
  };
}

/**
 * The three demo data sets, which `THIRD_PARTY_NOTICES.md` names. The page is a host
 * application, so it gives the map a catalog the way any other host does: each entry
 * carries the counts the committed file holds and a `load()` that imports it. The
 * library bundles no data and fetches none.
 *
 * The Guardian Ruins records name their thumbnails at
 * `https://ruins.canonn.tech/images/maps/`, so the browser loads those pictures from
 * Canonn when the user selects such a system. The other two sets name no picture.
 *
 * The demo site build carries the three files, so the dev server and the built site
 * draw the same map. The library build reaches this module from nowhere, because
 * `src/index.ts` does not import it.
 */
const DEMO_DATASETS: readonly DatasetEntry[] = [
  {
    id: 'guardian-ruins',
    label: 'Guardian Ruins',
    collection: 'Canonn Research Group',
    region: 'Inner Orion Spur and five more regions',
    description:
      'The Guardian Ruins the Canonn Research Group records, as one record per ' +
      'system and one category per ruin layout.',
    systemCount: 212,
    load: async (): Promise<DatasetContent> =>
      demoSet((await import('../../demo-data/guardian-ruins.json')).default),
  },
  {
    id: 'guardian-structures',
    label: 'Guardian Structures',
    collection: 'Canonn Research Group',
    region: 'Inner Orion Spur',
    description:
      'The Guardian Structures the Canonn Research Group records, as one record per ' +
      'system and one category per site type.',
    systemCount: 163,
    load: async (): Promise<DatasetContent> =>
      demoSet((await import('../../demo-data/guardian-structures.json')).default),
  },
  {
    id: 'notable-systems',
    label: 'Notable Systems',
    collection: 'Canonn Research Group',
    region: 'Inner Orion Spur and Norma Expanse',
    description:
      'The systems the Canonn Research Group marks as notable, with one category per ' +
      "subject and the project's own text as the description.",
    systemCount: 16,
    load: async (): Promise<DatasetContent> =>
      demoSet((await import('../../demo-data/notable-systems.json')).default),
  },
];

function start(target: HTMLCanvasElement): void {
  const global = galaxyMapGlobal();
  const map: GalaxyMap = createGalaxyMap(target, {
    ...(labelHost === null ? {} : { labelHost: labelHost as HTMLElement }),
    // The loader the repository holds in `public/`, which the build serves under the
    // site's own base path. `THIRD_PARTY_NOTICES.md` records the file and its source.
    // The page reads the base path from the build, because the published site sits
    // under a path and the dev server sits at the root.
    loadingImage: `${import.meta.env.BASE_URL}EDLoader1.svg`,
    // The page gives the map the three demo sets and asks for the Guardian Ruins at
    // start. The HUD then shows the dataset field and the dataset library dialog.
    datasets: DEMO_DATASETS,
    dataset: 'guardian-ruins',
    // The demo site starts with the coordinate grid on, unless the fragment says `g=0`.
    // That is this page's own option: a host that gives no `grid` still gets no grid.
    grid: parseGridFragment(window.location.hash) !== false,
    // The demo page is a host application, so it turns the HUD on the way any other
    // host does, and it adds one footer action to show what `actions` gives a host.
    hud: {
      actions: [
        {
          label: 'LOG RECORD',
          onSelect: (system) => {
            console.info('The demo action read a system.', system);
          },
        },
      ],
    },
  });
  window.galaxyMap = map;
  // The entry point itself, so a browser test can build a second map with a canvas of
  // its own and check what the library makes when the host gives no options.
  window.galaxyMapFactory = createGalaxyMap;

  // The page parses the fragment, gives the view to the handle, and writes it back.
  map.setView(parseViewFragment(window.location.hash));
  // The writer formats the object it was given at every write, so the page keeps this
  // one current from the handle's own view changes.
  const pageView: View = map.getView();
  // The writer reads the grid switch at each write, because a write may come 500 ms
  // after the move that asked for it.
  const writer = createFragmentWriter(pageView, {
    write: writeFragment,
    grid: () => map.isGridVisible(),
  });
  map.onViewChange((view) => {
    pageView.cursor = view.cursor;
    pageView.distance = view.distance;
    pageView.yaw = view.yaw;
    pageView.pitch = view.pitch;
    writer.schedule();
  });
  // The grid is not view state, so the page learns the switch from its own notification.
  // The write rides the same throttle the view fields do.
  map.onGridChange(() => {
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
  global.selectionSampling = () => debug.selectionSampling();
  global.resetSelectionSampling = () => debug.resetSelectionSampling();
  global.frameIntervalStats = () => debug.frameIntervalStats();
  global.resetFrameIntervalStats = () => debug.resetFrameIntervalStats();
  global.gridVertexCount = () => debug.gridVertexCount();
  global.gridSpacingLy = () => debug.gridSpacingLy();
  global.gridLevels = () => debug.gridLevels();
  global.selectionFlightMs = () => debug.selectionFlightMs();
  global.regionLinePositions = () => debug.regionLinePositions();
  global.regionLineChains = () => debug.regionLineChains();
  global.compileTestProgram = (vertex, fragment) =>
    debug.compileTestProgram(vertex, fragment);

  window.addEventListener('hashchange', () => {
    // The handler reads the fragment once and puts the whole of it in place before it
    // calls the map. Each set raises a change, and the writer may write the fragment on
    // that same turn. A write that runs part of the way through would put the page's own
    // old state back in the URL, and the next fragment the user gives could then match
    // the address the page already holds and raise no event at all.
    const fragment = window.location.hash;
    const grid = parseGridFragment(fragment);
    const next = parseViewFragment(fragment);
    pageView.cursor = next.cursor;
    pageView.distance = next.distance;
    pageView.yaw = next.yaw;
    pageView.pitch = next.pitch;
    // A fragment that names no readable `g` leaves the switch where it is.
    if (grid !== null) map.setGridVisible(grid);
    map.setView(next);
  });

  map.ready.then(
    () => {
      // `ready` settles after the start load, so a reader of the page sees the set that
      // is already there. The browser suite reads this event and then clears the set,
      // and a clear that ran first would leave the records on the map.
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
