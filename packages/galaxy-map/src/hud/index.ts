// The HUD builder. It takes the map handle and the options, and returns the HUD handle.
//
// The HUD reaches the map through the public handle alone. It imports no renderer, no
// scene data and no camera module, and it reads no private member, so a host can build
// the same panels from the same public members. ESLint holds that boundary.
import type { GalaxyMap } from '../app/create-map';
import { createCategoryPanel } from './categories';
import { createDatasetDialog } from './dataset-dialog';
import { make, makeButton, setAttribute, setText } from './dom';
import { createInfoPanel } from './info-panel';
import { createLightbox } from './lightbox';
import { createOptionsPanel, readLockedOptions } from './options-panel';
import { addHudStyles } from './styles';
import { createTopBar, DEFAULT_TITLE, readDatasetArrows } from './top-bar';
import type { HudHandle, HudOptions } from './types';

export type { HudAction } from './details';
export type { HudHandle, HudOptions } from './types';

/** How often the HUD rewrites what follows the view, in milliseconds. */
export const UPDATE_INTERVAL_MS = 100;

/** Which drawer the narrow layout holds open. */
type PanelSide = 'left' | 'right';

/**
 * Builds one edge tab of the narrow layout. The tab is built at every width, and the
 * style sheet draws it below the breakpoint alone, so the script reads the layout from
 * the tab rather than from a width of its own.
 */
function makeDrawerTab(
  doc: Document,
  side: PanelSide,
  text: string,
): { readonly button: HTMLButtonElement; readonly label: HTMLElement } {
  const button = makeButton(doc, `gm-hud__drawer-tab gm-hud__drawer-tab--${side}`);
  button.setAttribute('aria-expanded', 'false');
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gm-hud__drawer-tab-chevron');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'square');
  svg.setAttribute('aria-hidden', 'true');
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  // The chevron points away from its own edge while the drawer is shut. The style
  // sheet turns it 180 degrees while the drawer is open.
  line.setAttribute('points', side === 'left' ? '5,3 11,8 5,13' : '11,3 5,8 11,13');
  svg.appendChild(line);
  const label = make(doc, 'span', 'gm-hud__drawer-tab-label');
  label.textContent = text;
  button.append(svg, label);
  return { button, label };
}

/** Builds the placeholder the right drawer shows while nothing is selected. */
function makeRightEmpty(
  doc: Document,
  onClose: () => void,
): { readonly element: HTMLElement; readonly close: HTMLButtonElement } {
  const element = make(doc, 'div', 'gm-hud__right-empty');
  const header = make(doc, 'div', 'gm-hud__panel-header');
  const title = make(doc, 'h2', 'gm-hud__panel-title');
  title.textContent = 'SYSTEM DATA';
  // The button takes a class of its own, not the information panel's, so a locator
  // that reads `gm-hud__info-close` still reads one element.
  const close = makeButton(doc, 'gm-hud__right-empty-close');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close the system panel');
  close.addEventListener('click', onClose);
  header.append(title, close);
  const body = make(doc, 'div', 'gm-hud__right-empty-body');
  const mark = make(doc, 'span', 'gm-hud__right-empty-mark');
  mark.setAttribute('aria-hidden', 'true');
  const text = make(doc, 'p', 'gm-hud__right-empty-text');
  text.append('NO SYSTEM SELECTED', doc.createElement('br'), 'TAP A MARKER ON THE MAP');
  body.append(mark, text);
  element.append(header, body);
  return { element, close };
}

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
  const topBar = createTopBar(
    doc,
    map,
    options.title ?? DEFAULT_TITLE,
    readDatasetArrows(options.datasetArrows),
  );
  // The dialog is there only when the top bar built the dataset field, which it does
  // only when the catalog holds an entry.
  const datasetDialog =
    topBar.dataset === null ? null : createDatasetDialog(doc, map, topBar.dataset);
  topBar.dataset?.button.addEventListener('click', () => {
    datasetDialog?.open(topBar.dataset?.button ?? null);
  });
  const categories = createCategoryPanel(doc, map);
  // The panel is null where every switch it would hold is locked. The count is not
  // fixed: a map with no nebula source holds five switches and a map with one holds
  // six.
  const optionsPanel = createOptionsPanel(
    doc,
    map,
    readLockedOptions(options.lockedOptions),
  );
  const info = createInfoPanel(doc, map, options, lightbox);

  const left = make(doc, 'div', 'gm-hud__left');
  left.appendChild(categories.element);
  if (optionsPanel !== null) left.appendChild(optionsPanel.element);

  // The narrow layout. The three elements below are built at every width and the style
  // sheet hides them above the breakpoint, so the layout lives in the sheet alone.
  const scrim = make(doc, 'div', 'gm-hud__scrim');
  const leftTab = makeDrawerTab(doc, 'left', 'FILTERS');
  const rightTab = makeDrawerTab(doc, 'right', 'DATA');

  /**
   * True while the narrow layout is in force. The reading is the media query's own
   * answer, taken from the document: the left tab is `display: none` above the
   * breakpoint. The script therefore names no width and calls no `matchMedia`.
   */
  const narrow = (): boolean =>
    typeof leftTab.button.checkVisibility === 'function'
      ? leftTab.button.checkVisibility()
      : leftTab.button.offsetParent !== null;

  /**
   * Which drawer is open. It reads closed while the narrow layout is not in force,
   * whatever the attribute holds, so a drawer left open by a phone that turned to
   * landscape swallows no key.
   */
  const openPanel = (): PanelSide | null => {
    if (!narrow()) return null;
    const held = element.dataset['panel'];
    return held === 'left' || held === 'right' ? held : null;
  };

  /** Opens one drawer, or closes both. The write needs the narrow layout; the clear does not. */
  const setPanel = (side: PanelSide | null): void => {
    if (side === null) delete element.dataset['panel'];
    else if (narrow()) element.dataset['panel'] = side;
    const open = openPanel();
    setAttribute(leftTab.button, 'aria-expanded', open === 'left' ? 'true' : 'false');
    setAttribute(rightTab.button, 'aria-expanded', open === 'right' ? 'true' : 'false');
  };

  const onLeftTab = (): void => {
    setPanel(openPanel() === 'left' ? null : 'left');
  };
  const onRightTab = (): void => {
    setPanel(openPanel() === 'right' ? null : 'right');
  };
  const onScrim = (): void => {
    setPanel(null);
  };
  leftTab.button.addEventListener('click', onLeftTab);
  rightTab.button.addEventListener('click', onRightTab);
  scrim.addEventListener('click', onScrim);

  // The wrapper holds the information panel and the placeholder. It is
  // `display: contents` above the breakpoint, so the wide layout lays out as it did.
  const right = make(doc, 'div', 'gm-hud__right');
  const rightEmpty = makeRightEmpty(doc, onScrim);
  right.append(info.element, rightEmpty.element);

  element.append(
    topBar.element,
    scrim,
    left,
    right,
    leftTab.button,
    rightTab.button,
    lightbox.element,
  );
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
    // drawer, then the selection. The dialog is first because it covers what is under
    // it, and the drawer comes before the selection because the drawer covers the map.
    if (datasetDialog?.isOpen() === true) {
      datasetDialog.close();
      return;
    }
    if (lightbox.isOpen()) {
      lightbox.close();
      return;
    }
    // `openPanel` reads closed while the narrow layout is not in force, so this step
    // never fires above the breakpoint and the wide layout keeps its four steps.
    if (openPanel() !== null) {
      setPanel(null);
      return;
    }
    if (map.getSelection() !== null) map.setSelection(null);
  };
  doc.addEventListener('keydown', onKeyDown);

  let viewChanged = true;
  const stopViewListener = map.onViewChange(() => {
    viewChanged = true;
  });
  const stopSelectionListener = map.onSelectionChange((system) => {
    info.rebuild();
    categories.update();
    setText(rightTab.label, system === null ? 'DATA' : 'SYSTEM');
    // Any selection opens the right drawer, whether a tap on a marker or a click on a
    // row of a category list made it. Clearing one leaves the drawer on the
    // placeholder. Above the breakpoint `setPanel` writes nothing.
    if (system !== null) setPanel('right');
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
    setText(rightTab.label, map.getSelection() === null ? 'DATA' : 'SYSTEM');
  };

  host?.appendChild(element);
  refresh();

  return {
    element,
    refresh,
    categoryCountMs(): number {
      return categories.countPassMs();
    },
    dispose(): void {
      clearInterval(timer);
      doc.removeEventListener('keydown', onKeyDown);
      leftTab.button.removeEventListener('click', onLeftTab);
      rightTab.button.removeEventListener('click', onRightTab);
      scrim.removeEventListener('click', onScrim);
      rightEmpty.close.removeEventListener('click', onScrim);
      stopViewListener();
      stopSelectionListener();
      categories.dispose();
      // The box holds a resize listener on the window while it is open.
      lightbox.close();
      datasetDialog?.dispose();
      info.dispose();
      element.remove();
    },
  };
}
