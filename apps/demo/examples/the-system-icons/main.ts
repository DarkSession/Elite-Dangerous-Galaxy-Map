// The page this sample runs on. The wiki shows the marked part alone, because a reader
// of "The system icons" is reading the icon list and not the map around it.
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas, {
  startView: { cursor: [570.4, 17.5, -68.6], distance: 120 },
});
map.addCategories([{ name: 'Beacon', color: [255, 154, 60] }]);

// wiki:start
import type { SystemIconInput } from '@elite-dangerous-almanac/galaxy-map';

const icons: SystemIconInput[] = [
  'titan',
  'mission',
  { url: '../../demo-images/ruins-site.svg', color: [255, 154, 60] },
];

map.addSystems([
  {
    name: 'HIP 36823',
    coords: { x: 570.4, y: 17.5, z: -68.6 },
    categories: ['Beacon'],
    icons,
  },
]);
// wiki:end

await map.ready;
