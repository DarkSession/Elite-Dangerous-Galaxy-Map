// Frame path bench. Usage: node bench.mjs <port> [label]
// Serve a build first: vite preview --outDir <dir> --port <port> (base /Galaxy-Map/).
import { chromium } from '@playwright/test';

const port = process.argv[2] ?? '4190';
const label = process.argv[3] ?? '';
const base = `http://localhost:${port}/Galaxy-Map/`;
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

// Times every rAF callback: the JS the loop turn spends on the main thread.
const initScript = () => {
  const turns = [];
  window.__bench = { turns, on: false };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const s = performance.now();
      cb(t);
      if (window.__bench.on) turns.push(performance.now() - s);
    });
};

const stats = (a) => {
  if (a.length === 0) return { n: 0 };
  const s = [...a].sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: a.length, mean: +mean.toFixed(3), p50: +s[s.length >> 1].toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), sum: +(mean * a.length).toFixed(1) };
};

async function open(browser, { hud = true, demoData = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(initScript);
  await page.goto(base);
  await page.waitForFunction(() => window.__galaxyMap?.ready === true, undefined, { timeout: 60000 });
  await page.waitForFunction(() => window.__galaxyMap?.nebulaeAttached?.() === true, undefined, { timeout: 20000 });
  if (!hud) await page.evaluate(() => window.galaxyMap?.hud?.dispose());
  if (!demoData) await page.evaluate(() => { window.galaxyMap.clearSystemsAndCategories(); window.galaxyMap.setGridVisible(false); });
  await page.waitForTimeout(2000);
  return page;
}

const begin = (page) => page.evaluate(() => { window.__bench.turns.length = 0; window.__bench.on = true; window.__galaxyMap.resetFrameStats(); window.__galaxyMap.resetSelectionSampling?.(); });
const end = (page) => page.evaluate(() => { window.__bench.on = false; return { turns: [...window.__bench.turns], frames: window.__galaxyMap.frameStats(), sel: window.__galaxyMap.selectionSampling?.() }; });

async function heldKey(page, key, ms) {
  await page.mouse.move(960, 540);
  await begin(page);
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  const r = await end(page);
  // Settle: frames drawn after the release until the loop stops.
  await begin(page);
  await page.waitForTimeout(2000);
  const s = await end(page);
  return { move: { turn: stats(r.turns), render: r.frames }, settle: { turn: stats(s.turns), render: s.frames } };
}

async function hover(page, ms) {
  await page.waitForTimeout(1500);
  await begin(page);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    await page.mouse.move(700 + (i % 200) * 2, 400 + (i % 50));
    i += 1;
  }
  const r = await end(page);
  return { turn: stats(r.turns), render: r.frames, sel: r.sel };
}

async function gpu(page, views) {
  const out = {};
  for (const [name, v] of Object.entries(views)) {
    out[name] = await page.evaluate((v) => {
      window.galaxyMap.setView({ cursor: v.cursor, distance: v.distance, yaw: 0, pitch: 35 });
      return +window.__galaxyMap.measureFrames(200).toFixed(3);
    }, v);
  }
  return out;
}

async function addSpread(page, count, icons) {
  return page.evaluate(({ count, icons }) => {
    const map = window.galaxyMap;
    map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    let state = 4711;
    const unit = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
    const records = [];
    for (let i = 0; i < count; i += 1) {
      records.push({ name: `S${i}`, coords: { x: -49985 + unit() * 100000, y: -40985 + unit() * 81910, z: -24105 + unit() * 100000 }, categories: ['Empire'], ...(icons ? { icons: ['titan', 'mission', 'waypoint', 'bookmark'] } : {}) });
    }
    map.addSystems(records);
    return map.systemCount();
  }, { count, icons });
}

const browser = await chromium.launch({ args, headless: true });
const result = { label };
try {
  const SOL = [0, 0, 0];
  const views = { sol500: { cursor: SOL, distance: 500 }, sol4000: { cursor: SOL, distance: 4000 }, sol20000: { cursor: SOL, distance: 20000 }, default60000: { cursor: [0, 0, 25000], distance: 60000 } };

  // 1. The demo page as a user sees it: demo set, grid, HUD.
  let page = await open(browser);
  result.demoRenderer = await page.evaluate(() => window.__galaxyMap.renderer);
  // The numbers mean nothing on a software renderer, so the bench stops there.
  if (!result.demoRenderer || /SwiftShader|llvmpipe|software/i.test(String(result.demoRenderer))) {
    throw new Error(`The bench needs a hardware renderer. It got: ${result.demoRenderer}`);
  }
  await page.evaluate(() => window.galaxyMap.setView({ cursor: [0, 0, 0], distance: 4000, yaw: 0, pitch: 35 }));
  await page.waitForTimeout(1500);
  result.demo4000 = await heldKey(page, 'KeyD', 3000);
  result.demoHover = await hover(page, 3000);
  result.demoGpu = await gpu(page, views);
  await page.close();

  // 2. 50,000 systems with four icons each, no HUD.
  page = await open(browser, { hud: false, demoData: false });
  await addSpread(page, 50000, true);
  await page.evaluate(() => window.galaxyMap.setView({ cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 }));
  await page.waitForTimeout(1500);
  result.icons50k = await heldKey(page, 'KeyD', 3000);
  result.icons50kHover = await hover(page, 3000);
  result.icons50kGpu = await gpu(page, { sol20000: views.sol20000, default60000: views.default60000 });
  await page.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(result, null, 1));
