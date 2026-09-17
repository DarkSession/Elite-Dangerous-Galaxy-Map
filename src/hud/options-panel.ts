// The map options panel: the galactic regions switch, the system names switch, the
// coordinate grid switch and the shapes switch. Each control shows the state the map is
// in, so a host that changes a setting through the handle moves the control with it.
import type { GalaxyMap } from '../app/create-map';
import { make, makeButton, setPressed } from './dom';

/** The map options panel of the HUD. */
export interface OptionsPanel {
  readonly element: HTMLElement;
  /** Writes the state each control shows, and writes only what changed. */
  update(): void;
}

/** Builds one switch with its label and its track. */
function makeToggle(
  doc: Document,
  name: string,
  label: string,
): { button: HTMLButtonElement } {
  const button = makeButton(doc, 'gm-hud__toggle');
  button.dataset['name'] = name;
  const text = make(doc, 'span', 'gm-hud__toggle-label');
  text.textContent = label;
  const track = make(doc, 'span', 'gm-hud__track');
  track.appendChild(make(doc, 'span', 'gm-hud__knob'));
  button.append(text, track);
  return { button };
}

/** Builds the map options panel. */
export function createOptionsPanel(doc: Document, map: GalaxyMap): OptionsPanel {
  const element = make(doc, 'section', 'gm-hud__panel gm-hud__options-panel');

  const header = make(doc, 'div', 'gm-hud__panel-header');
  const title = make(doc, 'h2', 'gm-hud__panel-title');
  title.textContent = 'MAP OPTIONS';
  header.appendChild(title);

  const body = make(doc, 'div', 'gm-hud__panel-body');

  const regions = makeToggle(doc, 'galactic-regions', 'Galactic regions');
  regions.button.addEventListener('click', () => {
    map.setRegionsVisible(!map.areRegionsVisible());
    update();
  });

  const names = makeToggle(doc, 'system-names', 'System names');
  names.button.addEventListener('click', () => {
    map.setSystemNamesVisible(!map.areSystemNamesVisible());
    update();
  });

  const grid = makeToggle(doc, 'coordinate-grid', 'Coordinate grid');
  grid.button.addEventListener('click', () => {
    map.setGridVisible(!map.isGridVisible());
    update();
  });

  // The switch draws whether or not the map holds a shape, because a host can add one
  // at any time.
  const shapes = makeToggle(doc, 'shapes', 'Shapes');
  shapes.button.addEventListener('click', () => {
    map.setShapesVisible(!map.areShapesVisible());
    update();
  });

  body.append(regions.button, names.button, grid.button, shapes.button);
  element.append(header, body);

  function update(): void {
    setPressed(regions.button, map.areRegionsVisible());
    setPressed(names.button, map.areSystemNamesVisible());
    setPressed(grid.button, map.isGridVisible());
    setPressed(shapes.button, map.areShapesVisible());
  }

  update();
  return { element, update };
}
