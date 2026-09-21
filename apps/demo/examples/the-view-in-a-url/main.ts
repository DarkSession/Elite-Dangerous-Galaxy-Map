// The page this sample runs on. The three URL calls are pure, so the map above them is
// setup alone and the wiki shows the marked part.
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);
await map.ready;

// wiki:start
import { decodeView, encodeView } from '@elite-dangerous-almanac/galaxy-map';

const fragment = encodeView(map.getView());
const read = decodeView(fragment);
if (read !== null) map.setView(read);
// wiki:end

// The page owns the URL, so the page writes the fragment back into it.
window.history.replaceState(null, '', `#${fragment}`);
