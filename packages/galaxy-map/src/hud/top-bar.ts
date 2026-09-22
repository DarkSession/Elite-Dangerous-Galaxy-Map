// The top bar: the title and the region under the cursor on the left, the dataset field
// in the centre, and the zoom distance and the reset view button on the right.
//
// The two side groups take an even share of the space the centre group leaves, so the
// field sits at the middle of the bar's own width. A side group whose text is too long
// clips it with an ellipsis rather than push the field off centre.
import type { DatasetInfo, GalaxyMap } from '../app/create-map';
import {
  focusOn,
  formatLightYears,
  make,
  makeButton,
  makeSvg,
  setAttribute,
  setText,
} from './dom';

/** The view the reset button sets, which `map-navigation` gives as the default view. */
const DEFAULT_VIEW = {
  cursor: [0, 0, 0] as [number, number, number],
  distance: 60000,
  yaw: 0,
  pitch: 35,
};

/** The title the bar shows when the options name none. */
export const DEFAULT_TITLE = 'GALACTIC CARTOGRAPHICS';

/** The dataset field of the top bar. The bar builds it only with a catalog. */
export interface DatasetField {
  /** The button the user clicks to open the dataset dialog. */
  readonly button: HTMLButtonElement;
  /** Writes the loaded dataset's label, the loading state and the step arrows. */
  update(): void;
  /** The id of the entry a load is running for, or null while none runs. */
  loadingId(): string | null;
  /**
   * Starts the load of one entry and gives a promise that settles when the load does.
   * It gives null, and starts nothing, where a load is already running or where the
   * entry is the one the map already holds.
   *
   * The promise never rejects: a rejected load writes a warning to the console and
   * settles the promise, so a caller that closes on the answer closes either way.
   */
  requestLoad(id: string): Promise<void> | null;
}

/** The top bar of the HUD. */
export interface TopBar {
  readonly element: HTMLElement;
  /**
   * Rewrites the region name and the zoom from the view. The caller runs it at most 10
   * times a second, and each write happens only when the text changed.
   */
  update(): void;
  /** The dataset field, or null when the catalog holds no entry. */
  readonly dataset: DatasetField | null;
}

/**
 * The reading of `datasetArrows`. A value that is not a boolean takes the default, which
 * is false, so an option the HUD cannot read draws no arrow.
 */
export function readDatasetArrows(value: unknown): boolean {
  return value === true;
}

/**
 * The entry one step from the loaded one in catalog order, or null at the end of the
 * catalog. A map that holds no entry of the catalog, which is what the bar shows before
 * the first load settles, has no neighbour in either direction.
 */
export function stepTarget(
  entries: readonly DatasetInfo[],
  loadedId: string | null,
  step: number,
): DatasetInfo | null {
  const place = entries.findIndex((entry) => entry.id === loadedId);
  if (place < 0) return null;
  return entries[place + step] ?? null;
}

/**
 * The name a step button reads to a screen reader. It names the entry it loads, and it
 * says which end of the catalog it sits at where there is none.
 */
export function stepLabel(back: boolean, target: DatasetInfo | null): string {
  if (target === null) return back ? 'First dataset' : 'Last dataset';
  return `${back ? 'Previous' : 'Next'} dataset, ${target.label}`;
}

/**
 * The counter beside the arrows: the 1-based place of the loaded entry and the count of
 * the catalog. An entry the catalog does not hold reads as a dash.
 */
export function counterText(
  entries: readonly DatasetInfo[],
  loadedId: string | null,
): string {
  const place = entries.findIndex((entry) => entry.id === loadedId);
  return `${place < 0 ? '-' : String(place + 1)} / ${String(entries.length)}`;
}

/** Draws one chevron of the bar. The points give which way it points. */
function makeChevron(doc: Document, points: string): SVGSVGElement {
  const svg = makeSvg(doc, '0 0 16 16', 13);
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'square');
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', points);
  svg.appendChild(line);
  return svg;
}

/** Builds the turning spinner the field and a loading card both show. */
export function makeSpinner(doc: Document): HTMLElement {
  const spinner = make(doc, 'span', 'gm-hud__spinner');
  spinner.setAttribute('aria-hidden', 'true');
  return spinner;
}

/** Builds the centre group of the bar, or gives null when the catalog is empty. */
function makeCentre(
  doc: Document,
  map: GalaxyMap,
  arrows: boolean,
): { group: HTMLElement; field: DatasetField } | null {
  if (map.getDatasets().length === 0) return null;

  const group = make(doc, 'div', 'gm-hud__top-centre');

  const button = makeButton(doc, 'gm-hud__dataset');
  const label = make(doc, 'span', 'gm-hud__dataset-label');
  const value = make(doc, 'span', 'gm-hud__dataset-value');
  // The dialog writes `true` here while it is open, which draws the accent border.
  button.setAttribute('aria-expanded', 'false');
  // The caret is a vector and not a text character, and the spinner takes its place
  // while a load runs. The two boxes are one size, so the field keeps its width.
  const caret = make(doc, 'span', 'gm-hud__dataset-caret');
  caret.setAttribute('aria-hidden', 'true');
  caret.appendChild(makeChevron(doc, '4,6 8,10.5 12,6'));
  const spinner = makeSpinner(doc);
  spinner.hidden = true;
  button.append(label, value, caret, spinner);

  /** The two step buttons and the counter, which the host asks for. */
  const previous = arrows ? makeButton(doc, 'gm-hud__dataset-step') : null;
  const next = arrows ? makeButton(doc, 'gm-hud__dataset-step') : null;
  const counter = arrows ? make(doc, 'div', 'gm-hud__dataset-counter') : null;
  if (previous !== null) {
    previous.dataset['name'] = 'previous';
    previous.appendChild(makeChevron(doc, '10,3 5.5,8 10,13'));
  }
  if (next !== null) {
    next.dataset['name'] = 'next';
    next.appendChild(makeChevron(doc, '6,3 10.5,8 6,13'));
  }
  group.append(...[previous, button, next, counter].filter((one) => one !== null));

  /** The id of the entry a load is running for, or null. */
  let loading: string | null = null;
  /**
   * The step arrow that held the keyboard focus when the load disabled it. A disabled
   * button drops the focus to the body, and the bar gives the focus back when the arrow
   * enables again. The dialog and the lightbox return the focus in the same way.
   */
  let focusBack: HTMLButtonElement | null = null;

  /** Writes one step button from the entry it would load. */
  const writeStep = (
    element: HTMLButtonElement,
    back: boolean,
    entries: readonly DatasetInfo[],
    loadedId: string | null,
  ): void => {
    const target = stepTarget(entries, loadedId, back ? -1 : 1);
    // A load in progress disables both, so a held key starts no queue of loads.
    element.disabled = target === null || loading !== null;
    setAttribute(element, 'aria-label', stepLabel(back, target));
  };

  const update = (): void => {
    const held = map.getLoadedDataset();
    const name = held?.label ?? '';
    const busy = loading !== null;
    setText(label, busy ? 'LOADING' : 'DATASET');
    setText(value, name);
    setAttribute(button, 'data-loading', busy ? 'true' : 'false');
    setAttribute(button, 'title', name);
    setAttribute(
      button,
      'aria-label',
      busy ? `Dataset library, ${name} is loading` : `Dataset library, ${name}`,
    );
    caret.hidden = busy;
    spinner.hidden = !busy;

    if (previous === null || next === null || counter === null) return;
    // The reading comes before the two writes, because a button that takes `disabled`
    // drops the focus at once.
    if (busy && focusBack === null) {
      const active = doc.activeElement;
      if (active === previous) focusBack = previous;
      else if (active === next) focusBack = next;
    }
    const entries = map.getDatasets();
    const loadedId = held?.id ?? null;
    writeStep(previous, true, entries, loadedId);
    writeStep(next, false, entries, loadedId);
    setText(counter, counterText(entries, loadedId));
    if (!busy && focusBack !== null) {
      const back = focusBack;
      focusBack = null;
      // The arrow at the end of the catalog stays disabled, and the focus stays where
      // the load left it. Only an arrow the user can press again takes it back.
      if (!back.disabled) focusOn(back);
    }
  };

  const requestLoad = (id: string): Promise<void> | null => {
    // A second call while a load runs starts no second load, and a call for the entry
    // the map already holds starts none: a second load of the same set would clear the
    // records, fetch them again and reset the view, for no change the user asked for.
    if (loading !== null || map.getLoadedDataset()?.id === id) return null;
    loading = id;
    update();
    const settle = (): void => {
      loading = null;
      update();
    };
    return map.loadDataset(id).then(settle, (error: unknown) => {
      settle();
      console.warn('The dataset did not load.', error);
    });
  };

  previous?.addEventListener('click', () => {
    const target = stepTarget(
      map.getDatasets(),
      map.getLoadedDataset()?.id ?? null,
      -1,
    );
    if (target !== null) void requestLoad(target.id);
  });
  next?.addEventListener('click', () => {
    const target = stepTarget(map.getDatasets(), map.getLoadedDataset()?.id ?? null, 1);
    if (target !== null) void requestLoad(target.id);
  });

  update();

  return {
    group,
    field: {
      button,
      update,
      loadingId: () => loading,
      requestLoad,
    },
  };
}

/** Builds the top bar. */
export function createTopBar(
  doc: Document,
  map: GalaxyMap,
  title: string,
  arrows = false,
): TopBar {
  const element = make(doc, 'div', 'gm-hud__top-bar');

  const left = make(doc, 'div', 'gm-hud__top-left');
  const name = make(doc, 'div', 'gm-hud__top-name');
  const titleText = make(doc, 'h1', 'gm-hud__title');
  titleText.textContent = title;
  const region = make(doc, 'div', 'gm-hud__region');
  name.append(titleText, region);
  left.append(name);

  // The field sits at the centre of the bar and does not replace the region name: the
  // region name says where the camera looks and the field says what the map shows.
  const centre = makeCentre(doc, map, arrows);

  const right = make(doc, 'div', 'gm-hud__top-right');
  const zoom = make(doc, 'div', 'gm-hud__zoom');
  zoom.append(doc.createTextNode('ZOOM '));
  const zoomValue = make(doc, 'span', 'gm-hud__zoom-value');
  zoom.appendChild(zoomValue);
  const reset = makeButton(doc, 'gm-hud__reset');
  reset.textContent = 'RESET VIEW';
  reset.addEventListener('click', () => {
    map.setView({
      cursor: [...DEFAULT_VIEW.cursor],
      distance: DEFAULT_VIEW.distance,
      yaw: DEFAULT_VIEW.yaw,
      pitch: DEFAULT_VIEW.pitch,
    });
  });
  right.append(zoom, reset);

  element.append(left);
  if (centre !== null) element.appendChild(centre.group);
  element.appendChild(right);

  return {
    element,
    dataset: centre?.field ?? null,
    update(): void {
      const view = map.getView();
      // A cursor the region grid does not cover reads as an empty name. The bar shows
      // no placeholder text for it.
      setText(region, map.regionNameAt(view.cursor) ?? '');
      setText(zoomValue, formatLightYears(view.distance));
    },
  };
}
