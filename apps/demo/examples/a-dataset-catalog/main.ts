// The page this sample runs on. The catalog holds two small sets the file carries
// itself, so `load()` reads no file and the library still fetches nothing.
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// wiki:start
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';
import type { DatasetContent } from '@elite-dangerous-almanac/galaxy-map';

const RUINS: DatasetContent = {
  categories: [{ name: 'Ruins', color: [255, 154, 60] }],
  systems: [
    {
      name: 'Guardian Ruins',
      coords: { x: 675, y: -47, z: -332 },
      categories: ['Ruins'],
    },
  ],
};

const BEACONS: DatasetContent = {
  categories: [{ name: 'Beacon', color: [153, 230, 255] }],
  systems: [
    {
      name: 'HIP 36823',
      coords: { x: 570.4, y: 17.5, z: -68.6 },
      categories: ['Beacon'],
    },
  ],
};

const map = createGalaxyMap(canvas, {
  // `datasetArrows` draws a previous and a next arrow around the dataset field, with an
  // `i / n` counter. Each arrow loads the entry beside the loaded one in catalog order.
  hud: { datasetArrows: true },
  dataset: 'ruins',
  datasets: [
    {
      id: 'ruins',
      label: 'Guardian Ruins',
      collection: 'Canonn Research Group',
      view: { fit: 'systems' },
      load: async () => RUINS,
    },
    {
      id: 'beacons',
      label: 'Guardian Beacons',
      collection: 'Canonn Research Group',
      view: { fit: 'systems' },
      load: async () => BEACONS,
    },
  ],
});
// wiki:end

await map.ready;
