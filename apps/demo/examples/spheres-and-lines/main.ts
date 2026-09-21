// The page this sample runs on. A line point names a system, so the map holds the two
// records the marked part draws its route between.
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas, {
  startView: { cursor: [0, 0, 0], distance: 900, pitch: -25 },
});
map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
map.addSystems([
  { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, categories: ['Empire'] },
  {
    name: 'Achenar',
    coords: { x: 67.5, y: -119.46, z: 24.84 },
    categories: ['Empire'],
  },
]);

// wiki:start
import type { LineInput, SphereInput } from '@elite-dangerous-almanac/galaxy-map';

const zones: SphereInput[] = [
  { name: 'Permit zone', position: [0, 0, 0], radius: 200, categories: ['Empire'] },
];

const routes: LineInput[] = [
  {
    name: 'Route',
    points: [{ system: 'Sol' }, [500, 0, -200], { system: 'Achenar' }],
    width: 2,
    color: [255, 176, 0],
  },
];

map.addSpheres(zones);
map.addLines(routes);
// wiki:end

await map.ready;
