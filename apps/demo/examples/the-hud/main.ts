// The page this sample runs on. The import sits inside the marked part, so the block the
// wiki shows is a block a reader can copy whole.
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// wiki:start
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const map = createGalaxyMap(canvas, {
  grid: true,
  systemNames: true,
  hud: {
    title: 'GALACTIC CARTOGRAPHICS',
    infoFields: { region: false },
    lockedOptions: ['grid'],
    details: async (system) => ({
      description: `The host wrote this panel for ${system.name}.`,
      values: [{ label: 'FACTION', value: 'Federation', copy: 'Federation' }],
      actions: [{ label: 'LOG RECORD', onSelect: (record) => console.log(record) }],
    }),
  },
});
// wiki:end

map.addCategories([{ name: 'Federation', color: [255, 140, 60] }]);
map.addSystems([
  { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, categories: ['Federation'] },
  {
    name: 'Alpha Centauri',
    coords: { x: 3.03, y: -0.09, z: 3.15 },
    categories: ['Federation'],
  },
]);

await map.ready;
