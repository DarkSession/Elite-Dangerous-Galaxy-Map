## 1. The Markdown subset

- [x] 1.1 Add `src/hud/markdown.ts` with the block pass: split at blank lines, group
      consecutive lines into bullet runs, numbered runs and plain runs, and return the
      block tree. Verify with `pnpm test` that the new unit tests for the scenarios "A
      blank line splits the paragraphs and a newline breaks the line", "A run of items
      draws a list beside its paragraph" and "An unsupported block marker draws as text"
      pass.
- [x] 1.2 Add the inline pass to the same module, in the order escape, code, link, strong,
      emphasis, with `_` never a mark. Verify with `pnpm test` that the unit tests for "The
      marks draw the elements they name", "An underscore is not a mark", "An unmatched mark
      draws as itself" and "An escape draws the marker" pass.
- [x] 1.3 Add the link URL check: no whitespace, and a scheme of `http` or `https` or no
      scheme at all; anything else becomes the label as text. Verify with `pnpm test` that
      the unit test for "A link takes the scheme rule" passes, with `javascript:` and a URL
      holding a space among its cases.
- [x] 1.4 Add `renderMarkdown(doc, text)`, which walks the tree and builds elements with
      `createElement` and `createTextNode`, gives every anchor `target="_blank"` and
      `rel="noreferrer noopener"`, and sets no `innerHTML` anywhere. Verify with
      `grep -rn "innerHTML" src/hud/` that the HUD holds no such write, and with the
      browser tests for "Raw HTML draws as text" and "A drawn link carries the safety
      attributes".
- [x] 1.5 Add the time-bound unit tests: a 50,000-character description parses in 50 ms or
      less, and the parse of an eight-times longer text takes at most 16 times as long.
      Verify with `pnpm test` that both pass.
- [x] 1.6 Add the HUD styles for a paragraph, a list, a code span and a link inside
      `gm-hud__description`, in `src/hud/styles.ts`. Verify with a browser test that a
      list item's computed left padding is above zero and a link's computed colour differs
      from the paragraph's. No scenario names this test: the look of a rendered mark is an
      implementation detail, and the spec states the nodes `renderMarkdown` builds rather
      than how they draw.

## 2. The details reader

- [x] 2.1 Add `src/hud/details.ts` with the `SystemDetails`, `SystemDetailValue` types and
      `readDetails(value)`, which drops what it cannot read, caps the list at 12 entries,
      makes an entry with both `value` and `markdown` a section, and drops `copy` on a
      section. Verify with `pnpm test` that the unit tests for the three scenarios of the
      requirement "The library reads what the loader returns" pass.
- [x] 2.2 Add `details`, `infoFields` and `lockedOptions` to `HudOptions` in
      `src/hud/types.ts`, with `HudInfoFields` and `HudMapOption`. `details` takes the
      system and an `AbortSignal`. Verify with `pnpm build` that the type check is clean.
- [x] 2.4 Read `actions` in `src/hud/details.ts`: drop an entry that is not an object, an
      entry whose `label` is not a string or is empty after a trim, and an entry whose
      `onSelect` is not a function, and keep at most 6. Move the `HudAction` type out of
      `src/hud/types.ts` into this module, because `SystemDetails` now names it and
      `HudOptions` no longer does, and `types.ts` already imports from here. Verify with
      `pnpm test` that the unit test for "The reader keeps the actions it can read" passes.
- [x] 2.3 Add a unit test over the record reader for "A description keeps its Markdown
      characters": a `description` holding a star, a backtick, a bracket and a backslash
      comes back character for character. Verify with `pnpm test`.

## 3. The information panel

- [x] 3.1 Rework `fieldsOf` in `src/hud/info-panel.ts` to take the `infoFields` setting and
      the host's grid values, and to place the cells with the one rule design D6 states.
      Verify with `pnpm test` that a unit test of the placement covers every field on,
      each of the three off, and an odd and an even count of later fields, and with the
      browser tests for "The host turns the three worked-out fields off" and "One field off
      still leaves no empty cell".
- [x] 3.2 Gate the `regionNameAtExact` call on `infoFields.region`, so the call is not made
      when the field is off. Verify with the browser test for "The region field off fetches
      no region table", which reads the page's request list, because reading the code path
      cannot fail on a call whose answer is thrown away.
- [x] 3.3 Draw the description with `renderMarkdown`, from the loaded description when
      there is one and from the record otherwise, and draw each section value under it with
      its label as the title. Verify with the browser tests for "The description draws as
      Markdown" and "A host value joins the grid and a host body draws a section".
- [x] 3.4 Add the details request: one counter, the identity the held answer belongs to,
      the `LOADING…` line with `aria-busy="true"` for a promise, the drop of a stale
      answer, and the `console.warn` fallback to the record on a throw or a rejection.
      Verify with the browser tests for the six scenarios of "The host loads a system's
      details when the panel opens".
- [x] 3.5 Add the `AbortController` per request: abort it when the selection changes and
      on `dispose`, and keep an abort out of `console.warn`. Verify with the browser tests
      for "The signal aborts when the selection moves" and "An abort is not reported as a
      failure".
- [x] 3.6 Give a grid value with a `copy` a copy button built by `makeCopyButton`, with
      the accessible name `Copy ` and the entry's label, and the entry's label as the
      button's key so its tick does not collide with the position button's. Verify with
      the browser test for "A host value carries a copy button", which reads the name and
      then moves the tick.
- [x] 3.7 Write the browser tests of section 3 into `e2e/hud.spec.ts`, or into a new
      `e2e/info-panel.spec.ts` where that file is already long. Run them with
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test <file>` and verify they pass, one
      Playwright run at a time.

- [x] 3.8 Draw the footer from the loader's answer in `src/hud/info-panel.ts`: build the
      footer and its centre view button before the loader is called, and add one button per
      `actions` entry when the answer arrives. A held answer that is replaced or dropped
      SHALL take its buttons with it. Verify with the browser tests for "A host action gets
      the selected system", "A failing host action does not stop the map" and "The footer
      holds the centre view button before the answer".

## 4. The map options

- [x] 4.1 Add `systemNames` to `GalaxyMapOptions` in `src/app/create-map.ts` and apply it
      at start, with a non-boolean taking the default of off. Verify with the browser tests
      for "The option starts the labels on" and "An unreadable option keeps the labels
      off" of `system-selection`, and for "The names switch opens on the state the options
      named" of `map-hud`.
- [x] 4.2 Build the options panel from a filtered list in `src/hud/options-panel.ts`, so a
      locked option builds no switch and the `update()` tick reads the same list. Verify
      with the browser test for "A locked option draws no switch". **The list holds five
      names, not four**: `make-nebulae-optional` has landed, so the panel already builds a
      conditional **Nebulae** switch through `hasNebulae()`, and `nebulae` is a lockable
      name. Filter the nebulae switch by the same list, and keep it conditional on
      `hasNebulae()` as well: a locked name and a map with no source both mean no switch.
- [x] 4.3 Build no options panel in `src/hud/index.ts` when **every switch the panel would
      hold** is locked, and leave the category browser in the left column. The count is not
      fixed: on a map with no nebula source it is the four, and on a map with one it is the
      five. Do not test a fixed count of four. Verify with the browser tests for "Every
      switch locked drops the panel" and "The nebulae switch locks with the rest".
- [x] 4.4 Ignore an unknown name and a `lockedOptions` that is not an array. Verify with
      the browser test for "A lock list the HUD cannot read is ignored". Note that
      `nebulae` is **no longer** an unknown name, so the test uses `datasets` as its
      example of one.
- [x] 4.5 Check that the handle setters still move a locked option. Verify with the browser
      test for "A locked option still moves through the handle".
- [x] 4.6 Check the keyboard path of a panel that lost a switch. Verify with the browser
      test for "A panel of fewer switches still reports each state".

## 5. The public surface and the bundle

- [x] 5.1 Export `SystemDetails`, `SystemDetailValue`, `HudInfoFields` and `HudMapOption`
      from `src/index.ts`. Verify with `pnpm build` and with the declaration test for "The
      declaration names the panel types". Task 5.6 finishes that scenario: it adds the
      `HudAction` import and the `actions` entry, which this task does not cover.
- [x] 5.6 Remove `actions` from `HudOptions` in `src/hud/types.ts`, and export `HudAction`
      from `src/hud/details.ts` through `src/hud/index.ts` and `src/index.ts`, so the
      exported name list does not change. Move the version comment at
      `tests/main-bundle.test.ts:761` to name **both** breaks of 0.6.0: the Markdown draw,
      and the removal of `HudOptions.actions`, which is a break in what compiles. Verify
      with `pnpm test` that `src/index.test.ts` still names `HudAction` and that the
      declaration test compiles a loader whose `SystemDetails` carries a `values` entry and
      an `actions` entry, which the scenario "The declaration names the panel types"
      states.
- [x] 5.2 Read the version in `package.json`. **It reads 0.5.0**, which
      `make-nebulae-optional` set when it landed, so this change takes **0.6.0**. Write the
      number used into the
      `library-package` delta spec. Move the assertion at `tests/main-bundle.test.ts:764`
      and its comment to the same number. Verify with `pnpm test` that the version test
      passes.
- [x] 5.3 Run `pnpm build` and read the **entry** chunk size against `ENTRY_CHUNK_LIMIT`.
      **Take the reading after tasks 2.4, 3.8, 5.6 and 6.5**, not before: 5.6 touches
      `src/index.ts`, so the entry chunk moves again. The pair before the `actions` work is
      a bound of **260,000** against a chunk of **254,076** bytes. Read it from the file
      rather than from this text. Write the reading into the delta spec. Move the bound only where the reading passes it, to
      the next round 10,000 bytes above it, in both `tests/main-bundle.test.ts` and the
      spec, with the reason the spec asks for. Verify with `pnpm test`.
- [x] 5.4 Read the **HUD** chunk size from the same build against `HUD_CHUNK_LIMIT`.
      **Take the reading after tasks 2.4, 3.8, 5.6 and 6.5**, not before: the actions
      reader and the footer draw are HUD code. The work has already moved the bound from
      56,000 to **70,000** against a reading of **61,416**, so read both from the file. The
      47,360 this task first named was the figure before the nebulae switch landed, so the
      room is thinner than the task was written for and the bound will probably move. This
      is the chunk the parser, the renderer,
      the reader and the panel work land in. Write the reading into the delta spec, and
      move the bound the same way where the reading passes it. Verify with `pnpm test`.
- [x] 5.5 Check that no module of `src/hud/` is reachable from the library entry chunk as a
      value. Verify with the existing bundle test, which already holds the HUD in a chunk
      of its own.

## 6. The demo and the documentation

- [x] 6.1 Search `demo-data/*.json` for a `description` that holds `*`, `[`, a backtick or
      a backslash, and escape each one, or rewrite the text. Verify with a grep over the
      files that no unescaped mark is left.
- [x] 6.2 Add a `details` loader to the demo page that gives a Markdown description and one
      extra value, a body that draws as its own section. Verify with a browser test in
      `e2e/demo-site.spec.ts` that selecting that system draws it, and by eye on
      `pnpm dev --host 0.0.0.0`. The loader gives no field for the grid: the panel draws
      the categories as chips, so a grid field naming the primary category would draw the
      same fact twice. `e2e/info-panel.spec.ts` covers a grid value on a map of its own.
- [x] 6.3 Write the Markdown subset, the `details` loader, `infoFields` and
      `lockedOptions` into `README.md`, with the escape rule and one example of each.
      Verify by reading the file that each of the four is named with its type, and that the
      `lockedOptions` entry names all five option names.
- [x] 6.4 **Added scope.** Escape the marks in `scripts/build-demo-systems.mjs`, so a
      rebuild of the demo data does not undo task 6.1. Task 6.1 escapes the file the
      repository holds, and the generator writes that file from the source dump: the
      commander name of a hyperdiction carries `[GPL]`, and every description the dump
      gives reaches the file through `plainTextFromHtml`. Without this the next rebuild
      brings the raw marks back. Add `escapeMarkdown`, apply it once to each description
      the generator writes — in `ed3dRecords` and in `convertNotable` — and declare it in
      `scripts/build-demo-systems.d.mts`. The hyperdiction line interpolates its three
      names as they stand, because its record reaches `ed3dRecords`; a second escape there
      would draw a backslash. Verify with `pnpm test` that the five new unit tests in
      `tests/fixtures/notable-systems.test.ts` pass, and with a rebuild that
      `demo-data/uia.json` comes back as the file the repository holds.

- [x] 6.5 Move the demo page's `LOG RECORD` button from `hud.actions` into the `details`
      answer in `src/app/main.ts`, and write the move into `README.md`: `actions` is no
      longer an `HudOptions` field, and the release notes name the break. Verify by reading
      `README.md` that it names `actions` under `SystemDetails` alone, and with the browser
      test of task 3.8.

## 7. The checks and the gate

- [x] 7.1 Run `pnpm lint` and `pnpm build` and verify both are clean, with no new
      `no-restricted-imports` or `no-restricted-syntax` report inside `src/hud/`.
- [x] 7.2 Run `pnpm test` and verify the whole unit suite passes, including
      `tests/main-bundle.test.ts` and `src/hud/hud-boundary.test.ts`.
- [x] 7.3 Run `pnpm test:e2e` as one run and verify the whole browser suite passes,
      including the renderer check that fails a software fallback. Report the result as it
      was.
- [x] 7.4 Launch the `openspec-implementation-reviewer` subagent with this change id, wait
      for its verdict, fix what it blocks on, and re-run the gate. State the verdict and
      every finding when the work is presented.
