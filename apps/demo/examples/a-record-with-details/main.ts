// The page this sample runs on. The wiki shows the marked part alone, because a reader
// of "A record with details" is reading the record and not the map around it.
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas, {
  hud: true,
  startView: { cursor: [570.4, 17.5, -68.6], distance: 120 },
});
map.addCategories([{ name: 'Landmark', color: [255, 255, 255] }]);

// wiki:start
import type { SystemRecordInput } from '@elite-dangerous-almanac/galaxy-map';

const beacon: SystemRecordInput = {
  name: 'HIP 36823',
  coords: { x: 570.4, y: 17.5, z: -68.6 },
  categories: ['Landmark'],
  primaryStar: 'A3 V',
  description:
    'A **Guardian beacon** points to a ruins site.\n\n' +
    '- Read [the survey](https://example.test/survey)',
  images: [{ url: '../../demo-images/ruins-site.svg', caption: 'The ruins site' }],
  icons: [
    'titan',
    { url: '../../demo-images/structure-site.svg', color: [255, 154, 60] },
  ],
};

map.addSystems([beacon]);
// wiki:end

await map.ready;
