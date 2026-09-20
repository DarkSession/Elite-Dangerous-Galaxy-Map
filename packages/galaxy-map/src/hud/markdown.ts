// The Markdown subset the information panel draws. `parseMarkdown` gives plain data and
// `renderMarkdown` walks that data and builds DOM nodes one at a time.
//
// The module sets no `innerHTML` and parses no HTML. Raw HTML in the source draws as
// text, so a description from an untrusted dump carries no markup into the page.
//
// The split is what makes the subset testable: every rule of the subset is a unit test
// over `parseMarkdown`, which needs no DOM.

/** One part of a line. */
export type MdInline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'break' }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly parts: readonly MdInline[] }
  | { readonly kind: 'emphasis'; readonly parts: readonly MdInline[] }
  | {
      readonly kind: 'link';
      readonly url: string;
      readonly parts: readonly MdInline[];
    };

/** One paragraph. Its lines are joined by hard line breaks. */
export interface MdParagraph {
  readonly kind: 'paragraph';
  readonly parts: readonly MdInline[];
}

/** One bullet list or one numbered list. A bullet list starts at 1 and shows no number. */
export interface MdList {
  readonly kind: 'bullets' | 'numbers';
  /** The number of the first item of a numbered list. */
  readonly start: number;
  readonly items: readonly (readonly MdInline[])[];
}

/** One block of the text. Nothing else is a block. */
export type MdBlock = MdParagraph | MdList;

/** The characters a backslash escapes. An escape draws that one character as text. */
const MARKERS = '\\`*[]()';

/** The characters that may open a mark. The scan reads plain text up to the next one. */
const OPENERS = '\\`*[';

/** A line that holds whitespace alone, which splits the blocks. */
const BLANK = /^\s*$/;

/** A bullet item: up to three spaces, then `- ` or `* `. */
const BULLET = /^ {0,3}[-*] (.*)$/;

/** A numbered item: up to three spaces, then digits, a point and a space. */
const NUMBERED = /^ {0,3}(\d+)\. (.*)$/;

/** Adds text, and joins it to the text part before it, so a run of text is one part. */
function pushText(parts: MdInline[], text: string): void {
  if (text === '') return;
  const last = parts[parts.length - 1];
  if (last !== undefined && last.kind === 'text') {
    parts[parts.length - 1] = { kind: 'text', text: last.text + text };
    return;
  }
  parts.push({ kind: 'text', text });
}

/**
 * The last answer of a close scan for each mark, inside one `parseInline` call. One call
 * of `parseInline` keeps its own memos, and a call it makes on a part of its own text
 * keeps its own too.
 */
type Closes = Map<string, number>;

/**
 * Where `mark` closes, counted from `from`, or -1. An escaped marker is not a close,
 * because the escape draws the character.
 *
 * `memo` holds the last answer for this mark. The caller reads its text from left to
 * right and handles the escapes itself, so `from` never goes down and it never points
 * inside an escape pair. Two rules follow:
 *
 * - a held position at or after `from` is still the answer, because the scan that found
 *   it saw no earlier mark;
 * - a held -1 is the answer for every later `from`.
 *
 * Where neither rule holds, the scan starts after the last close it found. The scans of
 * one line therefore read the line once in total, and a mark with no partner costs one
 * scan rather than one scan for each opener.
 */
function findClose(text: string, from: number, mark: string, memo: Closes): number {
  const held = memo.get(mark);
  if (held !== undefined && (held < 0 || from <= held)) return held;
  let index = from;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text.startsWith(mark, index)) {
      memo.set(mark, index);
      return index;
    }
    index += 1;
  }
  memo.set(mark, -1);
  return -1;
}

/**
 * Where the URL of a link ends, counted from `from`, or -1. A `)` ends it, and an escape
 * does not hold it back, because the URL draws as it stands.
 *
 * `memo` follows the two rules of `findClose`, for the same reason.
 */
function findEnd(text: string, from: number, memo: Closes): number {
  const held = memo.get(')');
  if (held !== undefined && (held < 0 || from <= held)) return held;
  const close = text.indexOf(')', from);
  memo.set(')', close);
  return close;
}

/**
 * True where the library draws the URL as a link. The URL holds no whitespace and no
 * control character, and its scheme is `http` or `https` or it carries no scheme, which
 * is a relative URL. Every other URL draws as text: a `javascript:` or a `data:` URL
 * from an untrusted dump would run or embed what the host did not mean to serve.
 */
function isDrawableUrl(url: string): boolean {
  if (url === '' || /\s/.test(url)) return false;
  // A browser drops a control character when it resolves an `href`, and `\s` holds only
  // some of them. A URL that starts with one would reach the scheme test below as a
  // relative URL, and `javascript:` behind a null character would draw as a link.
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index);
    if (code < 0x21 || code === 0x7f) return false;
  }
  const scheme = /^([A-Za-z][A-Za-z\d+.-]*):/.exec(url);
  if (scheme === null) return true;
  const name = (scheme[1] as string).toLowerCase();
  return name === 'http' || name === 'https';
}

/** One part the scan read, and where the scan goes on. */
interface Read {
  readonly part: MdInline;
  readonly end: number;
}

/**
 * Reads `[label](url)` at `index`, or null where the source is not a link the library
 * draws. Null leaves the `[` as text and the scan goes on one character later, so an
 * unusable link draws as its own characters.
 */
function readLink(
  text: string,
  index: number,
  memo: Closes,
  ends: Closes,
): Read | null {
  const label = findClose(text, index + 1, ']', memo);
  if (label < 0 || label === index + 1) return null;
  if (text[label + 1] !== '(') return null;
  const close = findEnd(text, label + 2, ends);
  if (close < 0) return null;
  const url = text.slice(label + 2, close);
  if (!isDrawableUrl(url)) return null;
  // A link holds no link, so the label is read with the link rule turned off.
  return {
    part: {
      kind: 'link',
      url,
      parts: parseInline(text.slice(index + 1, label), false),
    },
    end: close + 1,
  };
}

/** Reads a strong or an emphasis mark at `index`, or null where the mark has no partner. */
function readMark(
  text: string,
  index: number,
  mark: string,
  kind: 'strong' | 'emphasis',
  links: boolean,
  memo: Closes,
): Read | null {
  const from = index + mark.length;
  const close = findClose(text, from, mark, memo);
  if (close < 0 || close === from) return null;
  return {
    part: { kind, parts: parseInline(text.slice(from, close), links) },
    end: close + mark.length,
  };
}

/**
 * Reads one line into inline parts. The order is escape, code, link, strong, emphasis.
 * Code comes before link, which keeps a bracket inside a code span from opening a link.
 *
 * `_` is never a mark: system names such as `Col 285 Sector XY_Z` carry one.
 *
 * `links` is false inside a link label, because a link holds no link.
 */
function parseInline(text: string, links: boolean): MdInline[] {
  const parts: MdInline[] = [];
  const closes: Closes = new Map();
  const ends: Closes = new Map();
  let index = 0;
  while (index < text.length) {
    const letter = text[index] as string;
    if (letter === '\\') {
      const next = text[index + 1];
      if (next !== undefined && MARKERS.includes(next)) {
        pushText(parts, next);
        index += 2;
        continue;
      }
      pushText(parts, letter);
      index += 1;
      continue;
    }
    if (letter === '`') {
      // A code span holds no other mark: every character to the closing backtick is its
      // text.
      const close = text.indexOf('`', index + 1);
      if (close > index + 1) {
        parts.push({ kind: 'code', text: text.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
      pushText(parts, letter);
      index += 1;
      continue;
    }
    if (letter === '[' && links) {
      const link = readLink(text, index, closes, ends);
      if (link !== null) {
        parts.push(link.part);
        index = link.end;
        continue;
      }
      pushText(parts, letter);
      index += 1;
      continue;
    }
    if (letter === '*') {
      const strong = text.startsWith('**', index)
        ? readMark(text, index, '**', 'strong', links, closes)
        : null;
      if (strong !== null) {
        parts.push(strong.part);
        index = strong.end;
        continue;
      }
      const emphasis = readMark(text, index, '*', 'emphasis', links, closes);
      if (emphasis !== null) {
        parts.push(emphasis.part);
        index = emphasis.end;
        continue;
      }
      pushText(parts, letter);
      index += 1;
      continue;
    }
    // Plain text up to the next character that may open a mark. This walk reads the line
    // once. The scans for a close read it once more in total, because `findClose` and
    // `findEnd` hold their last answer in `closes` and `ends`. The cost of the line is
    // therefore linear in its length.
    let next = index + 1;
    while (next < text.length && !OPENERS.includes(text[next] as string)) next += 1;
    pushText(parts, text.slice(index, next));
    index = next;
  }
  return parts;
}

/** The parts of a plain run, whose lines are joined by hard line breaks. */
function paragraphParts(lines: readonly string[]): MdInline[] {
  const parts: MdInline[] = [];
  for (const [order, line] of lines.entries()) {
    if (order > 0) parts.push({ kind: 'break' });
    parts.push(...parseInline(line, true));
  }
  return parts;
}

/**
 * Reads the text into blocks. The text splits at a line that holds whitespace alone, and
 * each block splits further into runs of consecutive lines of one kind.
 *
 * A line that starts with `#`, `>`, `|` or four spaces is plain text, and its marker
 * draws as text. A list holds no nested list, because indentation carries no meaning.
 */
export function parseMarkdown(text: string): readonly MdBlock[] {
  const blocks: MdBlock[] = [];
  let plain: string[] = [];
  let items: string[] = [];
  let listKind: 'bullets' | 'numbers' | null = null;
  let start = 1;

  const endPlain = (): void => {
    if (plain.length === 0) return;
    blocks.push({ kind: 'paragraph', parts: paragraphParts(plain) });
    plain = [];
  };
  const endList = (): void => {
    if (listKind === null) return;
    blocks.push({
      kind: listKind,
      start,
      items: items.map((item) => parseInline(item, true)),
    });
    items = [];
    listKind = null;
  };
  const addItem = (kind: 'bullets' | 'numbers', item: string, first: number): void => {
    endPlain();
    if (listKind !== kind) {
      endList();
      listKind = kind;
      start = first;
    }
    items.push(item);
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (BLANK.test(line)) {
      endPlain();
      endList();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet !== null) {
      addItem('bullets', bullet[1] as string, 1);
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered !== null) {
      addItem('numbers', numbered[2] as string, Number(numbered[1]));
      continue;
    }
    endList();
    plain.push(line);
  }
  endPlain();
  endList();
  return blocks;
}

/** Builds the nodes of one run of inline parts under `parent`. */
function appendInline(doc: Document, parent: Node, parts: readonly MdInline[]): void {
  for (const part of parts) {
    if (part.kind === 'text') {
      parent.appendChild(doc.createTextNode(part.text));
      continue;
    }
    if (part.kind === 'break') {
      parent.appendChild(doc.createElement('br'));
      continue;
    }
    if (part.kind === 'code') {
      const code = doc.createElement('code');
      code.appendChild(doc.createTextNode(part.text));
      parent.appendChild(code);
      continue;
    }
    if (part.kind === 'link') {
      const anchor = doc.createElement('a');
      // The attribute holds what the source gave. A link opens in a new browsing
      // context and carries `rel="noreferrer noopener"`, so a host's page is never
      // reached through the opener.
      anchor.setAttribute('href', part.url);
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noreferrer noopener');
      appendInline(doc, anchor, part.parts);
      parent.appendChild(anchor);
      continue;
    }
    const mark = doc.createElement(part.kind === 'strong' ? 'strong' : 'em');
    appendInline(doc, mark, part.parts);
    parent.appendChild(mark);
  }
}

/** Fills a list element with one element per item. */
function fillItems(
  doc: Document,
  list: HTMLElement,
  items: readonly (readonly MdInline[])[],
): void {
  for (const item of items) {
    const entry = doc.createElement('li');
    appendInline(doc, entry, item);
    list.appendChild(entry);
  }
}

/**
 * Builds the nodes of the text. The walk calls `createElement` and `createTextNode` and
 * nothing else, so no source text is ever read as HTML.
 */
export function renderMarkdown(doc: Document, text: string): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const block of parseMarkdown(text)) {
    if (block.kind === 'paragraph') {
      const paragraph = doc.createElement('p');
      appendInline(doc, paragraph, block.parts);
      fragment.appendChild(paragraph);
      continue;
    }
    if (block.kind === 'numbers') {
      const list = doc.createElement('ol');
      list.start = block.start;
      fillItems(doc, list, block.items);
      fragment.appendChild(list);
      continue;
    }
    const list = doc.createElement('ul');
    fillItems(doc, list, block.items);
    fragment.appendChild(list);
  }
  return fragment;
}
