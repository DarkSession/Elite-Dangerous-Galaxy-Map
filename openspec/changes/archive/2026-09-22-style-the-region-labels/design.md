## Context

See `proposal.md` for the fault and the reading that measured it. What the design needs
from the tree:

**The overlay elements the library builds, and who styles each one.**

| Element               | Class              | Built in                | Sets its own `position` |
| --------------------- | ------------------ | ----------------------- | ----------------------- |
| System name label     | `gm-system-label`  | `markers.ts:153`        | Yes, `:157`             |
| Hover ring            | `gm-system-ring`   | `markers.ts:179`        | Yes, `:183`             |
| Selection pin         | `gm-system-pin`    | `markers.ts:195`        | Yes, `:204`             |
| Grid coordinate label | `gm-grid-label`    | `grid-labels.ts:715`    | Yes, `:718`             |
| Cursor marker         | —                  | `cursor-marker.ts:133`  | Yes, `:139`             |
| **Region label**      | **`region-label`** | **`labels.ts:1513`**    | **No**                  |

`labels.ts:1515-1517` states the rule it follows: "The host styles `.region-label` and
the library writes the place." That rule is the fault. Nothing else in the library
follows it, and `docs/wiki/Getting-started.md:48` promises the opposite.

**The overlay host.** `makeLabelHost` at `create-map.ts:845` builds the element when the
options name no `labelHost`, and `create-map.ts:1661-1666` gives it to all four
overlays. It writes the width and the height at `create-map.ts:852-853` and pins
`top: 0; left: 0` of the canvas's parent. `ownedHost` at `create-map.ts:1152` holds it,
and `create-map.ts:2119` removes it at teardown. Nothing writes its box again.

**The look the demo page draws**, from the rule at `apps/demo/index.html:37-49`:
`position: absolute`, `white-space: nowrap`, `padding: 2px 6px`, `color: #cfe4ff`,
`font-size: 13px`, `line-height: 16px`, `letter-spacing: 0.08em`,
`text-transform: uppercase`, `text-shadow: 0 0 6px #000, 0 0 2px #000`,
`pointer-events: none`.

## Goals / Non-Goals

**Goals:**

- The region label draws in the right place on a page that carries no rule for it.
- The library's overlay elements all follow one rule about who styles them.
- The browser suite fails if the fault comes back, on a page with no rule of its own.

**Non-Goals:**

- Any change to the placement maths of the fade requirement. The figures, the 48 CSS
  pixel inset, the ring search and the two fades stay as they are.
- A style hook or a theme option. `proposal.md` lists the rest.

## Decisions

### The look goes on the element, not into an injected style sheet

The library could inject a style sheet that carries a `.region-label` rule, which would
leave a host free to override it from its own sheet. It does not, for two reasons.

`create-map.ts:1670-1672` states the standing rule: "the only sheet the library injects
belongs to the HUD, which is opt-in". A host that asks for no HUD gets no sheet from the
library today, and a sheet for the labels would break that. The same comment gives the
reason the map already writes `touch-action` inline rather than in a sheet: a host may
load a reset sheet that undoes it.

The other five overlay elements are already inline. One rule for all six is worth more
than the override a sheet would buy, and no host asks for that override.

**Alternative rejected: set `position` alone and leave the look to the host.** It is the
smaller diff and it fixes the stacking. It leaves the sample pages drawing labels in the
page's `system-ui` body text at the browser's default size, which is not the map's look,
and it leaves the region label as the one element whose look a host must supply. The
measure step would still read a box that follows the host's `body` font, so the
placement would still move with a font the host set for its own text.

### The outline is the blurred shadow, not a stroke

The library writes `text-shadow: 0 0 6px #000, 0 0 2px #000`, which is what the demo
page's rule drew. The owner chose it after seeing the stroke drawn, and the choice is
about the look: the 2.5 pixel stroke draws a hard edge around the glyph, and the two
blurred shadows lay a soft dark field under it that the hard edge does not give.

**The cost is known and accepted.** `markers.ts:169-172` records the reading: Firefox
rasterises a blurred text shadow on the CPU, and the two blurred shadows of the name
label overlay cost 4.2 ms of a frame that cost 12.1 ms while the camera moved.
`browser-suite` holds it, and `paint-cost.spec.ts` runs in the Firefox project for that
reason. The overlay shows at most 12 labels, against the name overlay's 64, so the cost
here is smaller, but it is not nothing.

This makes the region label the one overlay element that draws its outline with a
shadow. The system name label at `markers.ts:171` and the grid coordinate label at
`grid-labels.ts:726` keep their strokes, and this design does not change them. The
inconsistency is deliberate and it is the owner's call.

**If a Firefox frame ever measures short because of it**, the change to make is the
stroke this section rejected: `paint-order: stroke fill` with
`-webkit-text-stroke: 2.5px rgba(0, 0, 0, 0.9)`. The width 2.5 is the figure
`GRID_LABEL_STROKE_CSS` carries, because a region label draws at 13 CSS pixels as the
coordinate label does, while `markers.ts:172` takes 2 for the 10 pixel name label.
`paint-cost.spec.ts` is where such a measurement would show.

Neither a shadow nor a stroke enters the layout box, so `measureById` reads the same box
either way and no placement figure moves.

### The font goes on as three longhands, not the shorthand

`markers.ts:164` writes the `font` shorthand for `gm-system-label`. The region label
does not follow it. The shorthand resets `font-style`, `font-variant`, `font-weight`,
`font-stretch` and `font-size-adjust` to their initial values in its own declaration, so
written inline it silently puts `font-style: normal` on the element and an inline value
beats a page rule. The spec's scenario "A page rule still reaches a property the library
leaves alone" would then be false, and the BREAKING note would understate what a host
loses by five properties it never names.

`font-size: 13px`, `line-height: 16px` and `font-family: system-ui, sans-serif` take the
same three values and leave the other five alone.

A unit test would not catch the difference. Vitest runs in the `node` environment
(`vitest.config.ts:5`), so there is no CSS engine: a fake element records the string it
is handed and gives it back, and a shorthand is never expanded. The reading that can
fail is `getComputedStyle` in the browser suite, which is where the spec puts it.

### The font family is named and not inherited

The demo rule names none, so the label inherits `system-ui, sans-serif` from the demo
page's `body`. The library names `system-ui, sans-serif` at 13 pixels over 16, which is
what the demo draws today, so the look does not change there.

It has to be named rather than inherited because `measureById` at `labels.ts:1524-1544`
appends the element, reads `getBoundingClientRect()` and keeps the box for the life of
the overlay. The placement holds that box inside the viewport and inside the 48 pixel
inset. An inherited family therefore lets a host move the labels by setting a font on
`body` for its own text, and a web font that loads after the first measure would leave
every box wrong for good, because the measure is kept.

The other overlays name `'IBM Plex Mono', ui-monospace, monospace`. The region label
does not follow them: it is uppercase display text at 13 pixels with `0.08em` of letter
spacing, the demo has drawn it in the sans stack since it was written, and a change to
mono would change the look of the demo page for no reason this change needs.

### The owned host takes the canvas's box in `drawFrame`

`drawFrame` at `create-map.ts:1560` already holds the size: `renderer.viewport()` gives
`canvas.clientWidth` and `clientHeight`, bounded below by 1 (`renderer.ts:640-643`), and
it is read before the four overlays update. `makeLabelHost` pins `top: 0; left: 0` of
the **parent**, and a host may give the canvas a box of its own inside a larger element,
which `placeLoadingImage` at `create-map.ts:863-866` already allows for. On such a page
every label today is off by the canvas's offset.

**The place comes from the two client rects, not from `offsetLeft` and `offsetTop`.**
Those two look like the pair to use, and `placeLoadingImage` uses them, but they do not
answer this question. `canvas.offsetLeft` is measured from `canvas.offsetParent`, while
the host's `left` resolves against **its containing block**. Those are two different
frames, and the pair that does not depend on which one the browser answers in is the
pair to use.

**The two frames were measured in Chromium, and they agree on more pages than the
CSSOM text suggests.** The reading built a canvas and the host as siblings, with the
host at `left: 0`:

| The page                                  | `offsetParent` | `offsetLeft` | Canvas at | `offsetLeft` puts the host at |
| ----------------------------------------- | -------------- | ------------ | --------- | ----------------------------- |
| Canvas in a static `body`, 8px margin      | `BODY`         | 8            | 8         | 8, correct                    |
| Static wrapper, `margin-left: 40px`        | `BODY`         | 40           | 40        | 40, correct                   |
| `position: relative` wrapper               | `DIV`          | 0            | 40        | 40, correct                   |
| `transform` wrapper, static                | `DIV`          | 0            | 40        | 40, correct                   |
| `filter` wrapper, static                   | `DIV`          | 0            | 40        | 40, correct                   |
| **Canvas in a static `td`, table at 40px** | **`TD`**       | **0**        | **40**    | **0, wrong by 40**            |

Two facts come out of it. Blink answers `offsetLeft` from the document origin when the
offsetParent is a static `body`, so the plain page — a canvas in `body`, no CSS — agrees
rather than parting. And Blink makes a `transform` or a `filter` ancestor the
offsetParent, so it follows the containing block more closely than the specification's
"nearest positioned ancestor" wording does.

**The case where the frames really part is the specification's third offsetParent
rule.** A static `td`, `th` or `table` ancestor is an offsetParent, and it is **not** a
containing block for an absolutely positioned element. A canvas in a table cell
therefore reads `offsetLeft: 0` while the host's `left: 0` lands at the initial
containing block's origin, so an `offsetLeft` implementation puts the host at the
table's left edge and every label is off by the cell's offset.

An earlier draft of this design gave the plain page as the case that parts. That
prediction is wrong for Chromium, and the reading above replaces it. The conclusion does
not change: the rect difference asks no question about the page's layout, so it holds
whatever frame the browser answers in, and it is the pair to use.

The frame therefore reads `canvas.getBoundingClientRect()` and
`host.getBoundingClientRect()`, both in viewport coordinates, and corrects the host by
the difference: `left = written + canvasRect.left - hostRect.left`, and the same for the
top. `written` is the number the frame before wrote, held in the closure, so the
correction needs no computed-style read. This is self-correcting whatever the containing
block turns out to be, and it needs no rule about the page's own layout.

**The held value starts at what `makeLabelHost` wrote**, and `makeLabelHost` places the
element the same way, after it appends it. The correction adds a difference to the value
written last, so a held 0 against a host already placed drops that place for one frame,
and the resize and offset scenarios each draw one frame and then read.

**The ceiling.** The difference is in screen pixels and `left` is in local CSS pixels.
Under an ancestor `transform: scale(s)` the correction is therefore scaled: it converges
for `s < 2` and diverges above it. No page in the tree scales an ancestor of the canvas,
and reading the accumulated scale to divide it out costs more than the case is worth. A
`ponytail:` comment where the correction is written names the ceiling.

Writing costs a four-number compare each frame, and a steady frame writes nothing
because the difference is then 0. The two rect reads are the added cost, taken in the
same frame in which `renderer.viewport()` already forces the layout.

This is the same rule the renderer follows: read the canvas's box each frame rather than
keep it. `onResize` needs no change, because the frame that follows a resize does the
work.

**The write goes immediately after the `size` read at `create-map.ts:1560` and before
`cursorMarker?.update`.** A write after `labels?.update` would place the labels of that
frame against the box of the frame before, so the frame that follows a resize would
still clip against the old box and the fault would show for one frame.

**The zero-size case falls out of the same write.** A canvas that measures 0 when the map
starts gives a host of 0 by 0 today, and `overflow: hidden` then clips every label for
good. With the per-frame write the first frame after the canvas gets a box fixes it,
whether or not a window resize fired.

`ownedHost` is the flag: `create-map.ts:1662` sets it only when the library made the
element itself. `drawFrame` writes the box only when it is not null, so a `labelHost`
the options name keeps whatever place and size its own CSS gives it.

**Alternative rejected: write it in `onResize` alone.** `onResize` at
`create-map.ts:1602` already runs on the resize path, so it looks like the natural place.
It misses the canvas that grows with no window resize, which is the zero-size case: a
map started inside a `display: none` parent stays clipped until something resizes the
window.

**Alternative rejected: a `ResizeObserver` on the canvas.** It is the direct tool and it
catches every growth. It adds an object to build, to disconnect at teardown and to guard
for a host document that has none, and it fires on a task of its own, so the host's box
would trail the frame's by one turn of the loop. It also reports a size and not a place,
so the offset would still need the rect read.

**`makeLabelHost` keeps its one-time write.** `create-map.ts:852-853` writes the width
and the height when the element is made. The write stays, and takes the place as well,
so the host covers the canvas before the first frame rather than starting at 0 by 0 and
correcting itself. A label measured in a 0 by 0 host would still measure correctly,
because it is `position: absolute` with `white-space: nowrap` and shrinks to its text,
but a host that is right from the start needs no such argument.

### The demo page's rule goes

An inline value wins over a stylesheet rule, so every property in the table would be
dead. A reader who found the rule would take it for the source of the look and would
edit it with no effect. The library's default draws what the rule drew, so the demo page
loses nothing and its look does not change.

`e2e/look.spec.ts:623` screenshots `#map`, which is the canvas. The region labels are
siblings of it in the DOM, so the committed baseline image does not change and needs no
new approval.

## Risks / Trade-offs

- **A host that restyles `.region-label` from a sheet loses the properties in the table**
  → The proposal marks it BREAKING. The class name stays, so a rule that sets a property
  the table leaves out still applies, and a host that needs one of the 13 can use
  `!important`. The longhand decision above keeps the loss to the 13 named properties.
  No host in the tree does this: the demo page's rule is the only one, and it goes.
- **The blurred shadow costs CPU time in Firefox** → `paint-cost.spec.ts` runs in the
  Firefox project and measures the frame. The overlay draws at most 12 of these labels,
  against the 64 of the name overlay that the 4.2 ms reading covers. The section above
  names the stroke to fall back to if a frame ever measures short.
- **The region label's outline no longer matches the name label's and the grid label's**
  → The three no longer read as one set. This is the look the owner chose, and the demo
  page has drawn the shadow since the label was written, so the demo page does not
  change. The baseline image shows `#map`, which is the canvas, so it does not cover it.
- **The per-frame size write on the owned host costs a style write** → Only when the two
  numbers differ, which is a resize and not a frame. A steady frame does the compare and
  writes nothing.
- **A page that sets `box-sizing` globally through `*`** → The element names
  `border-box` itself, so the padding is inside the measured box whatever the page says.
- **`measureById` keeps a box read before a web font loads** → This is the state today
  and the change does not make it worse. Naming `system-ui` narrows it: the family is
  the one already loaded and not one the page fetches. A font-driven re-measure is
  outside this change.

## Migration Plan

One release of the library. A host that gave no `labelHost` and no CSS gets working
labels with no change of its own. A host that styled `.region-label` sees its rule stop
applying to the 13 properties and keeps the class name to reach the rest. The
`BREAKING` note of the proposal is what the release notes carry.

Rollback is the revert of the two source files: nothing is written to disk, no data
shape changes and the exports map is untouched.
