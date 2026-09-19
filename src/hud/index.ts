// The HUD builder. It takes the map handle and the options, and returns the HUD handle.
//
// The HUD reaches the map through the public handle alone. It imports no renderer, no
// scene data and no camera module, and it reads no private member, so a host can build
// the same panels from the same public members. ESLint holds that boundary.
import type { GalaxyMap } from '../app/create-map';
import { createCategoryPanel } from './categories';
import { createDatasetDialog } from './dataset-dialog';
import { make } from './dom';
import { createInfoPanel } from './info-panel';
import { createLightbox } from './lightbox';
import { createOptionsPanel, readLockedOptions } from './options-panel';
import { addHudStyles } from './styles';
import { createTopBar, DEFAULT_TITLE } from './top-bar';
import type { HudHandle, HudOptions } from './types';

export type { HudAction } from './details';
export type { HudHandle, HudOptions } from './types';

/** How often the HUD rewrites what follows the view, in milliseconds. */
export const UPDATE_INTERVAL_MS = 100;

/**
 * Builds the HUD in `host` and returns its handle. The caller gives the host: the map
 * uses the canvas's parent when the options name none.
 */
export function createHud(
  map: GalaxyMap,
  host: HTMLElement | null,
  options: HudOptions = {},
): HudHandle {
  const doc = host?.ownerDocument ?? document;
  addHudStyles(doc);

  const element = make(doc, 'div', 'gm-hud');
  const lightbox = createLightbox(doc);
  const topBar = createTopBar(doc, map, options.title ?? DEFAULT_TITLE);
  // The dialog is there only when the top bar built the dataset field, which it does
  // only when the catalog holds an entry.
  const datasetDialog =
    topBar.dataset === null ? null : createDatasetDialog(doc, map, topBar.dataset);
  topBar.dataset?.button.addEventListener('click', () => {
    datasetDialog?.open(topBar.dataset?.button ?? null);
  });
  const categories = createCategoryPanel(doc, map);
  // The panel is null where every switch it would hold is locked. The count is not
  // fixed: a map with no nebula source holds four switches and a map with one holds
  // five.
  const optionsPanel = createOptionsPanel(
    doc,
    map,
    readLockedOptions(options.lockedOptions),
  );
  const info = createInfoPanel(doc, map, options, lightbox);

  const left = make(doc, 'div', 'gm-hud__left');
  left.appendChild(categories.element);
  if (optionsPanel !== null) left.appendChild(optionsPanel.element);
  element.append(topBar.element, left, info.element, lightbox.element);
  if (datasetDialog !== null) element.appendChild(datasetDialog.element);

  // A wheel or a drag that lands on a panel belongs to the panel. The map's controls
  // listen on the canvas, which is not a parent of the HUD, so this stops a host that
  // put both under one listener from seeing the event twice.
  const stop = (event: Event): void => event.stopPropagation();
  element.addEventListener('wheel', stop);
  element.addEventListener('pointerdown', stop);

  const onKeyDown = (event: KeyboardEvent): void => {
    // The HUD acts on Escape alone and lets every other key through, so a form field
    // the host owns keeps its keys.
    if (event.key !== 'Escape') return;
    // The key unwinds one step at a time: the dialog, then the lightbox, then the
    // selection. The dialog is first because it covers what is under it.
    if (datasetDialog?.isOpen() === true) {
      datasetDialog.close();
      return;
    }
    if (lightbox.isOpen()) {
      lightbox.close();
      return;
    }
    if (map.getSelection() !== null) map.setSelection(null);
  };
  doc.addEventListener('keydown', onKeyDown);

  let viewChanged = true;
  const stopViewListener = map.onViewChange(() => {
    viewChanged = true;
  });
  const stopSelectionListener = map.onSelectionChange(() => {
    info.rebuild();
    categories.update();
  });

  const tick = (): void => {
    if (viewChanged) {
      viewChanged = false;
      topBar.update();
      info.update();
    }
    categories.poll();
    optionsPanel?.update();
  };
  const timer = window.setInterval(tick, UPDATE_INTERVAL_MS);

  const refresh = (): void => {
    topBar.update();
    topBar.dataset?.update();
    categories.rebuild();
    optionsPanel?.update();
    info.rebuild();
  };

  host?.appendChild(element);
  refresh();

  return {
    element,
    refresh,
    dispose(): void {
      clearInterval(timer);
      doc.removeEventListener('keydown', onKeyDown);
      stopViewListener();
      stopSelectionListener();
      categories.dispose();
      datasetDialog?.dispose();
      info.dispose();
      element.remove();
    },
  };
}
