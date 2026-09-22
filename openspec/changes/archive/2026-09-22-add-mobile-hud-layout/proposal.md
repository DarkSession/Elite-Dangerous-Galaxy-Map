## Why

The HUD is built for a wide window and for nothing else. `packages/galaxy-map/src/hud/styles.ts`
holds no layout media query at all: the left column is a fixed 316 px at `left: 22px`, the
information panel is a fixed 380 px at `right: 22px`, and the top bar is one 54 px row with
three groups in it. The two columns and their margins need **740 pixels** before the map
gets one at either edge. The 412 by 880 phone screen the mockup
`.design/Galaxy Map HUD Mobile.dc.html` draws at gives them 412. The user sees panels and no
map.

The input side is already done. `map-navigation` states the one-finger move, the two-finger
pinch and orbit, and the tap that selects, and `e2e/touch.spec.ts` drives them through the
Chrome DevTools protocol. What is missing is the layout the fingers act on.

## What Changes

**The mobile layout is a width, not a device.** Two `@media` blocks in the HUD style sheet
turn the layout over. Below 1400 pixels the two panel columns become drawers, because a
1366-pixel laptop with both columns open keeps too little map between them. Below 720 pixels
the top bar also wraps, the region name goes, every control takes a 44-pixel floor and the
dataset library fills the screen. The HUD reads no user agent, calls no `matchMedia`
and takes no new option. A narrow desktop window gets the same layout, which is what makes
it testable in the existing `chromium` Playwright project at a phone viewport.

**The two panel columns become off-canvas drawers.**

- The left column, which holds the category panel and the map options panel, slides in from
  the left edge. The information panel slides in from the right edge. Each is
  `min(88vw, 360px)` wide and the full height of the map.
- At most one drawer is open. A new `data-panel` attribute on the HUD root holds which:
  absent, `left` or `right`. **The narrow layout is in force when the left edge tab is
  drawn**, which the media query alone decides. The HUD writes a drawer side only then, and
  every reading of the drawer state reads closed when it is not in force. A drawer left open
  in a window the user then drags past 1400 pixels is therefore inert rather than a key press
  the wide layout loses.
- Two edge tabs, one per side, open and close their drawer. Each is a 30 px wide button on
  the vertical middle of its edge, with a chevron and a vertical label. The left tab reads
  `FILTERS`. The right tab reads `SYSTEM` while a system is selected and `DATA` while none
  is.
- A scrim covers the map and the top bar while a drawer is open. A tap on it closes the
  drawer. The top bar is under the scrim on purpose: the dataset field and its arrows are
  not reachable while a drawer is open, so no control needs a rule for that case.
- **Selecting a system opens the right drawer**, whatever selected it. A tap on a marker and
  a tap on a row of a category list both end with the information panel open. The mockup
  closes both drawers when a row selects and opens the right drawer when a marker does; one
  rule for both is fewer rules and it shows the user what they picked.
- **Escape closes an open drawer.** The HUD's existing Escape chain gains one step, after
  the dialog and the lightbox and before the selection.

**The right drawer holds an empty state.** The information panel hides itself while nothing
is selected, so the right drawer would open on nothing. A new wrapper element holds the
information panel and a placeholder that reads `NO SYSTEM SELECTED / TAP A MARKER ON THE
MAP`. The wrapper is `display: contents` outside the media query, so the desktop DOM lays
out exactly as it does today, and the placeholder is hidden there.

**The top bar wraps into two rows.** The title, the zoom and the reset button take the first
row. The dataset field and its arrows take the second, full width. The region name is
dropped on this width: the mockup drops it, and the bar cannot hold the title, the zoom, the
reset button and a region name in 412 pixels. The bar loses its fixed 54 px height and takes
the height its two rows need.

**The dataset dialog becomes a full-screen sheet**, with a one-column card grid and a
horizontally scrolling chip row. The lightbox keeps its sizing, which already follows the
picture and fits a phone screen; its close button takes the 44-pixel floor like every other
button.

**Every button and every input of the HUD is at least 44 CSS pixels on each side**, on this
width alone, with no exemption. That is one rule over `button` and `input`, not a list of
selectors. The small round controls keep the marks they draw: a category row's dot draws its
colour on an inner element and the copy buttons draw an inline icon, so a 44-pixel box moves
the hit area and not the drawing. The desktop sizes do not move.

**Not in this change**

- `apps/demo/index.html` and the 11 other pages, which set `height: 100vh` on the canvas. A
  mobile browser's collapsing URL bar makes `100vh` wrong, and `env(safe-area-inset-*)` is
  unhandled. That is a page change, not a HUD change, and the owner scoped it out.
- A render-cost budget for a phone-class GPU. The dev container passes through an NVIDIA
  card, so a phone reading cannot be taken here, and a throttled reading would be a number
  with no ground under it.
- A new Playwright project. The new specification file joins the existing `chromium-touch`
  project's `testMatch` and `chromium-gpu`'s `testIgnore`, which is two lines. That project
  has `hasTouch: true`, so the narrow layout is read with real taps rather than clicks, which
  is the point of it. `browser-suite` states the Firefox project alone and does not move.
- `backdrop-filter`, which the mockup draws on the drawers, the tabs and the top bar.
  `map-hud` bans it on a measurement, and the drawers cover the moving map exactly as the
  desktop panels do. The drawers take the flat 0.96 background the mockup's own colour
  states, minus the blur.
- A swipe gesture that opens or closes a drawer. The edge tabs and the scrim are the
  controls; a horizontal swipe on the map belongs to the camera, and a gesture that had to
  tell the two apart would take a threshold the map does not need.
- A rule of its own for landscape on a phone. It is the same width rule read at a different
  aspect: an 880 by 412 screen is below 1400 and takes the drawers, and above 720 so it
  keeps the one-row bar and the pointer-sized controls, which is what 880 pixels has the
  room for.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-hud`: a new requirement for the narrow layout, its drawers, its edge tabs, its scrim
  and its tap-target floor; a new requirement for the empty state of the right drawer; and
  a change to the Escape chain of the requirement that states the HUD's keys.
- `dataset-catalog`: the dataset library dialog draws as a full-screen sheet below the
  breakpoint.

## Impact

- `packages/galaxy-map/src/hud/styles.ts`: an `@media (max-width: 1399px)` block for the
  drawers and an `@media (max-width: 720px)` block for the phone treatment, and the
  base rules for the two tabs, the scrim and the empty state.
- `packages/galaxy-map/src/hud/index.ts`: the two tabs, the scrim, the right-drawer wrapper
  and its placeholder, the `data-panel` attribute, the selection hook that opens the right
  drawer, and the Escape step. This is the one source file with new behaviour in it:
  `categories.ts`, `info-panel.ts` and `dataset-dialog.ts` are unchanged.
- `e2e/hud-mobile.spec.ts`: new, the whole narrow layout.
- `e2e/frame-budget.spec.ts`: one reading of the scrim's cost, which belongs in the timed
  file and not in the new one.
- `playwright.config.ts`: the new file joins `chromium-touch` and leaves `chromium-gpu`.
- `e2e/hud.spec.ts`: a check that the desktop layout is unmoved at 1600 by 900, and the
  move of every wide-layout reading in the suite from 1280 by 720 to 1600 by 900.
- `docs/wiki/Examples/The-HUD.md`: a paragraph on the narrow layout, so the page a host reads
  does not describe the wide layout alone.
- `tests/main-bundle.test.ts`: the HUD chunk grows. It holds 71,668 bytes against an 80,000
  bound today, and the new CSS and the tab markup are the growth. The bound moves only if
  the reading passes it.
