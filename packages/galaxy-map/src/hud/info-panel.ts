// The information panel: what the map knows about the selected system.
import type { GalaxyMap, RealSystem } from '../app/create-map';
import type { SystemDetails, SystemDetailValue } from './details';
import { isSection, readDetails } from './details';
import {
  cssColor,
  cssColorAlpha,
  focusMark,
  formatCoordinate,
  formatLightYears,
  formatWhole,
  make,
  makeButton,
  makeSvg,
  replaceChildrenKeepingFocus,
  restoreFocus,
  setShown,
  setText,
} from './dom';
import { distanceFromSol, rangeFromCursor } from './geometry';
import type { Lightbox } from './lightbox';
import { renderMarkdown } from './markdown';
import type { HudInfoFields, HudOptions } from './types';

/** How long a copy button shows its tick, in milliseconds. */
export const COPY_TICK_MS = 1400;

/** What a field's copy button writes, what it is called, and the key of its tick. */
interface FieldCopy {
  /** The text the button writes to the clipboard. */
  readonly text: string;
  /** The accessible name the button carries while it is idle. */
  readonly name: string;
  /** What the button is identified by, so one tick shows at a time. */
  readonly key: string;
}

/** One field of the grid. */
interface Field {
  readonly label: string;
  readonly value: string;
  /** The copy button the field carries, where it carries one. */
  readonly copy?: FieldCopy;
  /** True where the field takes both columns of the grid. */
  readonly wide?: boolean;
  /**
   * The worked-out field the panel writes again after it builds the grid. The panel
   * finds the two fields by this and not by the label, because a host value can carry
   * the label `RANGE` or `REGION` too.
   */
  readonly role?: 'range' | 'region';
}

/** Which worked-out fields the panel builds. */
export interface InfoFieldSwitches {
  readonly distanceFromSol: boolean;
  readonly range: boolean;
  readonly region: boolean;
}

/** The information panel of the HUD. */
export interface InfoPanel {
  readonly element: HTMLElement;
  /** Builds the panel again from the selection. */
  rebuild(): void;
  /** Rewrites the range from the camera, which follows the view. */
  update(): void;
  /** Drops the timer a copy button holds and the details load in flight. */
  dispose(): void;
}

/**
 * Which worked-out fields the host left on. Each one is on unless the host names it
 * false, and a value that is not a boolean takes the default.
 */
export function readInfoFields(fields: HudInfoFields | undefined): InfoFieldSwitches {
  const on = (held: unknown): boolean => (typeof held === 'boolean' ? held : true);
  return {
    distanceFromSol: on(fields?.distanceFromSol),
    range: on(fields?.range),
    region: on(fields?.region),
  };
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

/**
 * Places the cells with one rule. A field is wide when it is `POSITION` or `REGION`,
 * when it sits at the first column and the field after it is wide, or when it sits at
 * the first column and it is the last field. The grid then holds no empty cell.
 *
 * The column condition is what keeps `DISTANCE FROM SOL` and `RANGE` sharing one row
 * with `REGION` under them: `RANGE` sits at the second column, so the clause does not
 * reach it.
 */
function placeFields(fields: readonly Field[]): Field[] {
  const placed: Field[] = [];
  let column = 0;
  for (const [order, field] of fields.entries()) {
    const after = fields[order + 1];
    const wide =
      field.wide === true ||
      (column === 0 && (after === undefined || after.wide === true));
    placed.push({ ...field, wide });
    column = wide ? 0 : (column + 1) % 2;
  }
  return placed;
}

/**
 * The fields the panel shows, in order: the position, the worked-out fields the host
 * left on, the fields the record carries, and the host's grid values.
 */
export function fieldsOf(
  system: RealSystem,
  range: number,
  switches: InfoFieldSwitches,
  hostValues: readonly SystemDetailValue[],
): Field[] {
  const position = system.position;
  const fields: Field[] = [
    {
      label: 'POSITION',
      value: positionText(position, true),
      copy: {
        text: copyPosition(position),
        name: 'Copy position',
        key: 'position',
      },
      wide: true,
    },
  ];
  if (switches.distanceFromSol) {
    fields.push({
      label: 'DISTANCE FROM SOL',
      value: formatLightYears(distanceFromSol(position)),
    });
  }
  if (switches.range) {
    fields.push({ label: 'RANGE', value: formatLightYears(range), role: 'range' });
  }
  if (switches.region) {
    // The region is looked up on a promise, so the field is placed at once with an
    // empty value and the name is written in when the answer arrives. The grid then
    // does not reflow under the reader.
    //
    // It takes both columns because a region name runs to 26 characters, as
    // `Outer Scutum-Centaurus Arm` does, and one column of two is too narrow for it.
    fields.push({ label: 'REGION', value: '', wide: true, role: 'region' });
  }
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
  for (const entry of hostValues) {
    const text = entry.copy;
    fields.push({
      label: entry.label,
      value: entry.value ?? '',
      // The button carries the entry's label as its key, so its tick does not collide
      // with the position button's.
      ...(text === undefined
        ? {}
        : { copy: { text, name: `Copy ${entry.label}`, key: entry.label } }),
    });
  }
  return placeFields(fields);
}

/** Draws the two squares of the copy mark. */
function makeCopyIcon(doc: Document): SVGSVGElement {
  const svg = makeSvg(doc, '0 0 14 14', 11);
  svg.setAttribute('class', 'gm-hud__copy-mark');
  svg.setAttribute('stroke-width', '1.3');
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
  const svg = makeSvg(doc, '0 0 14 14', 11);
  svg.setAttribute('class', 'gm-hud__copy-tick');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'square');
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

/** What the panel holds one system by. It is the identity the record set uses. */
function identityOf(system: RealSystem): string {
  return system.id64 ?? system.name;
}

/** True where the answer is a promise the panel waits on. */
function isPromise(value: unknown): value is Promise<SystemDetails | null> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** Builds the information panel. It is hidden while nothing is selected. */
export function createInfoPanel(
  doc: Document,
  map: GalaxyMap,
  options: HudOptions,
  lightbox: Lightbox,
): InfoPanel {
  const element = make(doc, 'section', 'gm-hud__info');
  element.hidden = true;
  const switches = readInfoFields(options.infoFields);
  const loader =
    typeof options.details === 'function' ? options.details.bind(options) : null;

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

  element.append(header, body, footer);

  let rangeValue: HTMLElement | null = null;
  let regionValue: HTMLElement | null = null;
  let shown: RealSystem | null = null;
  // Which lookup the panel is waiting on. A lookup whose selection has changed before it
  // resolves is dropped, so a slow first load cannot write the region of a system the
  // user has left.
  let regionRequest = 0;

  // The details load takes the same shape as the region lookup: a counter that drops a
  // stale answer, the identity the held answer belongs to, and the answer itself. A
  // rebuild for the same selection draws from what is held and starts no second load.
  let detailsRequest = 0;
  let detailsIdentity: string | null = null;
  let detailsHeld: SystemDetails | null = null;
  let detailsLoading = false;
  let detailsAbort: AbortController | null = null;
  // The buttons the held answer put in the footer. An answer that is replaced or dropped
  // takes its buttons with it, so the footer never holds the buttons of another system.
  let hostButtons: HTMLButtonElement[] = [];

  /**
   * Drops the answer and stops the work behind it. The abort says the answer is no
   * longer wanted, so a host that fetches passes the signal to `fetch` and the request
   * stops. The library keeps nothing after the abort.
   */
  function dropDetails(): void {
    detailsRequest += 1;
    detailsHeld = null;
    detailsLoading = false;
    detailsAbort?.abort();
    detailsAbort = null;
  }

  /** Takes the record as the answer, and reports what is not an abort. */
  function failDetails(controller: AbortController, error: unknown): void {
    detailsHeld = {};
    detailsLoading = false;
    // A failure in the host's loader is not the map's failure. It must not throw out of
    // the HUD and must not stop the frame loop.
    if (!controller.signal.aborted) console.warn('A HUD details loader failed.', error);
  }

  /** Calls the host's loader for one system. */
  function startDetails(system: RealSystem): void {
    if (loader === null) return;
    const request = detailsRequest;
    const controller = new AbortController();
    detailsAbort = controller;
    let answer: SystemDetails | Promise<SystemDetails | null> | null;
    try {
      answer = loader(system, controller.signal);
    } catch (error) {
      failDetails(controller, error);
      return;
    }
    if (!isPromise(answer)) {
      // A value and not a promise draws at once, with no loading line.
      detailsHeld = readDetails(answer);
      return;
    }
    detailsLoading = true;
    void answer.then(
      (value) => {
        // A promise that resolves after the selection changed is dropped.
        if (request !== detailsRequest) return;
        detailsHeld = readDetails(value);
        detailsLoading = false;
        rebuild();
      },
      (error: unknown) => {
        if (request !== detailsRequest) return;
        failDetails(controller, error);
        rebuild();
      },
    );
  }

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

  /**
   * Draws the footer buttons of the held answer. The footer and its centre view button
   * are built before the loader is called, so the footer never appears late and never
   * moves the rest of the panel. Where the load has not settled, where it failed and
   * where the answer carries no `actions`, the footer holds the centre view button
   * alone.
   */
  function drawFooterActions(): void {
    const mark = focusMark(footer);
    for (const button of hostButtons) button.remove();
    hostButtons = [];
    for (const action of detailsHeld?.actions ?? []) {
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
      hostButtons.push(button);
      footer.appendChild(button);
    }
    restoreFocus(footer, mark);
  }

  /** One section title of the panel body. */
  function sectionTitle(text: string): HTMLElement {
    const title = make(doc, 'div', 'gm-hud__section-title');
    title.textContent = text;
    return title;
  }

  function rebuild(): void {
    const system = map.getSelection();
    const identity = system === null ? null : identityOf(system);
    if (identity !== detailsIdentity) {
      dropDetails();
      detailsIdentity = identity;
      if (system !== null) startDetails(system);
    }
    shown = system;
    rangeValue = null;
    regionValue = null;
    regionRequest += 1;
    // The position's button is made again with the grid, so the tick it may hold goes
    // with it.
    clearTick();
    drawFooterActions();
    if (system === null) {
      setShown(element, false);
      replaceChildrenKeepingFocus(body, []);
      return;
    }

    setText(name, system.name);
    const parts: HTMLElement[] = [];
    const values = detailsHeld?.values ?? [];

    const grid = make(doc, 'div', 'gm-hud__field-grid');
    const range = rangeFromCursor(map.getView(), system.position);
    const gridValues = values.filter((entry) => !isSection(entry));
    for (const field of fieldsOf(system, range, switches, gridValues)) {
      const box = make(doc, 'div', 'gm-hud__field');
      if (field.wide === true) box.classList.add('gm-hud__field--wide');
      const label = make(doc, 'div', 'gm-hud__field-label');
      label.textContent = field.label;
      const value = make(doc, 'div', 'gm-hud__field-value');
      value.textContent = field.value;
      if (field.role === 'range') rangeValue = value;
      if (field.role === 'region') regionValue = value;
      if (field.copy === undefined) {
        box.append(label, value);
      } else {
        const copy = field.copy;
        const head = make(doc, 'div', 'gm-hud__field-head');
        head.append(
          label,
          makeCopyButton(copy.name, copy.key, () => copy.text),
        );
        box.append(head, value);
      }
      grid.appendChild(box);
    }
    parts.push(grid);

    // `Unknown` reads for a position the region map does not cover and for a failed
    // load, because the panel states one fact and an empty field states none.
    //
    // With the field off the panel asks for no region, so the map never fetches the
    // 199 KiB region cell table.
    if (switches.region) {
      const request = regionRequest;
      const writeRegion = (name: string): void => {
        if (request !== regionRequest || regionValue === null) return;
        setText(regionValue, name);
      };
      map.regionNameAtExact(system.position).then(
        (name) => {
          writeRegion(name ?? 'Unknown');
        },
        () => {
          writeRegion('Unknown');
        },
      );
    }

    // A system that names no category carries no chip and no empty row in place of one,
    // which an uncategorised set holds for every one of its systems.
    if (system.categories.length > 0) {
      const colors = colorsByName();
      const chips = make(doc, 'div', 'gm-hud__chips');
      for (const categoryName of system.categories) {
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
      parts.push(sectionTitle('CATEGORIES'), chips);
    }

    // The loaded description replaces the record's own. The record is what the panel
    // draws when the host gives no loader, when the loader gives none, and when a load
    // failed.
    const loaded = detailsHeld?.description;
    const description =
      loaded !== undefined && loaded !== '' ? loaded : (system.description ?? '');
    if (detailsLoading) {
      const line = make(doc, 'div', 'gm-hud__loading');
      line.textContent = 'LOADING…';
      line.setAttribute('aria-busy', 'true');
      parts.push(sectionTitle('DESCRIPTION'), line);
    } else if (description !== '') {
      const text = make(doc, 'div', 'gm-hud__description');
      text.appendChild(renderMarkdown(doc, description));
      parts.push(sectionTitle('DESCRIPTION'), text);
    }

    // Each section value draws under the description, with its label as the title.
    for (const entry of values) {
      if (!isSection(entry)) continue;
      const text = make(doc, 'div', 'gm-hud__description');
      text.dataset['name'] = entry.label;
      text.appendChild(renderMarkdown(doc, entry.markdown ?? ''));
      parts.push(sectionTitle(entry.label), text);
    }

    const images = system.images ?? [];
    if (images.length > 0) {
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
      parts.push(sectionTitle('VISUAL RECORDS'), thumbs);
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
        formatLightYears(rangeFromCursor(map.getView(), shown.position)),
      );
    },
    dispose(): void {
      clearTick();
      // The dispose aborts the load in flight and drops the answer behind it.
      dropDetails();
      detailsIdentity = null;
    },
  };
}
