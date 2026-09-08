// Starts the map: check the card, load the scene data, wire the controls, draw.
import { attachControls } from '../camera/controls';
import { planePoint, project } from '../camera/projection';
import { normaliseView } from '../camera/view';
import type { View } from '../camera/view';
import { createRenderContext } from '../render/context';
import { galaxyMapGlobal } from '../render/global';
import { createProgram } from '../render/program';
import { createRenderer } from '../render/renderer';
import { loadSceneData } from '../scene-data/load';
import { createFragmentWriter, parseViewFragment } from './url-view';

/** The event the page sends once the scene data is drawn for the first time. */
export const READY_EVENT = 'galaxy-map-ready';

const canvas = document.getElementById('map');
const messageBox = document.getElementById('message');

function showMessage(text: string): void {
  if (messageBox === null) return;
  messageBox.textContent = text;
  messageBox.hidden = false;
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function start(target: HTMLCanvasElement): Promise<void> {
  const global = galaxyMapGlobal();
  const context = createRenderContext(target);
  if (context.gl === null) {
    showMessage(context.error ?? 'The map cannot start.');
    return;
  }
  const gl = context.gl;

  // The workers run while the main thread compiles the programs.
  const sceneDataPromise = loadSceneData();

  await nextFrame();
  const renderer = createRenderer(gl, target);
  renderer.resize();

  const view: View = normaliseView(parseViewFragment(window.location.hash));
  const writer = createFragmentWriter(view);
  const controls = attachControls(target, view, { onChange: () => writer.schedule() });

  global.getView = () => ({
    cursor: [view.cursor[0], view.cursor[1], view.cursor[2]],
    distance: view.distance,
    yaw: view.yaw,
    pitch: view.pitch,
  });
  global.setView = (next) => {
    if (next.cursor !== undefined) view.cursor = [...next.cursor];
    if (next.distance !== undefined) view.distance = next.distance;
    if (next.yaw !== undefined) view.yaw = next.yaw;
    if (next.pitch !== undefined) view.pitch = next.pitch;
    normaliseView(view);
    writer.schedule();
  };
  global.project = (point) => {
    const screen = project(view, point, renderer.viewport());
    return { x: screen.x, y: screen.y };
  };
  global.setPasses = (next) => renderer.setPasses(next);
  global.drawingBufferSize = () => renderer.drawingBufferSize();
  global.readPixel = (x, y) => renderer.readPixel(x, y);
  global.measureFrames = (count) => renderer.measureFrames(view, count);
  global.drawNow = () => renderer.render(view);
  global.planePointAt = (x, y) =>
    planePoint(view, { x, y }, renderer.viewport(), view.cursor[1]);
  global.compileTestProgram = (vertex, fragment) => {
    try {
      const probe = createProgram(gl, 'probe', vertex, fragment);
      gl.deleteProgram(probe.program);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  const scene = await sceneDataPromise;

  // Each upload gets its own animation frame, so no single task runs long.
  await nextFrame();
  renderer.setVolume(scene.volume);

  await nextFrame();
  renderer.setPointCloud(scene.pointCloud);

  await nextFrame();
  renderer.setDetail(scene.detail);

  await nextFrame();
  renderer.render(view);
  global.ready = true;
  window.dispatchEvent(new Event(READY_EVENT));

  let previous = performance.now();
  const loop = (now: number): void => {
    const seconds = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    controls.update(seconds);
    renderer.render(view);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('hashchange', () => {
    const next = parseViewFragment(window.location.hash);
    view.cursor = next.cursor;
    view.distance = next.distance;
    view.yaw = next.yaw;
    view.pitch = next.pitch;
  });
}

if (!(canvas instanceof HTMLCanvasElement)) {
  showMessage('The page has no canvas with the id "map".');
} else {
  void start(canvas).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    galaxyMapGlobal().error = text;
    showMessage(`The map could not start: ${text}`);
  });
}
