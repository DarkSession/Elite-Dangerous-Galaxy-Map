// The top bar: the title, the region under the cursor, the zoom distance and the reset
// view button.
import type { GalaxyMap } from '../app/create-map';
import { formatLightYears, make, makeButton, setText } from './dom';

/** The view the reset button sets, which `map-navigation` gives as the default view. */
const DEFAULT_VIEW = {
  cursor: [0, 0, 0] as [number, number, number],
  distance: 60000,
  yaw: 0,
  pitch: 35,
};

/** The title the bar shows when the options name none. */
export const DEFAULT_TITLE = 'GALACTIC CARTOGRAPHICS';

/** The top bar of the HUD. */
export interface TopBar {
  readonly element: HTMLElement;
  /**
   * Rewrites the region name and the zoom from the view. The caller runs it at most 10
   * times a second, and each write happens only when the text changed.
   */
  update(): void;
}

/** Builds the top bar. */
export function createTopBar(doc: Document, map: GalaxyMap, title: string): TopBar {
  const element = make(doc, 'div', 'gm-hud__top-bar');

  const left = make(doc, 'div', 'gm-hud__top-left');
  const titleText = make(doc, 'h1', 'gm-hud__title');
  titleText.textContent = title;
  const region = make(doc, 'div', 'gm-hud__region');
  left.append(titleText, region);

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
    update(): void {
      const view = map.getView();
      // A cursor the region grid does not cover reads as an empty name. The bar shows
      // no placeholder text for it.
      setText(region, map.regionNameAt(view.cursor) ?? '');
      setText(zoomValue, formatLightYears(view.distance));
    },
  };
}
