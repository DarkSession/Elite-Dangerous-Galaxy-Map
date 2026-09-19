## Context

See proposal.md — Why. The parts of the tree this change touches:

- [src/hud/info-panel.ts](../../../src/hud/info-panel.ts) builds the panel. `fieldsOf`
  returns the field list, the region is written in when `regionNameAtExact` resolves, and
  the description goes in through `textContent`.
- [src/hud/options-panel.ts](../../../src/hud/options-panel.ts) builds the map option
  switches and an `update()` that writes the pressed state of each. It builds five where
  the map holds a nebula source and four where it does not.
- [src/hud/types.ts](../../../src/hud/types.ts) holds `HudOptions` and `HudAction`. Task
  2.4 moves `HudAction` into `src/hud/details.ts`, beside the `SystemDetails` that names it.
- [src/app/create-map.ts](../../../src/app/create-map.ts) holds `GalaxyMapOptions` and
  reads `regions`, `grid`, `shapes` and `cursorMarker`. It has no `systemNames`.
- The HUD reaches the map through the public handle alone, and an ESLint rule fails the
  lint on an import of `src/render/`, `src/scene-data/` or `src/camera/` inside
  `src/hud/`. [src/hud/hud-boundary.test.ts](../../../src/hud/hud-boundary.test.ts)
  checks the rules.
- Vitest runs with `environment: 'node'`, so a unit test has **no DOM**. The repository's
  habit is to unit test the pure part and read the elements in the browser suite, as
  [src/hud/dom.test.ts](../../../src/hud/dom.test.ts) says in its first comment.
- `tests/main-bundle.test.ts` held two size bounds when this change began. The entry chunk
  bound was **260,000** bytes against a reading of **254,058**, and the HUD chunk bound was
  **56,000** against a reading of **53,023**. The Risks entry below records where they went. `make-nebulae-optional` set the entry pair and the HUD reading;
  the 56,000 HUD bound dates from the first library build. The `library-package` spec
  carries the entry pair, and this change adds the HUD pair to it.

## Goals / Non-Goals

**Goals:**

- One Markdown path for every body of text the panel draws, host text and record text
  alike.
- Every new piece that can be tested without a DOM is a pure function in its own module.
- The HUD keeps its boundary: nothing new reaches past the public handle.
- The library entry chunk grows by the `systemNames` option and nothing else.

**Non-Goals:**

- No Markdown in the top bar, the category rows, the search box, the lightbox caption or
  the dataset dialog, whose entry text is also a `description` string
  ([src/hud/dataset-dialog.ts](../../../src/hud/dataset-dialog.ts)). Those all draw in one
  line or one small box, where a list or a link has nowhere to go.
- No streaming or partial render of a description. The loader settles, then the panel
  draws.
- No cache of loaded details across selections. One selection, one answer, dropped when
  the selection changes. The loader takes an `AbortSignal` so a host can stop the work
  behind a dropped answer; the library keeps nothing after the abort.

## Decisions

### D1 — The Markdown parser is a pure module, the renderer is a thin DOM walk

`src/hud/markdown.ts` exports two names:

```ts
export function parseMarkdown(text: string): readonly MdBlock[];
export function renderMarkdown(doc: Document, text: string): DocumentFragment;
```

`parseMarkdown` returns plain data: a block is a paragraph, a bullet list or a numbered
list, and a block holds inline parts that are text, a hard break, strong, emphasis, code
or a link. `renderMarkdown` walks that tree and calls `doc.createElement` and
`doc.createTextNode`.

The split is what makes the subset testable. Every rule of the subset is a unit test over
`parseMarkdown` with no DOM, and the browser suite reads a handful of elements to check
that the walk builds what the tree says.

**Alternative rejected**: one function that builds elements as it scans. It is shorter,
and every test of it would then need the browser suite, which is the slow suite and the
one that needs the GPU.

**Alternative rejected**: `marked` plus `DOMPurify`. Two run-time dependencies under the
7-day hold, a larger install for every host, and a sanitiser that must be configured
correctly to be worth anything. The subset here needs no sanitiser because no HTML is ever
parsed.

### D2 — The parser is two passes, both linear

The block pass splits at blank lines, then groups consecutive lines by kind. It reads
each line once.

The inline pass walks a line from left to right. At a `[` or a `*` it looks ahead for the
close of that mark, and at a `[label](` it looks ahead for the `)`. Each look-ahead holds
its last answer for the length of the call: a held position at or after the new start is
still the first close, and a held -1 stays -1. The look-aheads of one line therefore read
the line once in total, which makes the pass linear. Without the held answer, a line of
openers with no partner costs one full scan for each opener, which is the square of the
length. A unit test over a line of 50,000 openers holds the bound.

A call that reads a link label, or the contents of a strong or an emphasis mark, reads a
part of the line and holds its own answers.

The spec states the bound so that a later rewrite cannot quietly bring back a scan of
that shape.

The scan order is escape, code, link, strong, emphasis, and the spec's table states it.
Code before link is what keeps a bracket inside a code span from opening a link.

### D3 — `_` is never a mark

CommonMark takes `_x_` as emphasis. This subset does not. System names such as
`Col 285 Sector XY_Z` carry underscores, and a host that pastes a dump field into a
description should not have to escape them. The characters a host must now escape are
`*`, `[`, a backtick and a backslash, which is the break the proposal names.

### D4 — The `details` loader lives on `HudOptions`, not on `GalaxyMapOptions`

The loader is the host's own function, and the only caller is the panel. Putting it on
`HudOptions` keeps three things:

1. The library entry chunk does not grow. A host that builds its own chrome calls its own
   loader itself and needs nothing from the library to do it.
2. The reader that drops a bad entry is HUD code, so it lands in the HUD chunk with the
   parser.
3. The HUD boundary is untouched: the option arrives through `createHud`, not through the
   handle.

**Alternative rejected**: `GalaxyMapOptions.systemDetails` with a
`map.loadSystemDetails(system)` member on the handle. It reads well and it would let a
host's own chrome share the reader, but it puts the reader and its validation in the entry
chunk for a call the library itself never makes. The entry chunk has about 5,900 bytes of
room; the point is not that the reader would not fit, it is that every host pays for it,
including the ones that build their own panel and never call it.

`systemNames` goes the other way and belongs on `GalaxyMapOptions`, because it sets the
state the **map** starts in and the map draws the labels whether or not a HUD is there.

### D5 — The panel holds one details request at a time

The panel already holds `regionRequest`, a counter that drops a region answer whose
selection has moved. The details load takes the same shape: a counter, plus the identity
the answer belongs to and the answer itself, so a `refresh()` for the same selection draws
from what is held and starts no second load.

`src/hud/details.ts` holds the pure part:

```ts
export function readDetails(value: unknown): SystemDetails;
```

It returns `{}` for anything it cannot read, drops a bad entry, caps the list at 12 and
splits the entries into grid values and section values. Unit tests cover it with no DOM.

### D6 — The grid places cells with one rule, not with a table of cases

`fieldsOf` grows a second stage. The first works out which fields exist: the position,
then each of the three worked-out fields the `infoFields` option leaves on, then the
record's fields, then the host's grid values. The second walks that list with a column
counter and marks a field wide when it is `POSITION` or `REGION`, or when it sits at the
**first** column and the field after it is wide, or when it sits at the first column and
it is the last field. The column condition is what keeps `DISTANCE FROM SOL` and `RANGE`
sharing one row with `REGION` under them: `RANGE` sits at the second column, so the clause
does not reach it.

One rule replaces the current "the first four fields fill six cells" arithmetic, which
stops holding as soon as a field can be turned off.

### D7 — A locked option is left out, not disabled

The nebulae switch of `make-nebulae-optional` already states the reading: "a switch that
turned on a feature the map cannot draw would be a control that does nothing". A locked
switch is the same control. The panel builds the switches from a list, so leaving one out
is a filter on that list, and the panel element itself is not built when the filter leaves
nothing.

The `update()` tick writes the pressed state of each switch every 100 ms. It reads the
same filtered list, so a locked option costs no work per tick.

### D8 — With `region` off the panel makes no region call

`regionNameAtExact` is what pulls the 199 KiB region cell chunk, through a dynamic import
held at module level in `create-map.ts`. The panel calls it once per selection today. The
`infoFields.region` switch gates the call and not only the field, so a host that turns the
field off never fetches the chunk. The browser test reads the page's request list, which
is how the test can fail on a call that is made but whose answer is thrown away.

### D9 — The footer buttons come from the loader alone

`HudOptions.actions` set the footer buttons for every system, and the loader gives the
description and the values for one. The panel therefore read one system from two places,
and a host with a per-system button had to branch inside `onSelect`.

`SystemDetails.actions` holds the buttons and `HudOptions.actions` goes. One place holds
everything the panel shows about a system, and a host returns the buttons that suit that
system.

**Alternative rejected**: keep both, with the loader's answer replacing the option for the
system it names. It breaks nothing and it keeps the buttons on a failed load. It was
rejected because it leaves the two places the move is for, and a host reading the option
table would still have to learn which one wins.

The cost is the timing. The buttons cannot draw before the answer arrives, so a slow load
shows the centre view button alone while it runs and a failed load shows it alone for good.
The footer is drawn before the call, so it never appears late and never moves the rest of
the panel. The Risks section states the cost and the escape.

The reader takes `actions` the way it takes `values`: it drops an entry that is not an
object, an entry whose `label` is not a non-empty string, and an entry whose `onSelect` is
not a function, and it keeps at most 6. The cap is lower than the 12 for values, because
the footer is one row and the values are a grid that scrolls.

## Risks / Trade-offs

- **Three in-flight changes touch the same requirements.**
  `make-nebulae-optional` renames "The map options panel carries four switches" and adds a
  fifth switch; `make-nebulae-optional` and `publish-library-package` both modify "The
  library build emits a package and no page"; `publish-library-package` moves the whole
  tree into `packages/galaxy-map/` and `apps/demo/`. → This change was written against the
  main specs as they stood, which is what a delta applies to. Whichever change archives
  first, the one behind it is re-based before it is applied.

  **`make-nebulae-optional` archived first, on 2026-09-19, and this change is now re-based
  on it.** Three things moved. The `map-hud` delta targets "The map options panel carries
  the map switches" and carries the nebulae switch forward, and it no longer holds a
  RENAMED block, because that rename has already happened. The `library-package` delta
  carries forward the five scenarios that change added, because a MODIFIED requirement
  replaces the whole block and archiving without them would drop them. And `lockedOptions`
  takes the name **`nebulae`**, which this section already named as the known follow-up:
  the lock list names every switch the panel can hold, and the panel drops when every
  switch it would hold is locked, rather than when a fixed four are.

  One follow-up is still open: the file paths in tasks.md move under
  `packages/galaxy-map/src/` once the workspace split of `publish-library-package` lands.

  **`publish-library-package` modifies the same `library-package` requirement**, "The
  library build emits a package and no page", and the two blocks hold different text. That
  change adds the workspace move table, the `./testing` entry point and
  `createFragmentWriter`; this one adds the four panel types, the HUD chunk bound and the
  version. A MODIFIED requirement replaces the whole block, so whichever archives second
  re-bases its block on the first and carries those paragraphs forward. Archiving without
  the re-base drops them.
- **The HUD chunk is the one this change grows, and it passed its bound.** It started at
  53,023 against a bound of 56,000, which left about 3,000 bytes, and the parser, the
  render, the reader, the panel work, the new style rules, the actions work and the parse
  memo took 9,270.
  → The bound **moved to 70,000**, by the rule the spec states, and the final reading is
  **62,293**, which keeps 7,707 bytes of room. The entry chunk takes one option field and
  moves 18 bytes, to 254,076 against a bound of 260,000 that stays. The `actions` work took
  437 bytes of the HUD chunk and none of the entry chunk.
- **Two in-flight changes claimed version 0.5.0.** `make-nebulae-optional` took it, and
  `package.json` read 0.5.0 when this change was drafted. → This change takes **0.6.0**, with no condition, and
  writes that number into the spec, the scenario and `tests/main-bundle.test.ts`. The
  version assertion in that test is a task of its own, because `package.json` and the test
  must not disagree.
- **A host's description that held a literal star or bracket now draws a mark.** → It is
  the break the proposal names, it takes a minor version, and the escape is one backslash.
  The demo data is checked for the four characters as part of the work.
- **A `details` loader that never settles leaves the panel on `LOADING…`.** → The panel
  stays usable: the fields, the chips and the footer are drawn before the loader is
  called, and the close button works. No timeout is added, because a timeout would draw a
  wrong answer where a slow network is the only fault.
- **The footer buttons now wait for the loader.** `HudOptions.actions` drew them the moment
  the panel opened. `SystemDetails.actions` cannot, so a slow load shows the centre view
  button alone for as long as it runs, and a failed load shows it alone for good. → This is
  the cost of the move, and the owner chose it for one surface over two. The footer itself
  is drawn before the call, so it never appears late or moves the rest of the panel, and
  the centre view button, which is the library's own, always works. A host that needs a
  button on a system whose details cannot load returns that button from the failure path
  of its own loader.
- **A host can pass 12 values with long labels and push the footer down.** → The cap and
  the two-column grid hold the width. The panel scrolls, as it does for a record with many
  fields today.
- **The subset is not CommonMark, and a host may paste text that expects more.** → The
  spec states the subset exactly, the unsupported markers draw as text rather than
  disappearing, and the README states the subset with an example.

## Migration Plan

No data migration. The steps that face a host:

1. The package moves to the version the `library-package` delta names, which is **0.6.0**.
   The release notes state the escape rule for `*`, `[`, a backtick and a backslash in a
   description.
2. A host that wants the old flat text escapes those four characters, or moves the text
   into a `details` loader and escapes it there.
3. Every new option is optional. A map built with today's options draws what it draws
   today, apart from a description that holds one of the four characters.

Rollback is the previous version of the package. Nothing is written to a store and no
format on disk changes.
