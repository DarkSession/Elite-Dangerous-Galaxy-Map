// The top bar: the title, the region under the cursor, the dataset field, the zoom
// distance and the reset view button.
import type { GalaxyMap } from '../app/create-map';
import { formatLightYears, make, makeButton, setAttribute, setText } from './dom';

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
  /** Writes the loaded dataset's label, and the loading state, into the field. */
  update(): void;
  /** Says whether a load is running, so the field shows it. */
  setLoading(loading: boolean): void;
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

/** Builds the dataset field, or gives null when the catalog is empty. */
function makeDatasetField(doc: Document, map: GalaxyMap): DatasetField | null {
  if (map.getDatasets().length === 0) return null;

  const button = makeButton(doc, 'gm-hud__dataset');
  const label = make(doc, 'span', 'gm-hud__dataset-label');
  const value = make(doc, 'span', 'gm-hud__dataset-value');
  // The dialog writes `true` here while it is open, which draws the accent border.
  button.setAttribute('aria-expanded', 'false');
  const caret = make(doc, 'span', 'gm-hud__dataset-caret');
  caret.textContent = '▾';
  caret.setAttribute('aria-hidden', 'true');
  button.append(label, value, caret);

  let loading = false;

  const update = (): void => {
    const held = map.getLoadedDataset();
    const name = held?.label ?? '';
    setText(label, loading ? 'LOADING' : 'DATASET');
    setText(value, name);
    setAttribute(button, 'data-loading', loading ? 'true' : 'false');
    setAttribute(button, 'title', name);
    setAttribute(
      button,
      'aria-label',
      loading ? `Dataset library, ${name} is loading` : `Dataset library, ${name}`,
    );
  };

  update();

  return {
    button,
    update,
    setLoading(next: boolean): void {
      loading = next;
      update();
    },
  };
}

/** Builds the top bar. */
export function createTopBar(doc: Document, map: GalaxyMap, title: string): TopBar {
  const element = make(doc, 'div', 'gm-hud__top-bar');

  const left = make(doc, 'div', 'gm-hud__top-left');
  const name = make(doc, 'div', 'gm-hud__top-name');
  const titleText = make(doc, 'h1', 'gm-hud__title');
  titleText.textContent = title;
  const region = make(doc, 'div', 'gm-hud__region');
  name.append(titleText, region);
  left.append(name);

  // The field sits beside the region name and does not replace it: the region name says
  // where the camera looks and the field says what the map shows.
  const dataset = makeDatasetField(doc, map);
  if (dataset !== null) {
    const divider = make(doc, 'div', 'gm-hud__top-divider');
    divider.setAttribute('aria-hidden', 'true');
    left.append(divider, dataset.button);
  }

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

  element.append(left, right);

  return {
    element,
    dataset,
    update(): void {
      const view = map.getView();
      // A cursor the region grid does not cover reads as an empty name. The bar shows
      // no placeholder text for it.
      setText(region, map.regionNameAt(view.cursor) ?? '');
      setText(zoomValue, formatLightYears(view.distance));
    },
  };
}
