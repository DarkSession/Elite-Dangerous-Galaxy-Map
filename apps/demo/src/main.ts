// The demo page: build the map, own the URL fragment, and expose the test hooks.
import { galaxyMapGlobal } from '@elite-dangerous-almanac/galaxy-map/testing';
import { nebulae } from '@elite-dangerous-almanac/galaxy-map/nebulae';
import {
  createFragmentWriter,
  createGalaxyMap,
  decodeGrid,
  decodeView,
} from '@elite-dangerous-almanac/galaxy-map';
import type {
  CategoryInput,
  DatasetContent,
  DatasetEntry,
  GalaxyMap,
  LineInput,
  MapView,
  SphereInput,
  SystemRecordInput,
} from '@elite-dangerous-almanac/galaxy-map';
import { fetchMultifactionRecords, MULTIFACTION_CATEGORIES } from './multifaction';

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
 * states three numbers. An icon colour of a record is the same case. The page therefore
 * casts both arrays through `unknown`. That is the point at which the file data enters,
 * and the reader still checks every field.
 */
function demoSet(file: { categories: unknown; systems: unknown }): DatasetContent {
  return {
    categories: file.categories as unknown as readonly CategoryInput[],
    systems: file.systems as readonly SystemRecordInput[],
  };
}

/** The shapes of one demo file, as the catalog listener adds them. */
interface DemoShapes {
  readonly spheres: readonly SphereInput[];
  readonly lines: readonly LineInput[];
}

/**
 * The shapes of each entry that carries them, held by entry id.
 *
 * `DatasetInfo` gives the listener the id of the entry and no content, so the listener
 * needs a way back to the shapes the file holds. Each `load()` writes this map before it
 * returns, and the listener reads the map in the same step it is called in. A listener
 * that imported the file itself would settle later, and a second load started in between
 * would already have cleared the shapes, so the first entry's route would draw over the
 * second entry's systems.
 */
const DEMO_SHAPES = new Map<string, DemoShapes>();

/**
 * Reads one demo file that holds shapes: it writes the shapes under the entry id and
 * gives back the two arrays the dataset reader takes.
 *
 * JSON holds no tuple, so the file types a position and a colour as `number[]`. The page
 * casts them through `unknown`, as it does the categories, and the shape set still checks
 * every field.
 */
function demoShapeSet(
  id: string,
  file: {
    categories: unknown;
    systems: readonly SystemRecordInput[];
    spheres: unknown;
    lines: unknown;
  },
): DatasetContent {
  DEMO_SHAPES.set(id, {
    spheres: file.spheres as unknown as readonly SphereInput[],
    lines: file.lines as unknown as readonly LineInput[],
  });
  return demoSet(file);
}

/**
 * The seven demo data sets, which `THIRD_PARTY_NOTICES.md` names. The page is a host
 * application, so it gives the map a catalog the way any other host does: each entry
 * carries the counts the committed file holds and a `load()` that imports it. The
 * library bundles no data and fetches none.
 *
 * The Guardian Ruins records name their thumbnails at
 * `https://ruins.canonn.tech/images/maps/`, so the browser loads those pictures from
 * Canonn when the user selects such a system. The other six sets name no picture.
 *
 * Three of the sets carry shapes as well as systems. Their `load()` writes the shapes
 * into `DEMO_SHAPES` before it gives the two arrays back, and the catalog listener
 * below adds them.
 *
 * The sixth set is the one that fetches its records. It shows a host reading its own
 * data: `load()` reads the Spansh factions dump over the network, and the library still
 * fetches nothing. Its spheres are a static list, so the build writes them into a file
 * the entry imports.
 *
 * The demo site build carries the seven files, so the dev server and the built site
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
      demoSet((await import('../demo-data/guardian-ruins.json')).default),
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
      demoSet((await import('../demo-data/guardian-structures.json')).default),
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
      demoSet((await import('../demo-data/notable-systems.json')).default),
  },
  {
    id: 'uia',
    label: 'UIA Map',
    collection: 'Canonn Research Group',
    region: 'Inner Orion Spur and the nebulae around it',
    description:
      'The UIA map of the Canonn Research Group. The lines trace the route of each ' +
      'anomaly and every hyperdiction a commander reported. The spheres mark the ' +
      'permit locked centres and the space the hyperdictions cover.',
    systemCount: 1116,
    load: async (): Promise<DatasetContent> =>
      demoShapeSet('uia', (await import('../demo-data/uia.json')).default),
  },
  {
    id: 'adamastor',
    label: 'Adamastor Routes',
    collection: 'Canonn Research Group',
    region: 'Inner Orion Spur and Colonia',
    description:
      'The routes the Canonn Research Group records for the Adamastor, as one line per ' +
      'route and one category per subject.',
    systemCount: 8,
    load: async (): Promise<DatasetContent> =>
      demoShapeSet('adamastor', (await import('../demo-data/adamastor.json')).default),
  },
  {
    id: 'multifaction',
    label: 'Canonn Factions',
    collection: 'Canonn Research Group',
    region: 'The bubble and the Colonia region',
    description:
      'The systems the Canonn and the Canonn Deep Space Research factions hold, read ' +
      'from the Spansh factions dump when you load the set. The spheres mark the ' +
      'permit locked and permit unlocked sectors.',
    // The entry carries no count, because it reads the records when the user loads it.
    // The dialog shows `FETCHED ON LOAD` in place of a count.
    load: async (): Promise<DatasetContent> => {
      // The records come first: a failed fetch then leaves the shape map untouched, and
      // the map keeps the set it had.
      const systems = await fetchMultifactionRecords();
      const spheres = (await import('../demo-data/multifaction-spheres.json')).default;
      DEMO_SHAPES.set('multifaction', {
        spheres: spheres.spheres as unknown as readonly SphereInput[],
        lines: [],
      });
      return {
        categories: [
          ...MULTIFACTION_CATEGORIES,
          ...(spheres.categories as unknown as readonly CategoryInput[]),
        ],
        systems,
      };
    },
  },
  {
    id: 'thargoid-war',
    label: 'Thargoid War Cycle 2',
    collection: 'DCoH Overwatch archive',
    region: 'The bubble, from the Hyades to Col 285 Sector',
    description:
      'The systems of cycle 2 of the Thargoid war, the week of 2022-12-08, with one ' +
      'category per war state. The icons mark the five maelstroms, the invasions and ' +
      'the alerts.',
    systemCount: 189,
    load: async (): Promise<DatasetContent> =>
      demoSet((await import('../demo-data/thargoid-war.json')).default),
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
    // The page gives the map the seven demo sets and asks for the Guardian Ruins at
    // start. The Canonn Factions set fetches its records, so the page fetches nothing
    // until the user asks for that set. The HUD then shows the dataset field and the dataset
    // library dialog.
    datasets: DEMO_DATASETS,
    dataset: 'guardian-ruins',
    // The nebulae are a source a host asks for by name. The demo site draws them, so
    // it imports the source and passes it here. A host that gives no source builds a
    // map that holds no nebula code and downloads no nebula file.
    nebulae,
    // The demo site starts with the coordinate grid on, unless the fragment says `g=0`.
    // That is this page's own option: a host that gives no `grid` still gets no grid.
    grid: decodeGrid(window.location.hash) !== false,
    // The demo page is a host application, so it turns the HUD on the way any other
    // host does.
    hud: {
      // The loader the panel calls when the user opens it. It gives everything the panel
      // shows about one system: the description, the extra values and the footer
      // buttons. The demo page holds its descriptions in the dataset, so the loader
      // passes the record's own text on and adds one value, a body that draws as its own
      // section, and one button. A host that keeps its text in a second store fetches it
      // here instead, and passes the signal to `fetch`.
      //
      // The loader gives no field for the grid. The panel already draws the categories
      // as chips, so a grid field that named the primary category would draw the same
      // fact twice. `e2e/info-panel.spec.ts` covers a grid value on a map of its own.
      details: (system) => ({
        description:
          system.description ?? '*The dataset holds no survey text for this system.*',
        actions: [
          {
            label: 'LOG RECORD',
            onSelect: (record) => {
              console.info('The demo action read a system.', record);
            },
          },
        ],
        values: [
          {
            label: 'ABOUT THIS TEXT',
            markdown:
              'The demo page loads this section with the `details` option. The panel ' +
              'draws it in the Markdown subset, which holds:\n\n' +
              '- **bold**, *italic* and `code`\n' +
              '- bullet lists and numbered lists\n' +
              '- links, which open in a tab of their own',
          },
        ],
      }),
    },
  });
  // The shapes of the set that loads. `loadDataset` writes the systems and clears the
  // shapes, and it raises the listeners after that write, so the listener adds the
  // shapes of the entry it is given. It reads the map in this same step and waits for
  // nothing, so a second load started in between cannot leave the first entry's shapes
  // on the second entry's systems.
  map.onDatasetChange((entry) => {
    if (entry === null) return;
    const held = DEMO_SHAPES.get(entry.id);
    if (held === undefined) return;
    map.addSpheres(held.spheres);
    map.addLines(held.lines);
  });

  window.galaxyMap = map;
  // The entry point itself, so a browser test can build a second map with a canvas of
  // its own and check what the library makes when the host gives no options.
  window.galaxyMapFactory = createGalaxyMap;
  // The nebula source, so a browser test can build one map with the nebulae and one
  // without them on the same page.
  window.galaxyMapNebulae = nebulae;

  // The page parses the fragment, gives the view to the handle, and writes it back.
  //
  // This write beats the `startView` option, because it comes after the map is built. The
  // demo page names no `startView` and owns its view through the URL, so a reader who
  // expects the option to win here finds the fragment instead. A host that wants the
  // option to hold must not write the view after the build.
  map.setView(decodeView(window.location.hash));
  // The writer formats the object it was given at every write, so the page keeps this
  // one current from the handle's own view changes.
  const pageView: MapView = map.getView();
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
  global.setNebulaOcclusion = (value) => debug.setNebulaOcclusion(value);
  global.setNebulaOrderReversed = (value) => debug.setNebulaOrderReversed(value);
  global.starVertexCount = () => debug.starVertexCount();
  global.starDrawnCount = () => debug.starDrawnCount();
  global.starSuppressedCount = () => debug.starSuppressedCount();
  global.systemMarkerCount = () => debug.systemMarkerCount();
  global.nebulaDrawnCount = () => debug.nebulaDrawnCount();
  global.nebulaDrawCalls = () => debug.nebulaDrawCalls();
  global.nebulaAboveFloorCount = () => debug.nebulaAboveFloorCount();
  global.nebulaCoveredArea = () => debug.nebulaCoveredArea();
  global.nebulaeAttached = () => debug.nebulaeAttached();
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
  global.zoomTargetLy = () => debug.zoomTargetLy();
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
    const grid = decodeGrid(fragment);
    const next = decodeView(fragment);
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
