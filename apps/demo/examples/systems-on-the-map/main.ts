import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);

map.addCategories([
  { name: 'Empire', color: [153, 230, 255], description: 'Imperial space' },
  { name: 'Federation', color: [255, 140, 60], markerStyle: 'disc' },
  { name: 'Landmark', color: [255, 255, 255], maxDrawRange: 5000 },
]);

const report = map.addSystems([
  { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, categories: ['Federation'] },
  {
    name: 'Achenar',
    coords: { x: 67.5, y: -119.46, z: 24.84 },
    categories: ['Empire'],
  },
]);
console.log(report.added, report.replaced, report.rejected.length);

await map.ready;
