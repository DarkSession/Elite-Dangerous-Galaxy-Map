## Context

See [proposal.md](proposal.md) — Why. What the code holds today:

- `packages/galaxy-map/src/hud/styles.ts` is 1,178 lines and holds **no layout media
  query**. Its one `@media` rule is `prefers-reduced-motion: reduce`, which drops two
  transitions.
- `createHud` in `index.ts` builds the top bar, a `gm-hud__left` column holding the
  category panel and the map options panel, the information panel and the lightbox, and
  appends the four to the root. The dialog goes on the root when the catalog holds an entry.
- The wide layout is `left: 22px; width: 316px` for the column, `right: 22px; width: 380px`
  for the information panel and `height: 54px` for the top bar.
- `info-panel.ts` sets `element.hidden = true` while nothing is selected.
- `map-navigation` already states the touch gestures, and `e2e/touch.spec.ts` drives them
  through the Chrome DevTools protocol in the `chromium-touch` project.
- `e2e/look.spec.ts` holds one committed baseline image, taken at 1280 by 720 in
  `chromium-gpu`. It screenshots `#map` alone, so the HUD is not in the image.
- `tests/main-bundle.test.ts` caps the HUD chunk at 80,000 bytes. It holds 71,668 today.

## Goals / Non-Goals

**Goals**

- One media query holds the whole layout switch. No second DOM tree, no JavaScript
  breakpoint, no option.
- The wide layout's rendered output is **byte-identical**, so `e2e/look.spec.ts` needs no new
  baseline.
- Three new elements and one attribute, in one source file, plus a wrapper.
- The narrow layout is read with real taps, in the `chromium-touch` project that already
  exists, so the HUD built for fingers is tested with fingers.

**Non-Goals**

- Everything the proposal's "Not in this change" list names.
- A drawer that resizes by drag, a bottom sheet, or a tablet layout between the two widths.
- Changing any behaviour of the category panel, the information panel or the dialog. They
  are moved, not rewritten.

## Decisions

### Two breakpoints, 1400 px and 720 px, both on `max-width`

Two faults sit at two widths, so two rules state them.

**1400 px, the drawers.** The wide layout needs 316 + 22 + 380 + 22 = 740 px of chrome before
the map gets a pixel at the edges. 740 px of chrome is not a fault by itself; it is a fault
when what is left is too little to read a galaxy in. A 1366-pixel laptop, which is the
commonest laptop width, keeps 626 px of map with both columns open, and the owner's reading
of that screen is that there is no space left. 1400 px is the first round width above 1366,
so every laptop at or below that class gets the drawers and a 1440-pixel desktop does not.
The rule is written `max-width: 1399px`, because `max-width: 1400px` would catch 1400 itself.

**720 px, the phone treatment.** The top bar's three groups need about 700 px before the
title clips, a finger needs a 44-pixel target where a pointer does not, and a windowed
dialog wastes a border of scrim on a small screen. 720 px is under 740 and above the
412-pixel phone, and it is the width at which a row stops holding four things.

Splitting them is what keeps a 1366-pixel laptop with a mouse honest: it gets the drawers,
because that is a space fault, and it keeps the one-row bar, the region name and the
pointer-sized controls, because a mouse is not a finger.

**Alternative: one breakpoint at 1400.** Rejected with the owner. It would give a laptop the
two-row bar and 44-pixel controls it has the room and the pointer to do without.

**Alternative: `min-width` and mobile-first.** Rejected. It would rewrite every rule in the
sheet as a narrow default plus a wide override, which is a 1,178-line diff for a layout
nobody has asked to change, and it would put the committed look baseline at risk on every
line of it. `max-width` adds one block and leaves the rest alone.

**Alternative: `(pointer: coarse)`.** Rejected with the owner. A narrow desktop window stays
broken and a wide touch screen gets a phone layout, and Playwright would need a device
profile and therefore a new project to reach it.

### The drawer state is one `data-panel` attribute on the root

`createHud` sets `element.dataset.panel` to `left` or `right`, or deletes it. Every rule that
depends on the state is written as `.gm-hud[data-panel='left'] …` inside the media query.
The two tabs' `aria-expanded` and the `Escape` chain are what read it back.

**One predicate guards both ends.** `narrow()` reads whether the left edge tab is drawn —
`leftTab.checkVisibility()`, or `leftTab.offsetParent !== null` where that is not available.
The tab is `display: none` outside the media query, so the reading is the media query's own
answer, taken from the document. The script names no width and calls no `matchMedia`.

`setPanel(side)` writes nothing when `narrow()` is false, and step 3 of the `Escape` chain
runs only when `narrow()` is true. **Both are needed, and the second is the one that is easy
to miss.** Guarding the write alone leaves the attribute on the root when the layout leaves
the narrow band, which on a phone is a rotation: 412 by 880 with a drawer open becomes 880 by
412, nothing clears the attribute — the same guard stops the clear — and every `Escape` from
then on is swallowed by step 3. Guarding the reading makes the stale value inert: no rule of
the sheet draws it above the breakpoint, no step reads it, and the next open or close
overwrites it.

Without either guard, a selection at 1600 by 900 writes `data-panel='right'` and step 3 eats
the press the wide layout means for the selection. `e2e/hud.spec.ts:4163` and
`e2e/datasets.spec.ts:1124` both press `Escape` twice at that size and expect the second press
to clear the selection.

The tabs and the scrim are still built at every width, because the guards make their state
unreachable rather than their markup conditional.

**Alternative: a class such as `gm-hud--left-open`.** Equivalent, but two classes for one
three-valued state invites a frame where both are set. One attribute cannot be in two states.

### A closed drawer is `visibility: hidden`, delayed by the transition

```
.gm-hud__left { transform: translateX(-102%); visibility: hidden;
                transition: transform .26s ease, visibility 0s linear .26s; }
.gm-hud[data-panel='left'] .gm-hud__left { transform: none; visibility: visible;
                transition: transform .26s ease, visibility 0s; }
```

The drawers are `position: absolute`, not `fixed`. The HUD root is
`position: absolute; inset: 0; overflow: hidden`, and that `overflow` is what clips the
`translateX(-102%)` state off the screen. A fixed drawer would escape the clip, because no
ancestor gives it a containing block, and it would also leave a host's own box.

`visibility: hidden` takes the drawer out of the tab order, out of hit testing and out of
paint, and the `0s linear .26s` delay makes it wait for the slide to finish. An off-screen
`transform` alone leaves every button inside reachable by Tab, which the requirement "Every
HUD control works from the keyboard" makes a real fault rather than a cosmetic one.

**Alternative: the `inert` attribute, set by script.** It needs a `transitionend` listener,
it can be missed when the tab is backgrounded mid-transition, and it puts layout state back
in the script. The CSS does the same job with no listener.

### The right drawer is a wrapper that is `display: contents` at the wide width

`createHud` wraps the information panel and a new placeholder in `gm-hud__right`. At the wide
width that wrapper is `display: contents`, so it produces no box: the information panel's
`position: absolute; right: 22px; width: 380px` resolves against the HUD root exactly as it
does today and the rendered output does not move. Inside the media query the wrapper becomes
the drawer and the information panel becomes `position: static; width: 100%`.

The wrapper is needed because the drawer must stay on the screen while nothing is selected,
and the information panel hides itself in that case.

**Alternative: no wrapper — override `[hidden]` inside the media query and put the
placeholder inside the panel.** It needs `display: flex !important` against the sheet's own
`[hidden] { display: none !important }`, and it makes `info-panel.ts` build an element that
only the narrow layout shows. The wrapper keeps the new element in `index.ts` with the rest
of the new code.

### The top bar wraps by `order`, with no DOM change

The bar's children are left, centre, right in that order. Inside the media query the bar
takes `flex-wrap: wrap` and `height: auto`, and the three take `order: 1`, `order: 3;
flex: 1 0 100%` and `order: 2`. The centre group is then forced onto a second row and fills
it. No element moves in the DOM, so the wide layout reads the same tree.

The region name is `display: none` there. The title keeps the ellipsis it already has, so a
long title such as the default `GALACTIC CARTOGRAPHICS` clips on a 412-pixel screen rather
than pushing the zoom off the row. That is the behaviour the requirement "A long title does
not push the field off centre" already states at the wide width.

### The edge tabs are called `gm-hud__drawer-tab`, not `gm-hud__tab`

`gm-hud__tab` is taken: it is the **SYSTEMS** / **SHAPES** pair of the category panel, and it
carries a `z-index` rule of its own on `[aria-pressed='true']`. A second meaning for one name
would collide in the sheet.

### The z-order inside the narrow layout

The HUD root is `z-index: 10` and the new rules stack inside it: the top bar takes what DOM
order gives it, the scrim 30, the drawers 40, the drawer tabs 45, and the **open** tab 46.
The lightbox keeps 60 and the dialog keeps 70, so both still cover an open drawer. The
information panel's own `z-index: 20` is set to `auto` inside the drawer, where it has
nothing to sit above.

The scrim at 30 covers the top bar on purpose, which the spec states.

### The open tab sits beyond its drawer's outer edge

The first build put the open tab 44 px **inside** the drawer's outer edge, so the tab never
left the screen. The owner read it against the mockup and asked for the mockup's placement:
`.design/Galaxy Map HUD Mobile.dc.html` sets `left: ${PW}` on the open left tab, which puts
the tab's inner edge on the drawer's outer edge and nothing of the drawer under it.

The rule is therefore `left: min(88vw, 360px)`, with no width of the tab in the arithmetic.
That matters because the tab is 30 px above 720 and 44 px below it, where the floor grows it:
an offset written as `calc(min(88vw, 360px) - 44px)` would be right at one width and wrong at
the other, and this one is right at both.

The placement then forced a second reading. With the 44-px floor on it the open left tab
spans 360 to 404 and the closed right tab 368 to 412, so the open tab covers the closed
tab's middle and a tap meant for the other drawer closes this one. The owner chose the
mockup's 30 px over the floor: the tab is the one exemption, `min-width: 0`, and at 30 px the
two tabs overlap by 8 and neither covers the other's middle. The tab keeps the 44-px height
and its label makes it about 80 tall, so the target is 30 by 80 on the screen edge.

The open tab still takes `z-index: 46` over the closed one, which costs nothing and holds the
8-px overlap on the open tab's side.

**Alternative: keep the 44-px floor and amend the gesture to close and then open.** Rejected
by the owner. **Alternative: narrow the drawer to `min(88vw - 44px, 360px)` below 720.**
Rejected: it makes the drawer 41 px narrower than the mockup draws it.

**Alternative: keep the tab inside the drawer.** Rejected by the owner, who asked for the
mockup's placement.

### The 44-pixel floor is one rule over `button` and `input`, with no exemption

```
@media (max-width: 720px) {
  .gm-hud button, .gm-hud input { min-width: 44px; min-height: 44px; }
}
```

The obvious objection is that this stretches the small round controls. It does not stretch
what they draw. A category row's dot is a 20 by 20 button with a **transparent** border
holding a 12-pixel `gm-hud__category-swatch` that carries the category's colour, and a copy
button holds an inline SVG. In both, `min-width` and `min-height` grow the box and leave the
mark alone. The controls that do draw their own border — the close buttons, the dataset step
arrows, the collection chips — grow, and the mockup draws all of them larger on a phone than
the wide layout does.

A named list of selectors was the first draft and it is worse: it is a second place to
remember, and a control added later is small until someone notices. The rule and the test
that walks every `button` and `input` then agree by construction.

`min-width` beats `width` in the cascade, so no `width: 20px` needs to be unset.

### The new spec runs in `chromium-touch`, not `chromium-gpu`

`e2e/hud-mobile.spec.ts` goes in `chromium-touch`'s `testMatch` and in `chromium-gpu`'s
`testIgnore`, which is two lines in `playwright.config.ts`. That project already exists for
`e2e/touch.spec.ts`, shares the GPU launch arguments and depends on `renderer-check`, so the
new file still asserts hardware rendering. Its context sets `hasTouch: true`, so the spec
reads the drawers with `page.tap` rather than `page.click`, which is what a phone does.

`tests/browser-suite.test.ts` reads the Firefox project and `paint-cost.spec.ts` alone, so
neither it nor the `browser-suite` capability moves. `scripts/e2e.mjs` runs `chromium-touch`
in the parallel pass with the rest, and the new spec reads no time, so it stays there.

The gestures that open and close a drawer are read with `page.tap`, because those are the
gestures the change exists for. The readings that are not about a gesture — a computed style,
a bounding box, a keyboard press — are taken the way the rest of the suite takes them.

**Alternative: leave it in `chromium-gpu` and click.** That is what the first draft did. It
passes, and it tests a phone layout with a mouse. Two lines buy real taps.

**The one timed reading stays out of that file.** `chromium-touch` runs in the parallel pass
on several workers, and a wall-clock reading taken beside five other browsers measures the
machine. The scrim's cost therefore goes in `e2e/frame-budget.spec.ts`, which is already in
`timedSpecs` and already runs on one worker, inside its own `test.describe` with a phone
viewport.

## Risks / Trade-offs

- **The wide layout moves by one pixel and `e2e/look.spec.ts` fails.** → Every new rule is
  inside the media query. The three new elements carry `display: none` outside it, and the
  right wrapper is `display: contents`. The task list runs the look spec before the gate,
  and a failure there is a bug in this change and not a baseline to re-record.
- **The HUD chunk passes 80,000 bytes.** → It holds 71,668 and the new CSS and markup are
  a few kilobytes. If the reading passes the bound, the bound moves and the task states the
  new number and why, as the last change to this file did.
- **`display: contents` on the right wrapper changes the accessibility tree.** → The wrapper
  is a plain `div` with no role and no label, so it contributes nothing to the tree in either
  state. The keyboard test of `map-hud` covers the panel's controls either way.
- **A selection made from the left drawer swaps the user to the right drawer.** → This is the
  one place the design departs from the mockup, which closes both drawers instead. One rule
  for every selection is fewer rules and it shows the user what they chose. It is called out
  in the proposal so a reviewer can say no.
- **The default title clips at 412 pixels.** → The title is the host's string and the sheet
  already clips it at the wide width. A host that wants a short title on a phone sets a short
  `title`.
- **`checkVisibility()` is not in every browser the suite runs.** → It is in Chromium 105
  and Firefox 125, which are both below the versions the project runs. The fallback
  `offsetParent !== null` reads the same thing for a `display: none` element and costs one
  `||`.
- **A tap lands on a drawer's edge during the slide.** → The drawer takes pointer events for
  the whole 260 ms it is opening, which is what the user asked for, and the scrim is already
  up. Closing is the case the `visibility` delay covers, and a tap there lands on the scrim
  until the slide ends.

## Migration Plan

None. No public member changes, no option changes, no data changes. A host whose page runs at
a **viewport** width of 1400 pixels or more sees nothing move. Below it, the HUD lays out as
drawers, and below 720 it also takes the phone treatment of the top bar, the 44-pixel floor
and the full-bleed dataset library.

The rule is the viewport and not the HUD's own box, and a container query would read the box.
That is a real difference: a host that gives the map a 300-pixel panel inside a wide page gets
the wide layout, and the drawers are then wider than the box they are in. The viewport is the
right reading all the same, because the drawers, the scrim and the edge tabs are a
**full-screen** pattern — they are what a phone wants, not what a small box wants — and a host
that embeds the map in a 300-pixel panel wants neither layout and should turn the HUD off. A
container query would also need a named container on an element the library does not own.
