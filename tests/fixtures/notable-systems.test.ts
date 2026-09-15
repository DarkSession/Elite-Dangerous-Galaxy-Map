// Holds the Notable Systems conversion rules of `scripts/build-demo-systems.mjs`
// against a committed extract of the dump. The test reads the extract and not the live
// dump, so it runs on a clean checkout and reaches no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../../src/scene-data/real-systems';
import type { CategoryInput } from '../../src/scene-data/real-systems';
import {
  convertNotable,
  plainTextFromHtml,
} from '../../scripts/build-demo-systems.mjs';

const extract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./notable-systems-extract.json', import.meta.url)),
    'utf8',
  ),
) as unknown[];

const expected = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./notable-systems-demo-set.json', import.meta.url)),
    'utf8',
  ),
) as unknown;

describe('the conversion of the notable systems dump', () => {
  test('gives the committed output over the committed extract', () => {
    expect(convertNotable(extract)).toEqual(expected);
  });

  test('reads 7 records over 7 systems and 4 categories', () => {
    expect(extract).toHaveLength(7);
    const set = convertNotable(extract);
    expect(set.systems).toHaveLength(7);
    expect(set.categories.map((category) => category.name)).toEqual([
      'INRA',
      'Guardian',
      'Thargoid',
      'Human',
    ]);
  });

  test('names the system and not the entry', () => {
    const records = [
      {
        category: 'INRA',
        entry_name: 'Almeida Landing',
        system: 'Conn',
        x: '1',
        y: '2',
        z: '3',
        html: '<p>A base.</p>',
      },
    ];

    const system = convertNotable(records).systems[0];

    expect(system?.name).toBe('Conn');
  });

  test('gives a subject the table does not name the other category', () => {
    const records = [
      {
        category: 'Mystery',
        system: 'Odd',
        x: '1',
        y: '2',
        z: '3',
        html: '<p>A record.</p>',
      },
    ];

    const system = convertNotable(records).systems[0];

    expect(system?.primaryCategory).toBe('Other');
  });

  test('holds no markup in any description', () => {
    for (const system of convertNotable(extract).systems) {
      const description = system.description ?? '';
      expect(description.includes('<')).toBe(false);
      expect(description.includes('>')).toBe(false);
    }
  });

  test('turns two paragraphs, a link and an entity into plain text', () => {
    const records = [
      {
        category: 'Human',
        system: 'Sol',
        x: '0',
        y: '0',
        z: '0',
        html:
          '<p>The first line, Sol &amp; the Federation.</p>' +
          '<p>The second line with <a href="https://example.test/page">a link</a>.</p>',
      },
    ];

    const description = convertNotable(records).systems[0]?.description ?? '';

    expect(description).toBe(
      'The first line, Sol & the Federation.\n\nThe second line with a link.',
    );
    expect(description.includes('&')).toBe(true);
    expect(description.includes('<')).toBe(false);
    expect(description.includes('>')).toBe(false);
  });
});

describe('the plain text of an html field', () => {
  test('joins the paragraphs with a blank line', () => {
    expect(plainTextFromHtml('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
  });

  test('reads a line break as a paragraph break', () => {
    expect(plainTextFromHtml('One<br>Two')).toBe('One\n\nTwo');
  });

  test('decodes the named and the numeric references', () => {
    expect(plainTextFromHtml('<p>A&nbsp;B &amp; C &#39;D&#39;</p>')).toBe(
      "A B & C 'D'",
    );
  });

  test('keeps no angle bracket a reference decodes to', () => {
    expect(plainTextFromHtml('<p>a &lt;b&gt; c</p>')).toBe('a b c');
  });

  test('keeps the text of a link and drops a picture', () => {
    expect(plainTextFromHtml('<p><a href="x">Name</a><img src="y"></p>')).toBe('Name');
  });

  test('gives an empty text for an empty field', () => {
    expect(plainTextFromHtml(undefined)).toBe('');
    expect(plainTextFromHtml('<p></p>')).toBe('');
  });
});

describe('the reader over the converted fixture', () => {
  test('emits records the reader accepts whole', () => {
    const set = createSystemSet();
    const converted = convertNotable(extract);

    const categories = set.addCategories(
      converted.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(converted.systems);

    expect(categories.rejected).toEqual([]);
    expect(systems.rejected).toEqual([]);
    expect(systems.added).toBe(converted.systems.length);
  });
});
