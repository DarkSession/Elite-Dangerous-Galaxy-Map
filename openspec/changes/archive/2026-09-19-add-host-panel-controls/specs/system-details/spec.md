## Purpose

States the Markdown subset the library draws, and how a host gives the map a description
and extra values for one system, either in the record or through a loader the map calls
when the user opens the panel.

## ADDED Requirements

### Requirement: The library draws a stated Markdown subset

The library SHALL draw a description as Markdown, in the subset this requirement states.
It SHALL build DOM nodes one at a time. It SHALL NOT set `innerHTML`, SHALL NOT parse the
text as HTML, and SHALL NOT take an HTML string from a host in any field. Raw HTML in the
source, as `<b>x</b>`, SHALL draw as the text `<b>x</b>`.

**The blocks.** The text SHALL split into blocks at a line that holds whitespace alone.
Each block SHALL split further into runs of consecutive lines of one kind. A line is:

- a **bullet item** when it starts with up to three spaces, then `- ` or `* `;
- a **numbered item** when it starts with up to three spaces, then one or more digits, a
  `.`, and a space;
- **plain** otherwise.

A run of bullet items SHALL draw as a bullet list, one item per line. A run of numbered
items SHALL draw as a numbered list that starts at the first item's number. A plain run
SHALL draw as one paragraph whose lines are joined by **hard line breaks**. Nothing else
is a block: a line that starts with `#`, `>`, `|` or four spaces is plain text, and its
marker draws as text. A list holds no nested list, because indentation carries no meaning.

**The inline marks.** Inside an item and a paragraph the library SHALL read, in this
order:

| Mark          | Source          | Result                                  |
| ------------- | --------------- | --------------------------------------- |
| escape        | `\` + a marker  | the marker character alone, as text     |
| code          | `` `x` ``       | a code span, with no other mark inside  |
| link          | `[label](url)`  | a link whose text is `label`            |
| strong        | `**x**`         | bold text                               |
| emphasis      | `*x*`           | italic text                             |

The escape SHALL cover `\`, `` ` ``, `*`, `[`, `]`, `(` and `)`, and SHALL draw that one
character. Strong, emphasis and a link label MAY hold the other marks. A code span SHALL
hold none: every character to the closing backtick is its text.

`_` SHALL NEVER be a mark. An underscore SHALL draw as itself, because system names such
as `Col 285 Sector XY_Z` carry one.

A mark with no partner SHALL draw as its own characters. `*` alone, `` ` `` alone, and a
`[label]` with no `(url)` after it draw as text and change nothing around them.

**A link's URL.** The URL runs from `(` to the first `)`. The library SHALL draw the link
as a link when the URL holds no whitespace and its scheme is `http` or `https`, or when it
carries no scheme, which is a relative URL. For every other URL the library SHALL draw the
**whole construct as text**, the brackets and the URL with it, and no link. The URL check
is the one `real-systems` already states for an image: a `javascript:` or a `data:` URL
from an untrusted dump would run or embed what the host did not mean to serve. The draw
follows the rule the rest of the subset takes, that a mark the parser does not honour draws
as its own characters. A refused URL stays in front of the reader; a label drawn alone
would hide that the library refused anything.

A link SHALL open in a new browsing context and SHALL carry `rel="noreferrer noopener"`,
so a host's page is never reached through the opener.

`![alt](url)` SHALL NOT draw an image. The `!` draws as text and the rest draws by the
link rule.

#### Scenario: The marks draw the elements they name

- **WHEN** a unit test parses a line that holds, in order, plain text, a strong mark
  around `bold`, an emphasis mark around `thin`, a code mark around `code`, and the link
  `[EDSM](https://edsm.net)`
- **THEN** the parse holds one paragraph whose parts are the text, a strong part, an
  emphasis part, a code part and a link part, each with the text between its marks

#### Scenario: Raw HTML draws as text

- **WHEN** a browser test selects a record whose description is
  `<b>bold</b><script>alert(1)</script>` and reads the description section
- **THEN** the section holds no `b` element and no `script` element, and its text reads
  `<b>bold</b><script>alert(1)</script>`

#### Scenario: A blank line splits the paragraphs and a newline breaks the line

- **WHEN** a unit test parses `one\ntwo\n\nthree`
- **THEN** the parse holds two paragraphs, the first holding `one`, a hard line break and
  `two`, and the second holding `three`

#### Scenario: A run of items draws a list beside its paragraph

- **WHEN** a unit test parses `Notes:\n- one\n- two\n\n3. third\n4. fourth`
- **THEN** the parse holds a paragraph of `Notes:`, a bullet list of two items, and a
  numbered list of two items that starts at 3

#### Scenario: An unsupported block marker draws as text

- **WHEN** a unit test parses `# Title\n> quote\n    indented`
- **THEN** the parse holds one paragraph whose text holds `# Title`, `> quote` and
  `    indented`, and no heading, no quote and no code block

#### Scenario: An underscore is not a mark

- **WHEN** a unit test parses `Col 285 Sector XY_Z and __both__`
- **THEN** the parse holds one paragraph of that text exactly, with no emphasis part

#### Scenario: An unmatched mark draws as itself

- **WHEN** a unit test parses a line that holds one `*` between two words, a `[label]`
  with no URL after it, and one backtick with no partner
- **THEN** the parse holds one paragraph whose text is the source exactly, with no
  emphasis part, no link part and no code part

#### Scenario: An escape draws the marker

- **WHEN** a unit test parses a line that holds an escaped star before and after
  `not italic`, then an escaped backslash, then an escaped backtick
- **THEN** the parse holds one paragraph whose text holds one star on each side of
  `not italic`, one backslash and one backtick, with no emphasis part and no code part

#### Scenario: A link takes the scheme rule

- **WHEN** a unit test parses four links whose URLs are `https://edsm.net`, `/local/page`,
  `javascript:alert(1)` and `http://a b`
- **THEN** the first two are link parts, and the last two are text that reads the source
  exactly

#### Scenario: A drawn link carries the safety attributes

- **WHEN** a browser test selects a record whose description holds
  `[EDSM](https://edsm.net)` and reads the anchor
- **THEN** its `href` is `https://edsm.net`, its `target` is `_blank` and its `rel` holds
  both `noreferrer` and `noopener`

### Requirement: The Markdown draw holds its time bound

The parse SHALL be linear in the length of the text and SHALL run once per description
drawn. The panel draws one description at a time, for the selected system alone, so a set
of 10,000 systems asks for at most one parse per selection. No parse SHALL run in a frame
the user did not open a panel in.

A description of **50,000 characters** SHALL parse in **50 ms** or less. The bound is
loose because the call is not in the frame loop; it is there to fail a parser whose cost
grows faster than the text.

#### Scenario: A long description parses inside the bound

- **WHEN** a unit test parses a description of 50,000 characters that holds paragraphs,
  lists, links and both emphasis marks, and times the call
- **THEN** the call takes 50 ms or less

#### Scenario: The parse cost follows the length

- **WHEN** a unit test times the parse of a description of 10,000 characters and of the
  same text repeated eight times
- **THEN** the second time is at most 16 times the first, which fails a parser whose cost
  grows with the square of the length

### Requirement: The host loads a system's details when the panel opens

`HudOptions` SHALL carry `details`, a function the host writes. It takes the selected
`RealSystem` and an `AbortSignal`, and returns a `SystemDetails`, a promise of one, or
null.

**The signal says the answer is no longer wanted.** The library SHALL abort it when the
selection changes and when the HUD is disposed, so a host that fetches passes the signal
to `fetch` and the request stops. A host that ignores the signal loses nothing: the
library drops the answer either way. An abort SHALL NOT be reported as a failure, so a
rejection whose reason is the abort SHALL NOT reach `console.warn`.

The panel SHALL call `details` **once for each system it opens on**, and SHALL NOT call it
per frame and SHALL NOT call it per record. It SHALL NOT call it while nothing is
selected. A rebuild of the panel for the same selected system SHALL reuse the answer it
already holds, so `refresh()` starts no second load.

**A promise that resolves after the selection changed SHALL be dropped**, by the rule the
region field already takes, so a slow load cannot write the details of a system the user
has left.

**While a promise runs**, the panel SHALL draw the description section title and a line
that reads `LOADING…`, and that line SHALL carry `aria-busy="true"`. A `details` that
returns a value and not a promise SHALL draw no loading line.

**A failure is not the map's failure.** A `details` that throws, and a promise that
rejects, SHALL NOT throw out of the HUD and SHALL NOT stop the frame loop. The library
SHALL report it with `console.warn`, as it does for a failed HUD action, and SHALL then
draw the record's own `description` and no extra values.

**The record is the fallback.** The panel SHALL draw `details.description` when the loader
gives one. It SHALL draw the record's `description` when the options carry no `details`,
when the loader returns null, and when the answer carries no description. A record with no
description and a loader that gives none SHALL draw no description section.

#### Scenario: The loader is called once for each system

- **WHEN** a browser test builds a map with a `details` loader that counts its calls,
  selects system A, calls `refresh()` twice, selects system B, then selects A again
- **THEN** the count is 3, and each call took the system that was selected

#### Scenario: The loaded description replaces the record's

- **WHEN** a browser test builds a map with a `details` loader that returns
  `{ description: '**loaded**' }`, adds a record whose `description` is `from the record`,
  selects it and reads the description section
- **THEN** the section holds a bold `loaded` and does not hold `from the record`

#### Scenario: A loader that gives no description falls back to the record

- **WHEN** a browser test builds a map with a `details` loader that returns `{}` and
  selects a record whose `description` is `from the record`
- **THEN** the section reads `from the record`

#### Scenario: A slow load shows the loading line

- **WHEN** a browser test builds a map with a `details` loader whose promise settles after
  200 ms, selects a system, and reads the description section before and after it settles
- **THEN** the first reading holds `LOADING…` and `aria-busy="true"`, and the second holds
  the loaded text and no `aria-busy`

#### Scenario: The signal aborts when the selection moves

- **WHEN** a browser test builds a map whose `details` holds the signal it was given,
  selects system A, selects system B, then calls `dispose`
- **THEN** the signal of the call for A aborted when B was selected, and the signal of the
  call for B aborted on the dispose

#### Scenario: An abort is not reported as a failure

- **WHEN** a browser test builds a map whose `details` returns a promise that rejects with
  the signal's abort reason, selects system A, selects system B, and reads the console
  warnings
- **THEN** no warning was written and the panel holds the details of B

#### Scenario: A stale answer is dropped

- **WHEN** a browser test builds a map with a `details` loader that settles after 200 ms
  for system A and at once for system B, selects A, selects B before A settles, and reads
  the panel after both have settled
- **THEN** the panel holds the details of B

#### Scenario: A failed load falls back and does not throw

- **WHEN** a browser test builds a map with a `details` loader that rejects, selects a
  record whose `description` is `from the record`, and reads the description section and
  the page's error count
- **THEN** the section reads `from the record`, the page reports no uncaught error, and
  the frame loop still runs

### Requirement: The library reads what the loader returns

A `SystemDetails` carries an optional `description` string, an optional `values` array and
an optional `actions` array. The library SHALL read what a host returns and SHALL drop what
it cannot read, because the answer may come from a network call the compiler does not see.

A `description` that is not a string SHALL be dropped, as an optional field of the wrong
type is dropped. A `values` that is not an array SHALL be dropped, and an `actions` that is
not an array SHALL be dropped.

Each entry of `values` SHALL carry:

| Field      | Type   | What it does                                        |
| ---------- | ------ | --------------------------------------------------- |
| `label`    | string | The name of the value. Required and not empty       |
| `value`    | string | Short text. The entry joins the field grid           |
| `markdown` | string | A body in the Markdown subset. The entry is a section |
| `copy`     | string | What a copy button beside `value` writes            |

The library SHALL drop an entry that is not an object, an entry whose `label` is not a
string, and an entry whose `label` is empty after its whitespace is trimmed. It SHALL drop
an entry that carries neither a `value` string nor a `markdown` string. An entry that
carries **both** SHALL draw as a section, because `markdown` is the longer form.

`copy` SHALL be kept for an entry the library draws in the grid and SHALL be dropped for a
section, because a section carries no copy button.

The library SHALL keep at most **12** entries, in the order the answer gave them, and
SHALL drop the rest. Twelve is the count the panel can show without the grid running past
the height of the panel at the smallest supported viewport.

Each entry of `actions` is a **`HudAction`**, the type the library exports for a footer
button. Each entry SHALL carry a `label` string that is not empty after its whitespace is
trimmed, and an `onSelect` function. The library SHALL drop an entry that is not an
object, an entry whose `label` fails that rule, and an entry whose `onSelect` is not a
function. It SHALL keep at most **6** entries, in the order the answer gave them, and SHALL
drop the rest. Six is the count the footer holds in one row at the smallest supported
viewport, beside the centre view button.

A dropped entry SHALL NOT drop the rest of the answer, and SHALL NOT drop the description,
because one bad value is not a reason to show the user nothing.

#### Scenario: The reader keeps the entries it can read

- **WHEN** a unit test reads an answer whose `values` hold, in order, an entry with the
  label `FACTION` and the value `Pilots Federation`, an entry with the label `HISTORY` and
  a `markdown` body, an entry with both a `value` and a `markdown`, an entry whose `label`
  is the number 7, an entry whose `label` is `   `, an entry that carries a label alone,
  the string `x`, and then 12 more well-formed entries
- **THEN** the reading holds 12 entries, the first is a grid value, the second is a
  section, the third is a section, and the four bad entries are not there

#### Scenario: A wrongly typed description is dropped

- **WHEN** a unit test reads an answer whose `description` is the number 7 and whose
  `values` hold one good entry
- **THEN** the reading holds no description and the one entry

#### Scenario: The reader keeps the actions it can read

- **WHEN** a unit test reads an answer whose `actions` hold, in order, an entry with the
  label `LOG` and a function, an entry whose `label` is the number 7, an entry whose
  `label` is `   `, an entry whose `onSelect` is the string `x`, the number 7, and then 6
  more well-formed entries
- **THEN** the reading holds 6 actions, the first is the `LOG` entry, and the four bad
  entries are not there

#### Scenario: A copy is kept for a value and dropped for a section

- **WHEN** a unit test reads an answer holding one `value` entry with a `copy` and one
  `markdown` entry with a `copy`
- **THEN** the first keeps its `copy` and the second holds none
