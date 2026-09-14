// The information panel: what the map knows about the selected system.
import type { GalaxyMap, RealSystem } from '../app/create-map';
import {
  cssColor,
  cssColorAlpha,
  formatLightYears,
  formatWhole,
  make,
  makeButton,
  replaceChildrenKeepingFocus,
  setShown,
  setText,
} from './dom';
import { distanceFromSol, rangeFromCamera } from './geometry';
import type { Lightbox } from './lightbox';
import type { HudAction } from './types';

/** One field of the grid. */
interface Field {
  readonly label: string;
  readonly value: string;
}

/** The information panel of the HUD. */
export interface InfoPanel {
  readonly element: HTMLElement;
  /** Builds the panel again from the selection. */
  rebuild(): void;
  /** Rewrites the range from the camera, which follows the view. */
  update(): void;
}

/** The fields the record carries, in the order the panel shows them. */
function fieldsOf(system: RealSystem, range: number): Field[] {
  const position = system.position;
  const fields: Field[] = [
    {
      label: 'POSITION (LY)',
      value: `${formatWhole(position[0])} / ${formatWhole(position[1])} / ${formatWhole(position[2])}`,
    },
    { label: 'DISTANCE FROM SOL', value: formatLightYears(distanceFromSol(position)) },
    { label: 'RANGE', value: formatLightYears(range) },
  ];
  const add = (label: string, value: string | undefined): void => {
    // A field the record does not carry is left out, and not shown empty.
    if (value === undefined || value === '') return;
    fields.push({ label, value });
  };
  add('PRIMARY STAR', system.primaryStar);
  add('ALLEGIANCE', system.allegiance);
  add('GOVERNMENT', system.government);
  add('PRIMARY ECONOMY', system.primaryEconomy);
  add('SECURITY', system.security);
  if (system.population !== undefined) {
    fields.push({ label: 'POPULATION', value: formatWhole(system.population) });
  }
  if (system.bodyCount !== undefined) {
    fields.push({ label: 'BODIES', value: formatWhole(system.bodyCount) });
  }
  return fields;
}

/** Builds the information panel. It is hidden while nothing is selected. */
export function createInfoPanel(
  doc: Document,
  map: GalaxyMap,
  actions: readonly HudAction[],
  lightbox: Lightbox,
): InfoPanel {
  const element = make(doc, 'section', 'gm-hud__info');
  element.hidden = true;

  const header = make(doc, 'div', 'gm-hud__info-header');
  const name = make(doc, 'h2', 'gm-hud__info-name');
  const close = makeButton(doc, 'gm-hud__info-close');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close the information panel');
  close.addEventListener('click', () => {
    map.setSelection(null);
  });
  header.append(name, close);

  const body = make(doc, 'div', 'gm-hud__info-body');
  const footer = make(doc, 'div', 'gm-hud__info-footer');
  const centre = makeButton(doc, 'gm-hud__footer-button gm-hud__centre');
  centre.textContent = 'CENTRE VIEW';
  centre.addEventListener('click', () => {
    const system = map.getSelection();
    if (system === null) return;
    // The button moves the cursor alone. The distance, the yaw and the pitch stay, so a
    // user who flew out keeps the zoom they moved to.
    map.setView({ cursor: [...system.position] });
  });
  footer.appendChild(centre);
  for (const action of actions) {
    const button = makeButton(doc, 'gm-hud__footer-button gm-hud__action');
    button.textContent = action.label;
    button.dataset['name'] = action.label;
    button.addEventListener('click', () => {
      const system = map.getSelection();
      if (system === null) return;
      try {
        action.onSelect(system);
      } catch (error) {
        // The host's action is not the map. A failure in it must not stop the frame
        // loop, and the library does not read what the action returns.
        console.warn('A HUD action failed.', error);
      }
    });
    footer.appendChild(button);
  }

  element.append(header, body, footer);

  let rangeValue: HTMLElement | null = null;
  let shown: RealSystem | null = null;

  /** The colour of each category, read once per build of the panel. */
  function colorsByName(): Map<string, readonly [number, number, number]> {
    const colors = new Map<string, readonly [number, number, number]>();
    const count = map.categoryCount();
    for (let index = 0; index < count; index += 1) {
      const category = map.getCategory(index);
      if (category !== null) colors.set(category.name, category.color);
    }
    return colors;
  }

  function rebuild(): void {
    const system = map.getSelection();
    shown = system;
    rangeValue = null;
    if (system === null) {
      setShown(element, false);
      replaceChildrenKeepingFocus(body, []);
      return;
    }

    setText(name, system.name);
    const parts: HTMLElement[] = [];

    const grid = make(doc, 'div', 'gm-hud__field-grid');
    const range = rangeFromCamera(map.getView(), system.position);
    for (const field of fieldsOf(system, range)) {
      const box = make(doc, 'div', 'gm-hud__field');
      const label = make(doc, 'div', 'gm-hud__field-label');
      label.textContent = field.label;
      const value = make(doc, 'div', 'gm-hud__field-value');
      value.textContent = field.value;
      if (field.label === 'RANGE') rangeValue = value;
      box.append(label, value);
      grid.appendChild(box);
    }
    parts.push(grid);

    const colors = colorsByName();
    const categoryNames = [system.primaryCategory, ...system.secondaryCategories];
    const chipTitle = make(doc, 'div', 'gm-hud__section-title');
    chipTitle.textContent = 'CATEGORIES';
    const chips = make(doc, 'div', 'gm-hud__chips');
    for (const categoryName of categoryNames) {
      const color = colors.get(categoryName);
      const chip = make(doc, 'span', 'gm-hud__chip');
      chip.dataset['name'] = categoryName;
      chip.textContent = categoryName;
      if (color !== undefined) {
        chip.style.color = cssColor(color);
        chip.style.background = cssColorAlpha(color, 0.12);
      }
      chips.appendChild(chip);
    }
    parts.push(chipTitle, chips);

    if (system.description !== undefined && system.description !== '') {
      const title = make(doc, 'div', 'gm-hud__section-title');
      title.textContent = 'DESCRIPTION';
      const text = make(doc, 'div', 'gm-hud__description');
      text.textContent = system.description;
      parts.push(title, text);
    }

    const images = system.images ?? [];
    if (images.length > 0) {
      const title = make(doc, 'div', 'gm-hud__section-title');
      title.textContent = 'VISUAL RECORDS';
      const thumbs = make(doc, 'div', 'gm-hud__thumbs');
      for (const record of images) {
        const caption = record.caption ?? '';
        const thumb = makeButton(doc, 'gm-hud__thumb');
        thumb.setAttribute('aria-label', caption === '' ? 'Open the picture' : caption);
        // The picture is the identity of the thumbnail. A rebuild makes a new element,
        // and the lightbox reads this to give the focus back to the new one.
        thumb.dataset['url'] = record.url;
        const picture = make(doc, 'img', 'gm-hud__thumb-image');
        picture.loading = 'lazy';
        picture.referrerPolicy = 'no-referrer';
        picture.alt = '';
        picture.src = record.url;
        // A picture that does not load leaves the thumbnail's own pattern and its
        // caption in view, and no broken image icon.
        picture.addEventListener('error', () => {
          picture.hidden = true;
        });
        const text = make(doc, 'span', 'gm-hud__thumb-caption');
        text.textContent = caption;
        thumb.append(picture, text);
        thumb.addEventListener('click', () => {
          lightbox.open(record.url, caption, system.name, thumb);
        });
        thumbs.appendChild(thumb);
      }
      parts.push(title, thumbs);
    }

    replaceChildrenKeepingFocus(body, parts);
    setShown(element, true);
  }

  return {
    element,
    rebuild,
    update(): void {
      if (shown === null || rangeValue === null) return;
      setText(
        rangeValue,
        formatLightYears(rangeFromCamera(map.getView(), shown.position)),
      );
    },
  };
}
