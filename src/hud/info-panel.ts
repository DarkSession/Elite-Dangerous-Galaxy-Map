// The information panel: what the map knows about the selected system.
import type { GalaxyMap, RealSystem } from '../app/create-map';
import {
  cssColor,
  cssColorAlpha,
  formatCoordinate,
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

/** How long a copy button shows its tick, in milliseconds. */
export const COPY_TICK_MS = 1400;

/** One field of the grid. */
interface Field {
  readonly label: string;
  readonly value: string;
  /** The text the field's copy button writes, when the field carries one. */
  readonly copy?: string;
  /** True where the field takes both columns of the grid. */
  readonly wide?: boolean;
}

/** The information panel of the HUD. */
export interface InfoPanel {
  readonly element: HTMLElement;
  /** Builds the panel again from the selection. */
  rebuild(): void;
  /** Rewrites the range from the camera, which follows the view. */
  update(): void;
  /** Drops the timer a copy button holds. */
  dispose(): void;
}

/** The three game coordinates, each with the digits the field shows. */
function positionText(
  position: readonly [number, number, number],
  separators: boolean,
): string {
  const parts = position.map((value) => formatCoordinate(value, separators));
  return `${parts[0]} / ${parts[1]} / ${parts[2]}`;
}

/**
 * The three game coordinates with no thousands separator. The panel shows the position
 * with its separators, because a separator is for reading, and the copy is for pasting
 * into a field that takes a number.
 */
function copyPosition(position: readonly [number, number, number]): string {
  return positionText(position, false);
}

/** The fields the record carries, in the order the panel shows them. */
function fieldsOf(system: RealSystem, range: number): Field[] {
  const position = system.position;
  const fields: Field[] = [
    {
      label: 'POSITION',
      value: positionText(position, true),
      copy: copyPosition(position),
      wide: true,
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

/** Draws the two squares of the copy mark. */
function makeCopyIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gm-hud__copy-mark');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '11');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.3');
  svg.setAttribute('aria-hidden', 'true');
  for (const corner of [
    ['1.2', '1.2'],
    ['4.8', '4.8'],
  ]) {
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', corner[0] as string);
    rect.setAttribute('y', corner[1] as string);
    rect.setAttribute('width', '8');
    rect.setAttribute('height', '8');
    svg.appendChild(rect);
  }
  return svg;
}

/** Draws the tick the button shows after it wrote to the clipboard. */
function makeTickIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gm-hud__copy-tick');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '11');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'square');
  svg.setAttribute('aria-hidden', 'true');
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', '2,7.5 5.5,11 12,3.5');
  svg.appendChild(line);
  return svg;
}

/**
 * Writes text to the clipboard and says whether the write succeeded. The clipboard is
 * not always there: a browser may refuse the write, and a page served over plain HTTP
 * carries no `navigator.clipboard`. A refused write throws nothing out of the HUD.
 */
async function writeClipboard(doc: Document, text: string): Promise<boolean> {
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard === undefined) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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

  // The tick of the button that wrote last, and the timer that takes it away. One tick
  // shows at a time, so a click on the second button moves it.
  let tickButton: HTMLButtonElement | null = null;
  let tickTimer: number | null = null;

  /** Shows the copy mark again on the button that holds the tick. */
  function clearTick(): void {
    if (tickTimer !== null) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
    if (tickButton === null) return;
    const label = tickButton.dataset['label'] ?? '';
    tickButton.dataset['state'] = 'idle';
    tickButton.title = label;
    tickButton.setAttribute('aria-label', label);
    tickButton = null;
  }

  /** Shows the tick on one button for 1.4 seconds. */
  function showTick(button: HTMLButtonElement): void {
    clearTick();
    tickButton = button;
    button.dataset['state'] = 'copied';
    button.title = 'Copied';
    button.setAttribute('aria-label', 'Copied');
    tickTimer = window.setTimeout(clearTick, COPY_TICK_MS);
  }

  /**
   * Builds one copy button. `read` gives the text at the click, so the button beside
   * the name reads the system that is selected then.
   */
  function makeCopyButton(
    label: string,
    field: string,
    read: () => string | null,
  ): HTMLButtonElement {
    const button = makeButton(doc, 'gm-hud__copy');
    button.dataset['name'] = field;
    button.dataset['state'] = 'idle';
    // The idle name, which the button takes back when its tick goes.
    button.dataset['label'] = label;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(makeCopyIcon(doc), makeTickIcon(doc));
    button.addEventListener('click', (event) => {
      // The click stays on the button. It reads the selection and never changes it.
      event.stopPropagation();
      const text = read();
      if (text === null) return;
      void writeClipboard(doc, text).then((written) => {
        // A refused write shows no tick and leaves the panel as it is.
        if (written && button.isConnected) showTick(button);
      });
    });
    return button;
  }

  const header = make(doc, 'div', 'gm-hud__info-header');
  const titleGroup = make(doc, 'div', 'gm-hud__info-title');
  const name = make(doc, 'h2', 'gm-hud__info-name');
  const copyName = makeCopyButton(
    'Copy system name',
    'name',
    () => map.getSelection()?.name ?? null,
  );
  titleGroup.append(name, copyName);
  const close = makeButton(doc, 'gm-hud__info-close');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close the information panel');
  close.addEventListener('click', () => {
    map.setSelection(null);
  });
  header.append(titleGroup, close);

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
    // The position's button is made again with the grid, so the tick it may hold goes
    // with it.
    clearTick();
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
      if (field.wide === true) box.classList.add('gm-hud__field--wide');
      const label = make(doc, 'div', 'gm-hud__field-label');
      label.textContent = field.label;
      const value = make(doc, 'div', 'gm-hud__field-value');
      value.textContent = field.value;
      if (field.label === 'RANGE') rangeValue = value;
      if (field.copy === undefined) {
        box.append(label, value);
      } else {
        const text = field.copy;
        const head = make(doc, 'div', 'gm-hud__field-head');
        head.append(
          label,
          makeCopyButton('Copy position', 'position', () => text),
        );
        box.append(head, value);
      }
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
    dispose(): void {
      clearTick();
    },
  };
}
