// The page this sample runs on. The wiki shows the four marked lines, which are the
// whole of what a host writes to ask for the nebulae.
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// wiki:start
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';
import { nebulae } from '@elite-dangerous-almanac/galaxy-map/nebulae';

const map = createGalaxyMap(canvas, { nebulae });
// wiki:end

await map.ready;
