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

/**
 * The most system rows the open lists hold together. The open lists share it, so the
 * HUD's node count follows neither the size of the set nor the count of open lists.
 */
export const MAX_SYSTEM_ROWS = 200;

/** What the panel keeps about one system, so it does not read the set again. */
interface Entry {
  readonly name: string;
  readonly identity: string;
}

/** One category and the names of the systems it holds, as `matchingCategories` reads it. */
export interface CategorySystems {
  readonly name: string;
  readonly systems: readonly string[];
}

/**
 * The categories that hold at least one system the filter keeps. A search opens every
 * one of them, so the answer to a search is never inside a folded row.
 *
 * The comparison is the one the map itself makes: the text is not trimmed and the match
 * is not case sensitive. A trim here would open a row whose marker the map does not draw.
 */
export function matchingCategories(
  filter: string,
  groups: readonly CategorySystems[],
): Set<string> {
  const text = filter.toLowerCase();
  const open = new Set<string>();
  for (const group of groups) {
    const holds = group.systems.some((name) => name.toLowerCase().includes(text));
    if (holds) open.add(group.name);
  }
  return open;
}

/**
 * The rows one open list shows. `openCount` is the count of open lists and `index` is
 * the place of this list among them, in the panel's own order.
 *
 * The open lists share the budget, at `floor(200 / open)` rows each. Where that share is
 * 0, which a filter that matches in more than 200 categories reaches, the first 200 open
 * lists hold one row each and every open list past the 200th holds none.
 */
export function rowShare(openCount: number, index: number): number {
  if (openCount <= 0) return 0;
  const share = Math.floor(MAX_SYSTEM_ROWS / openCount);
  if (share > 0) return share;
  return index < MAX_SYSTEM_ROWS ? 1 : 0;
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
  // The categories whose lists are open. It is state and not a reading of the filter
  // text: a change of the text writes it, the expand button writes it, and a rebuild of
  // the panel only reads it. The panel is rebuilt on every camera move, so a set worked
  // out from the text on each rebuild would undo the user's fold on the next frame.
  const open = new Set<string>();
  // The category the user last expanded by hand. Clearing the box gives the panel back
  // to that one, and to none where the user expanded none.
  let handExpanded: string | null = null;
  let dataSignature = '';
  let filterSignature = '';
  let filterTimer: number | null = null;

  /**
   * Writes the open set from the filter text. A text that is not empty opens every
   * category that holds a match, including one the user turned off, because a click on
   * one of its rows turns it back on. An empty text gives the panel back to the one
   * category the user last expanded by hand.
   */
  function seedOpen(filter: string): void {
    open.clear();
    if (filter === '') {
      if (handExpanded !== null) open.add(handExpanded);
      return;
    }
    const held: CategorySystems[] = groups.map((group) => ({
      name: group.name,
      systems: (byCategory.get(group.name) ?? []).map((entry) => entry.name),
    }));
    for (const name of matchingCategories(filter, held)) open.add(name);
  }

  /** Gives the box's text to the filter and renders the lists again. */
  const applyFilter = (): void => {
    filterTimer = null;
    map.setNameFilter(search.value);
    seedOpen(map.getNameFilter());
    renderOpenLists();
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
      const entry: Entry = {
        name: system.name,
        identity: system.id64 ?? system.name,
      };
      // The system goes in every category it names. The row's switch brings the
      // system back through any of them, so the row's count and its list say so.
      addEntry(system.primaryCategory, entry);
      for (const name of system.secondaryCategories) addEntry(name, entry);
    }
  }

  /** The systems of one category the filter keeps, in order of name. */
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

  /**
   * Fills the list of every open category and empties every other list.
   *
   * The open lists share the row budget, at `floor(200 / open)` rows each, so the HUD's
   * node count does not follow the count of open lists. Where that share is 0, which a
   * filter matching in more than 200 categories reaches, the first 200 open lists in the
   * panel's own order hold one row each and the rest hold none. A list that holds no row
   * still says how many systems it has, so the user narrows the filter to read it.
   */
  function renderOpenLists(): void {
    const openCount = groups.reduce(
      (count, group) => (open.has(group.name) ? count + 1 : count),
      0,
    );
    let openIndex = 0;
    for (const group of groups) {
      const isOpen = open.has(group.name);
      setAttribute(group.expand, 'aria-expanded', isOpen ? 'true' : 'false');
      setAttribute(
        group.expand,
        'aria-label',
        isOpen ? 'Hide systems' : 'List systems',
      );
      setAttribute(group.expand, 'title', isOpen ? 'Hide systems' : 'List systems');
      setShown(group.list, isOpen);
      if (!isOpen) {
        if (group.list.childElementCount > 0) {
          replaceChildrenKeepingFocus(group.list, []);
        }
        continue;
      }
      const cap = rowShare(openCount, openIndex);
      openIndex += 1;
      const entries = entriesOf(group.name);
      const shown = Math.min(entries.length, cap);
      const children: HTMLElement[] = [];
      for (let index = 0; index < shown; index += 1) {
        const entry = entries[index] as Entry;
        const row = makeButton(doc, 'gm-hud__system-row');
        row.dataset['name'] = entry.name;
        row.dataset['identity'] = entry.identity;
        const name = make(doc, 'span', 'gm-hud__system-name');
        name.textContent = entry.name;
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
    // `renderOpenLists` fills them.
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
        const name = category.name;
        if (open.has(name)) {
          open.delete(name);
          if (handExpanded === name) handExpanded = null;
        } else {
          // At most one category is open while the box is empty. While it holds text
          // the button adds or removes one name, so a list the user folds during a
          // search stays folded until the text changes again.
          if (map.getNameFilter() === '') open.clear();
          open.add(name);
          handExpanded = name;
        }
        renderOpenLists();
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
    replaceChildrenKeepingFocus(list, children);
    dataSignature = `${map.categoryCount()}:${map.systemCount()}`;
    filterSignature = map.getNameFilter();
    // The rebuild reads the open set and never writes it. A name of a category that is
    // gone opens no list, because the render reads the groups the panel holds.
    renderOpenLists();
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
        // A host that writes the filter changes the text, so the open set follows it as
        // it follows the search box.
        seedOpen(nextFilter);
        renderOpenLists();
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
