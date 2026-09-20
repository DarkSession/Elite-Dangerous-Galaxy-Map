// The Markdown subset, read with no DOM. `parseMarkdown` gives plain data, so every rule
// of the subset is a unit test here. The browser suite reads the elements the render
// builds.
import { describe, expect, test } from 'vitest';
import { parseMarkdown } from './markdown';
import type { MdBlock, MdInline } from './markdown';
import { TIMED_TEST } from '../../../../tests/timed';

/** The text of a run of parts, with a hard line break read as a newline. */
function textOf(parts: readonly MdInline[]): string {
  let out = '';
  for (const part of parts) {
    if (part.kind === 'text' || part.kind === 'code') out += part.text;
    else if (part.kind === 'break') out += '\n';
    else out += textOf(part.parts);
  }
  return out;
}

/** The kinds of the parts of a block, in order. */
function kindsOf(parts: readonly MdInline[]): string[] {
  return parts.map((part) => part.kind);
}

/** The parts of one paragraph, which the test states the block is. */
function paragraphOf(blocks: readonly MdBlock[], index = 0): readonly MdInline[] {
  const block = blocks[index] as MdBlock;
  expect(block.kind).toBe('paragraph');
  return block.kind === 'paragraph' ? block.parts : [];
}

describe('the blocks', () => {
  test('a blank line splits the paragraphs and a newline breaks the line', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(kindsOf(paragraphOf(blocks, 0))).toEqual(['text', 'break', 'text']);
    expect(textOf(paragraphOf(blocks, 0))).toBe('one\ntwo');
    expect(textOf(paragraphOf(blocks, 1))).toBe('three');
  });

  test('a run of items draws a list beside its paragraph', () => {
    const blocks = parseMarkdown('Notes:\n- one\n- two\n\n3. third\n4. fourth');
    expect(blocks.map((block) => block.kind)).toEqual([
      'paragraph',
      'bullets',
      'numbers',
    ]);
    expect(textOf(paragraphOf(blocks, 0))).toBe('Notes:');
    const bullets = blocks[1] as MdBlock;
    const numbers = blocks[2] as MdBlock;
    if (bullets.kind === 'paragraph' || numbers.kind === 'paragraph') return;
    expect(bullets.items.map(textOf)).toEqual(['one', 'two']);
    expect(numbers.items.map(textOf)).toEqual(['third', 'fourth']);
    expect(numbers.start).toBe(3);
  });

  test('an unsupported block marker draws as text', () => {
    const blocks = parseMarkdown('# Title\n> quote\n    indented');
    expect(blocks).toHaveLength(1);
    expect(textOf(paragraphOf(blocks))).toBe('# Title\n> quote\n    indented');
  });

  test('a star at the head of a line opens a bullet item', () => {
    const blocks = parseMarkdown('* one\n* two');
    const list = blocks[0] as MdBlock;
    expect(list.kind).toBe('bullets');
    if (list.kind !== 'paragraph')
      expect(list.items.map(textOf)).toEqual(['one', 'two']);
  });

  test('the text of no line gives no block', () => {
    expect(parseMarkdown('')).toHaveLength(0);
    expect(parseMarkdown('   \n\n  ')).toHaveLength(0);
  });
});

describe('the inline marks', () => {
  test('the marks draw the elements they name', () => {
    const blocks = parseMarkdown(
      'A hub with **bold** and *thin* and `code` and [EDSM](https://edsm.net).',
    );
    const parts = paragraphOf(blocks);
    expect(kindsOf(parts)).toEqual([
      'text',
      'strong',
      'text',
      'emphasis',
      'text',
      'code',
      'text',
      'link',
      'text',
    ]);
    const strong = parts[1] as MdInline;
    const emphasis = parts[3] as MdInline;
    const code = parts[5] as MdInline;
    const link = parts[7] as MdInline;
    expect(textOf([strong])).toBe('bold');
    expect(textOf([emphasis])).toBe('thin');
    expect(textOf([code])).toBe('code');
    expect(textOf([link])).toBe('EDSM');
    expect(link.kind === 'link' ? link.url : '').toBe('https://edsm.net');
  });

  test('an underscore is not a mark', () => {
    const source = 'Col 285 Sector XY_Z and __both__';
    const parts = paragraphOf(parseMarkdown(source));
    expect(kindsOf(parts)).toEqual(['text']);
    expect(textOf(parts)).toBe(source);
  });

  test('an unmatched mark draws as itself', () => {
    const source = 'one * two [label] three ` four';
    const parts = paragraphOf(parseMarkdown(source));
    expect(kindsOf(parts)).toEqual(['text']);
    expect(textOf(parts)).toBe(source);
  });

  test('an escape draws the marker', () => {
    const parts = paragraphOf(parseMarkdown('\\*not italic\\* \\\\ \\`'));
    expect(kindsOf(parts)).toEqual(['text']);
    expect(textOf(parts)).toBe('*not italic* \\ `');
  });

  test('a code span holds no other mark', () => {
    const parts = paragraphOf(parseMarkdown('`[a](b) **c**`'));
    expect(kindsOf(parts)).toEqual(['code']);
    expect(textOf(parts)).toBe('[a](b) **c**');
  });

  test('a link takes the scheme rule', () => {
    // A browser drops a leading control character when it resolves an `href`, so the
    // last two sources reach `javascript:` as well.
    const sources = [
      '[a](https://edsm.net)',
      '[b](/local/page)',
      '[c](javascript:alert(1))',
      '[d](http://a b)',
      '[e](\u0000javascript:alert(1))',
      '[f](\u0001javascript:alert(1))',
    ];
    const kinds = sources.map((source) => kindsOf(paragraphOf(parseMarkdown(source))));
    expect(kinds[0]).toEqual(['link']);
    expect(kinds[1]).toEqual(['link']);
    expect(kinds[2]).toEqual(['text']);
    expect(kinds[3]).toEqual(['text']);
    expect(kinds[4]).toEqual(['text']);
    expect(kinds[5]).toEqual(['text']);
    expect(textOf(paragraphOf(parseMarkdown(sources[2] as string)))).toBe(sources[2]);
    expect(textOf(paragraphOf(parseMarkdown(sources[3] as string)))).toBe(sources[3]);
  });

  test('an image mark draws its label by the link rule', () => {
    const parts = paragraphOf(parseMarkdown('![alt](https://edsm.net/a.png)'));
    expect(kindsOf(parts)).toEqual(['text', 'link']);
    expect(textOf([parts[0] as MdInline])).toBe('!');
  });

  test('raw HTML draws as text', () => {
    const source = '<b>bold</b><script>alert(1)</script>';
    const parts = paragraphOf(parseMarkdown(source));
    expect(kindsOf(parts)).toEqual(['text']);
    expect(textOf(parts)).toBe(source);
  });
});

/** One paragraph, one bullet list and one numbered list, with every inline mark. */
function sampleText(): string {
  return (
    'The **hub** of the *Inner Orion Spur* holds `Sol` and [EDSM](https://edsm.net).\n' +
    'A second line of the same paragraph, with an escape \\* and an underscore a_b.\n' +
    '\n' +
    '- one item with **bold**\n' +
    '- one item with a [link](/local/page)\n' +
    '\n' +
    '1. first\n' +
    '2. second\n' +
    '\n'
  );
}

/** Text of about `length` characters, built from the sample. */
function textOfLength(length: number): string {
  const sample = sampleText();
  return sample.repeat(Math.ceil(length / sample.length)).slice(0, length);
}

/** The shortest of five parses, in milliseconds. A timing takes the best reading. */
function timeParse(text: string): number {
  let best = Infinity;
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now();
    parseMarkdown(text);
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe('the time bound', () => {
  test('a long description parses inside the bound', TIMED_TEST, () => {
    const text = textOfLength(50_000);
    expect(text).toHaveLength(50_000);
    expect(timeParse(text)).toBeLessThanOrEqual(50);
  });

  // A mark with no partner takes the scan to the end of the line. A line of openers is
  // therefore the shape that a parser with one scan for each opener reads over and over.
  test('a line of openers parses inside the bound', () => {
    const lines = [
      '['.repeat(50_000),
      `${'a'.repeat(19)}[`.repeat(2_500),
      '*'.repeat(50_000),
      '[a]('.repeat(12_500),
    ];
    for (const line of lines) {
      expect(line).toHaveLength(50_000);
      expect(timeParse(line)).toBeLessThanOrEqual(50);
    }
  });

  // The bound fails a parser whose cost grows with the square of the length.
  test('the parse cost follows the length', TIMED_TEST, () => {
    const short = textOfLength(10_000);
    const long = short.repeat(8);
    // One parse of each first, so neither timing pays for the first run of the code.
    parseMarkdown(short);
    parseMarkdown(long);
    const shortMs = timeParse(short);
    const longMs = timeParse(long);
    expect(longMs).toBeLessThanOrEqual(shortMs * 16);
  });
});
