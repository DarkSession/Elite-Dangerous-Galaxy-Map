// A second origin for the icon tests.
//
// The library loads every icon vector as an image whose `crossOrigin` is `anonymous`,
// which `system-icons` states, so a vector on another origin draws only where the
// response carries `Access-Control-Allow-Origin`. The demo site cannot test that: a
// fixture it serves itself is same-origin and takes neither branch.
//
// This server is that second origin. A port of its own makes the origin different
// whatever the host name is. It answers three routes:
//
// - `/cors/<name>.svg` — the vector, with `Access-Control-Allow-Origin: *`
// - `/no-cors/<name>.svg` — the same vector, with no such header
// - `/requests` — the number of requests it answered for each path, as JSON
//
// `<name>` is free text, so a test that needs a URL the browser cache has not seen asks
// for one of its own.
import { createServer } from 'node:http';

/** The port the suite starts this server on. `playwright.config.ts` holds the same. */
const PORT = 4174;

/**
 * The vector. It is one magenta square on nothing, because the occlusion tests count the
 * pixels of a known glyph colour inside the icon box: the plate under a glyph is black,
 * and a black reading also passes where no icon drew at all.
 */
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" ' +
  'height="28"><rect x="2" y="2" width="24" height="24" fill="#FF00FF"/></svg>';

/** How many requests each path has answered. */
const requests = new Map();

const server = createServer((request, response) => {
  const path = (request.url ?? '/').split('?')[0];
  requests.set(path, (requests.get(path) ?? 0) + 1);

  if (path === '/requests') {
    const body = JSON.stringify(Object.fromEntries(requests));
    response.writeHead(200, {
      'Content-Type': 'application/json',
      // The page reads this count through `fetch`, and the page is on the first origin.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    response.end(body);
    return;
  }

  const cors = path.startsWith('/cors/');
  if ((cors || path.startsWith('/no-cors/')) && path.endsWith('.svg')) {
    const headers = {
      'Content-Type': 'image/svg+xml',
      // No store, so a second test that asks for the same path reaches this server and
      // the request count answers for the loads and not for the cache.
      'Cache-Control': 'no-store',
    };
    if (cors) headers['Access-Control-Allow-Origin'] = '*';
    response.writeHead(200, headers);
    response.end(ICON_SVG);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.end('no such route');
});

server.listen(PORT, () => {
  console.log(`the icon origin server listens on http://localhost:${PORT}/`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
