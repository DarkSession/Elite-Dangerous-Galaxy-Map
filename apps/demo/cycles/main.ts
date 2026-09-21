// The cycles page: every cycle of the Thargoid war, as one dataset entry each. The page
// is a host application, so it gives the map a catalog the way any other host does. The
// library bundles no data and fetches none.
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';
import type {
  CategoryInput,
  DatasetContent,
  DatasetEntry,
  GalaxyMap,
  SystemRecordInput,
} from '@elite-dangerous-almanac/galaxy-map';

/**
 * The manifest the cycle build writes: one row per cycle, in cycle order. The page reads
 * it with a dynamic import, as it reads a cycle, because a static reach out of the page
 * directory resolves only on the dev server.
 */
const manifest = (await import('../demo-data/cycles/index.json')).default;

// A page with no cycle has no catalog and no start entry, so it says what is missing
// rather than build a map of nothing.
if (manifest.length === 0) {
  throw new Error('The cycles page found no cycle in apps/demo/demo-data/cycles/.');
}

/**
 * Reads one cycle file into the two arrays the map takes.
 *
 * JSON holds no tuple, so the file types a category colour as `number[]` while
 * `CategoryInput` states three numbers. The page therefore casts the array through
 * `unknown`, as the demo page does, and the reader still checks every field.
 */
function cycleSet(file: { categories: unknown; systems: unknown }): DatasetContent {
  return {
    categories: file.categories as unknown as readonly CategoryInput[],
    systems: file.systems as readonly SystemRecordInput[],
  };
}

/**
 * The catalog: one entry for each cycle the build wrote, in the order of the manifest,
 * which is cycle order. `apps/demo/scripts/build-cycle-sets.mjs` writes the manifest and
 * the files beside it.
 *
 * Each entry names the box of its own records, because one cycle holds the bubble alone.
 * A switch to another cycle replaces the records and opens the camera on the new box.
 * `load()` imports the one file of that cycle, so the browser downloads one week at a
 * time and not the whole war.
 */
const CYCLES: readonly DatasetEntry[] = manifest.map((row): DatasetEntry => ({
  id: `cycle-${row.cycle}`,
  label: row.label,
  collection: row.group,
  description: row.description,
  systemCount: row.count,
  bounds: { mode: 'auto' },
  view: { fit: 'systems' },
  load: async (): Promise<DatasetContent> => {
    const file = String(row.cycle).padStart(3, '0');
    return cycleSet((await import(`../demo-data/cycles/${file}.json`)).default);
  },
}));

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas, {
  // The HUD holds the dataset library dialog, which is how the user steps from one week
  // to the next.
  hud: true,
  datasets: CYCLES,
  dataset: CYCLES[0].id,
});

// The handle, so the browser suite can read the records and the view of the page. The
// member is typed here, in the page that writes it, and not in the suite that reads it.
(window as Window & { galaxyMap?: GalaxyMap }).galaxyMap = map;

await map.ready;
