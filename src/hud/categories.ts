// The category panel: the search box, one row per category, and the list a row expands
// into.
import type { GalaxyMap } from '../app/create-map';
import {
  cssColor,
  focusMark,
  formatWhole,
  make,
  makeButton,
  replaceChildrenKeepingFocus,
  restoreFocus,
  setAttribute,
  setPressed,
  setShown,
  setStyle,
} from './dom';

/** How long the box waits before it gives the text to the filter, in milliseconds. */
export const FILTER_DELAY_MS = 150;

/** The most system rows one expanded list holds. */
export const MAX_SYSTEM_ROWS = 200;

/** What the panel keeps about one system, so it does not read the set again. */
interface Entry {
  readonly name: string;
  readonly identity: string;
  /** The distance from Sol in light years, which does not change as the user flies. */
  readonly distance: number;
}

/** The elements of one category row. */
interface Group {
  readonly name: string;
  readonly row: HTMLButtonElement;
  readonly swatch: HTMLElement;
  readonly expand: HTMLButtonElement;
  readonly list: HTMLElement;
  readonly color: readonly [number, number, number];
}

/** The category panel of the HUD. */
export interface CategoryPanel {
  readonly element: HTMLElement;
  /** Rebuilds every row from the category table and the system set. */
  rebuild(): void;
  /** Writes the state each control shows, and writes only what changed. */
  update(): void;
  /** Rebuilds the rows when the table or the set changed since the last call. */
  poll(): void;
  /** Drops the timer the search box holds. */
  dispose(): void;
}

/** Draws the three lines of the expand button. */
function makeExpandIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '11');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('aria-hidden', 'true');
  for (const y of ['2.5', '6', '9.5']) {
    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '1');
    line.setAttribute('y1', y);
    line.setAttribute('x2', '11');
    line.setAttribute('y2', y);
    svg.appendChild(line);
  }
  return svg;
}

/** Builds the category panel. */
export function createCategoryPanel(doc: Document, map: GalaxyMap): CategoryPanel {
  const element = make(doc, 'section', 'gm-hud__panel gm-hud__category-panel');

  const header = make(doc, 'div', 'gm-hud__panel-header');
  const title = make(doc, 'h2', 'gm-hud__panel-title');
  title.textContent = 'SYSTEM CATEGORIES';
  const bulk = make(doc, 'div', 'gm-hud__bulk');
  const allButton = makeButton(doc, 'gm-hud__bulk-button');
  allButton.textContent = 'ALL';
  allButton.dataset['name'] = 'all';
  const noneButton = makeButton(doc, 'gm-hud__bulk-button');
  noneButton.textContent = 'NONE';
  noneButton.dataset['name'] = 'none';
  bulk.append(allButton, noneButton);
  header.append(title, bulk);

  const searchWrap = make(doc, 'div', 'gm-hud__search-wrap');
  const search = make(doc, 'input', 'gm-hud__search');
  search.type = 'text';
  search.placeholder = 'SEARCH SYSTEMS';
  search.setAttribute('aria-label', 'Search systems');
  searchWrap.appendChild(search);

  const list = make(doc, 'div', 'gm-hud__category-list');
  element.append(header, searchWrap, list);

  const groups: Group[] = [];
  const byCategory = new Map<string, Entry[]>();
  let expanded: string | null = null;
  let dataSignature = '';
  let filterSignature = '';
  let filterTimer: number | null = null;

  /** Gives the box's text to the filter and renders the list again. */
  const applyFilter = (): void => {
    filterTimer = null;
    map.setNameFilter(search.value);
    renderExpandedList();
  };

  search.addEventListener('input', () => {
    // The box calls the filter at most once every 150 ms while the user types. The timer
    // that is already waiting is the call after the user stops.
    if (filterTimer !== null) return;
    filterTimer = window.setTimeout(applyFilter, FILTER_DELAY_MS);
  });

  const setEveryCategory = (visible: boolean): void => {
    for (const group of groups) map.setCategoryVisible(group.name, visible);
    update();
  };
  allButton.addEventListener('click', () => setEveryCategory(true));
  noneButton.addEventListener('click', () => setEveryCategory(false));

  /** Puts one system in the list of one category. */
  function addEntry(name: string, entry: Entry): void {
    const held = byCategory.get(name);
    if (held === undefined) byCategory.set(name, [entry]);
    else held.push(entry);
  }

  /** Reads every system once, so the counts and the lists need no second sweep. */
  function readSystems(): void {
    byCategory.clear();
    const count = map.systemCount();
    for (let index = 0; index < count; index += 1) {
      const system = map.getSystem(index);
      if (system === null) continue;
      const position = system.position;
      const entry: Entry = {
        name: system.name,
        identity: system.id64 ?? system.name,
        distance: Math.hypot(position[0], position[1], position[2]),
      };
      // The system goes in every category it names. The row's switch brings the
      // system back through any of them, so the row's count and its list say so.
      addEntry(system.primaryCategory, entry);
      for (const name of system.secondaryCategories) addEntry(name, entry);
    }
  }

  /** The systems of the expanded category the filter keeps, in order of name. */
  function entriesOf(name: string): Entry[] {
    const held = byCategory.get(name) ?? [];
    // The text is not trimmed, because the map compares the filter text as the host
    // gave it. A trim here would show a row whose marker the map does not draw.
    const text = map.getNameFilter().toLowerCase();
    const kept =
      text === ''
        ? held.slice()
        : held.filter((entry) => entry.name.toLowerCase().includes(text));
    kept.sort((left, right) => left.name.localeCompare(right.name));
    return kept;
  }

  /** Fills the list of the expanded category, and empties every other list. */
  function renderExpandedList(): void {
    for (const group of groups) {
      const open = group.name === expanded;
      setAttribute(group.expand, 'aria-expanded', open ? 'true' : 'false');
      setAttribute(group.expand, 'aria-label', open ? 'Hide systems' : 'List systems');
      setAttribute(group.expand, 'title', open ? 'Hide systems' : 'List systems');
      setShown(group.list, open);
      if (!open) {
        if (group.list.childElementCount > 0) {
          replaceChildrenKeepingFocus(group.list, []);
        }
        continue;
      }
      const entries = entriesOf(group.name);
      const shown = Math.min(entries.length, MAX_SYSTEM_ROWS);
      const children: HTMLElement[] = [];
      for (let index = 0; index < shown; index += 1) {
        const entry = entries[index] as Entry;
        const row = makeButton(doc, 'gm-hud__system-row');
        row.dataset['name'] = entry.name;
        row.dataset['identity'] = entry.identity;
        const name = make(doc, 'span', 'gm-hud__system-name');
        name.textContent = entry.name;
        // The distance is an attribute the style sheet draws, and not an element. The
        // list holds 200 rows, and the HUD's node count budget does not carry a third
        // element per row.
        row.dataset['distance'] = formatWhole(entry.distance);
        row.append(name);
        row.addEventListener('click', () => {
          // The row turns its category on, because a row of a category the user closed
          // must still reach the system it names.
          map.setCategoryVisible(group.name, true);
          map.setSelection(entry.identity);
          update();
        });
        children.push(row);
      }
      if (entries.length > shown) {
        const cut = make(doc, 'div', 'gm-hud__system-cut');
        cut.textContent = `${formatWhole(shown)} of ${formatWhole(entries.length)}`;
        children.push(cut);
      }
      replaceChildrenKeepingFocus(group.list, children);
    }
    filterSignature = map.getNameFilter();
    update();
  }

  /** Builds one row per category and reads the systems again. */
  function rebuild(): void {
    // The mark is read before the first replace and restored after the last one. The new
    // groups hold empty system lists, so a focused system row finds its place only after
    // `renderExpandedList` fills them.
    const mark = focusMark(element);
    readSystems();
    groups.length = 0;
    const children: HTMLElement[] = [];
    const count = map.categoryCount();
    for (let index = 0; index < count; index += 1) {
      const category = map.getCategory(index);
      if (category === null) continue;
      const group = make(doc, 'div', 'gm-hud__category-group');
      group.dataset['name'] = category.name;
      const line = make(doc, 'div', 'gm-hud__category-line');

      const row = makeButton(doc, 'gm-hud__category-row');
      row.dataset['name'] = category.name;
      if (category.description !== undefined) row.title = category.description;
      const swatch = make(doc, 'span', 'gm-hud__category-swatch');
      swatch.style.border = `1px solid ${cssColor(category.color)}`;
      const name = make(doc, 'span', 'gm-hud__category-name');
      name.textContent = category.name;
      const countText = make(doc, 'span', 'gm-hud__category-count');
      // The count reads the primary category and every secondary one, because the
      // row's switch brings a system back through any category it belongs to.
      countText.textContent = formatWhole(byCategory.get(category.name)?.length ?? 0);
      row.append(swatch, name, countText);
      row.addEventListener('click', () => {
        map.setCategoryVisible(category.name, !map.isCategoryVisible(category.name));
        update();
      });

      const expand = makeButton(doc, 'gm-hud__category-expand');
      expand.dataset['name'] = category.name;
      expand.appendChild(makeExpandIcon(doc));
      expand.addEventListener('click', () => {
        expanded = expanded === category.name ? null : category.name;
        renderExpandedList();
      });

      line.append(row, expand);
      const systemList = make(doc, 'div', 'gm-hud__system-list');
      systemList.hidden = true;
      group.append(line, systemList);
      children.push(group);
      groups.push({
        name: category.name,
        row,
        swatch,
        expand,
        list: systemList,
        color: category.color,
      });
    }
    if (expanded !== null && !groups.some((group) => group.name === expanded)) {
      expanded = null;
    }
    replaceChildrenKeepingFocus(list, children);
    dataSignature = `${map.categoryCount()}:${map.systemCount()}`;
    filterSignature = map.getNameFilter();
    renderExpandedList();
    restoreFocus(element, mark);
  }

  /** Writes the state of every control. Each write happens only on a change. */
  function update(): void {
    const selection = map.getSelection();
    const selected = selection === null ? null : (selection.id64 ?? selection.name);
    for (const group of groups) {
      const on = map.isCategoryVisible(group.name);
      setPressed(group.row, on);
      setStyle(group.swatch, 'background', on ? cssColor(group.color) : 'transparent');
      setStyle(
        group.swatch,
        'box-shadow',
        on ? `0 0 10px ${cssColor(group.color)}` : 'none',
      );
      setStyle(group.swatch, 'opacity', on ? '1' : '0.5');
      for (const row of group.list.children) {
        if (!(row instanceof HTMLElement)) continue;
        const identity = row.dataset['identity'];
        if (identity === undefined) continue;
        setAttribute(row, 'aria-current', identity === selected ? 'true' : 'false');
      }
    }
  }

  return {
    element,
    rebuild,
    update,
    poll(): void {
      const nextData = `${map.categoryCount()}:${map.systemCount()}`;
      if (nextData !== dataSignature) {
        rebuild();
        return;
      }
      const nextFilter = map.getNameFilter();
      if (nextFilter !== filterSignature) {
        filterSignature = nextFilter;
        renderExpandedList();
        return;
      }
      update();
    },
    dispose(): void {
      if (filterTimer !== null) {
        clearTimeout(filterTimer);
        filterTimer = null;
      }
    },
  };
}
