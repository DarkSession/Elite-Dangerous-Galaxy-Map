// The page this sample runs on. The camera opens on Sol and flies to Achenar, so the
// block holds the two records the two names resolve against.
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// wiki:start
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const map = createGalaxyMap(canvas, {
  bounds: { mode: 'sphere', centre: [0, 0, 0], radiusLy: 1000 },
  startView: { system: 'Sol', distance: 300, pitch: -20 },
  interaction: { select: false },
});

map.addCategories([{ name: 'Landmark', color: [255, 255, 255] }]);
map.addSystems([
  { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, categories: ['Landmark'] },
  {
    name: 'Achenar',
    coords: { x: 67.5, y: -119.46, z: 24.84 },
    categories: ['Landmark'],
  },
]);

const end = await map.flyTo({ system: 'Achenar', distance: 200 });
// 'landed', or 'interrupted' where a user input or a second flight cut it short
// wiki:end

console.log(end);
