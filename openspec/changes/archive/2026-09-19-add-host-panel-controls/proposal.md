## Why

The information panel and the map options panel are fixed. A host that embeds the map
gets what the library decided, and five things it cannot change:

1. **A description is one flat paragraph.** `RealSystem.description` goes into the panel
   through `textContent`, so a host cannot mark a name, a list or a link. The next step a
   host reaches for is raw HTML, and raw HTML from a dump is an injection the library
   would have to sanitise. The library should never take HTML from a host record.
2. **A description must be in the record.** The set holds up to 10,000 systems, and a
   paragraph per system is the largest field of the dump. A host that holds its
   descriptions in a second store has no way to give one to the panel when the user opens
   it.
3. **A host cannot add a value.** The panel shows the eleven fields the library knows. A
   host with a faction, a permit or a mission state has nowhere to put it.
4. **`DISTANCE FROM SOL`, `RANGE` and `REGION` always show, and every map option is the
   user's to change.** A map of one region does not want a region field. A map that must
   keep the grid on has no way to hold it on.
5. **The footer buttons come from a second place.** `HudOptions.actions` sets them for
   every system, while the description and the values come from the loader. One panel
   reads a system from two places.

## What Changes

- **A description is Markdown, in a stated subset.** The library renders it into DOM
  nodes. It never sets `innerHTML` and never takes HTML from a host. Raw HTML in the
  source draws as text. The subset is paragraphs, line breaks, bold, italic, inline code,
  links, bullet lists and numbered lists, and nothing else. A link takes the scheme rule
  the images already take.
- **BREAKING**: a description that holds Markdown characters now draws as Markdown. The
  characters are `*`, `[`, a backtick and a backslash, and a host that wrote one as
  literal text escapes it with a backslash. `_` stays literal, because system names carry
  one.
- **The HUD takes a `details` loader.** `HudOptions.details(system, signal)` returns a
  `SystemDetails`, or a promise of one. The library aborts the signal when the selection
  changes and on dispose, so a host that fetches can stop the work behind an answer no
  one waits for. The panel calls it once per selection, shows a
  loading line while it runs, and draws the answer. The record's own `description` is
  what the panel draws when the host gives no loader, and when the loader gives no
  description.
- **A `SystemDetails` carries extra values the host names.** A value with a short `value`
  joins the field grid after the built-in fields. A value with a `markdown` body draws as
  its own titled section under the description. The library caps the list and drops an
  entry it cannot read.
- **The footer buttons move into the loader.** `SystemDetails.actions` holds them, and
  `HudOptions.actions` goes. One place then holds everything the panel shows about one
  system. The panel draws the footer and its centre view button before it calls the
  loader, and adds the host buttons when the answer arrives.
- **BREAKING**: `HudOptions.actions` is removed. A host that sets it moves the same array
  into the answer its `details` loader returns, for every system. A host that set `actions`
  and no loader now writes one. Where a load fails or never settles, the footer holds the
  centre view button alone, which `HudOptions.actions` never did.
- **`HudOptions.infoFields` turns off `DISTANCE FROM SOL`, `RANGE` and `REGION`**, for
  every system and not per record. With `region` off the panel calls
  `regionNameAtExact` for no system, so the 199 KiB region cell chunk is never fetched.
- **`GalaxyMapOptions.systemNames` sets the fourth default.** `regions`, `grid` and
  `shapes` already carry one; system names did not, so a host could not open the map with
  the names on. The name labels start on the state the option gives.
- **`HudOptions.lockedOptions` holds an option at the host's setting.** A locked option
  draws no switch. The list names every switch the panel can hold: `regions`,
  `systemNames`, `grid`, `shapes` and `nebulae`. When every switch the panel would hold is
  locked, the HUD builds no map options panel. The handle's setters still work, so the host
  changes a locked option in code.

**Non-goals.** No Markdown parser and no HTML sanitiser join the dependencies; the subset
is small enough to own, and the 7-day release hold makes each new run-time package a cost.
Headings, block quotes, tables, images and fenced code blocks are not in the subset. A
category's `description` stays plain text, because it draws in a one-line row. Locking
covers the five map option switches alone, not the category browser, the search box or the
dataset picker. The record's `description` stays a string the reader validates as it does today.

## Capabilities

### New Capabilities

- `system-details`: the Markdown subset the library renders, the `details` loader contract
  and how the library reads what the loader returns.

### Modified Capabilities

- `map-hud`: the information panel draws Markdown and the host's values, the three
  computed fields take a switch, the map options panel leaves out a locked switch, and the
  `hud` option table grows by three fields.
- `real-systems`: `description` is Markdown text and not a plain paragraph.
- `system-selection`: the name labels start on the state `systemNames` gives, and not
  always off.
- `library-package`: `GalaxyMapOptions` carries `systemNames`, the export list takes the
  new public types, and the entry chunk reading moves.

## Impact

- **Code**: `src/hud/info-panel.ts`, `src/hud/options-panel.ts`, `src/hud/types.ts`,
  `src/hud/index.ts`, `src/hud/styles.ts`, `src/app/create-map.ts`, `src/app/main.ts`,
  `src/index.ts`, and two new modules `src/hud/markdown.ts` and `src/hud/details.ts`.
- **Other files**: `package.json` for the version, `tests/main-bundle.test.ts` for the
  version assertion and the two chunk bounds, `e2e/` for the browser tests,
  `demo-data/*.json` for a description that holds a mark character, and `README.md`.
- **Public surface**: three new `HudOptions` fields and one removed, one new
  `GalaxyMapOptions` field, and four new exported types. `HudAction` stays exported and
  moves to `src/hud/details.ts`, because `SystemDetails` now names it and `HudOptions` no
  longer does.
- **Scale**: the loader runs once per selection, never per frame and never per record, so
  a set of 10,000 systems makes at most one call per click. The renderer runs on the
  selected system alone and is linear in the length of the text.
- **Dependencies**: none added. The Markdown renderer is HUD code, so it stays in the
  HUD's own chunk and a host that does not ask for the HUD downloads none of it.
- **Bundle**: the **HUD** chunk is the one that grows. It started at **53,023** bytes
  against a bound of 56,000, which left about 3,000 bytes, and the work passed that bound.
The final reading is **62,293** bytes, which is 9,270 of growth, so the bound **moves
  to 70,000** and keeps 7,707 bytes of room. The entry chunk takes the `systemNames` option
  alone and moves 18 bytes, from 254,058 to **254,076**, against a bound of **260,000** that
  stays. The `actions` work added 437 bytes to the HUD chunk and none to the entry chunk,
  because the reader and the footer draw are HUD code and `HudAction` is a type the build
  erases.
- **Tests**: unit tests for the parser and the reader, which are pure; browser tests for
  what the panel draws; `tests/main-bundle.test.ts` for the two chunk bounds and the
  version.
