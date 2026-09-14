// The map options panel: the region mode, the system names switch and the coordinate
// grid switch. Each control shows the state the map is in, so a host that changes a
// setting through the handle moves the control with it.
import type { GalaxyMap, RegionMode } from '../app/create-map';
import { make, makeButton, setPressed } from './dom';

/** The three region modes, with the text the mockup gives each. */
const REGION_MODES: readonly { mode: RegionMode; label: string }[] = [
  { mode: 'off', label: 'NONE' },
  { mode: 'simplified', label: 'SIMPLIFIED' },
  { mode: 'accurate', label: 'ACCURATE' },
];

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

  const group = make(doc, 'div', 'gm-hud__group');
  const groupLabel = make(doc, 'div', 'gm-hud__group-label');
  groupLabel.textContent = 'GALAXY REGIONS';
  const segments = make(doc, 'div', 'gm-hud__segments');
  segments.setAttribute('role', 'group');
  segments.setAttribute('aria-label', 'Galaxy regions');
  const buttons: { mode: RegionMode; button: HTMLButtonElement }[] = [];
  for (const entry of REGION_MODES) {
    const button = makeButton(doc, 'gm-hud__segment');
    button.textContent = entry.label;
    button.dataset['name'] = entry.mode;
    button.addEventListener('click', () => {
      map.setRegionMode(entry.mode);
      update();
    });
    segments.appendChild(button);
    buttons.push({ mode: entry.mode, button });
  }
  group.append(groupLabel, segments);

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

  body.append(group, names.button, grid.button);
  element.append(header, body);

  function update(): void {
    const mode = map.getRegionMode();
    for (const entry of buttons) setPressed(entry.button, entry.mode === mode);
    setPressed(names.button, map.areSystemNamesVisible());
    setPressed(grid.button, map.isGridVisible());
  }

  update();
  return { element, update };
}
