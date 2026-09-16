## Context

See `proposal.md` for the motivation and the readings. Four constraints shape the work.

**The overlay is DOM, and that is deliberate.** `plane-overlay` states why: DOM text is a
crisp vector at every device pixel ratio and needs no font in a shader. So the answer is a
cheaper CSS property, not a move to canvas text.

**The cost is not the label count.** A synthetic sweep needs about 1,600 labels before the
per-frame CSS box rewrite is measurable. The map draws about 10 labels at the view the
budget states, and it still loses 7.5 ms a frame. Blur cost follows the blurred **area** and the number of times the browser
rasterises it, which is once a frame while the camera moves.

**A vsync-locked reading cannot see the fault.** Every existing budget in the specs reads
the animation frame interval, which is 16.7 ms whatever the work is, as long as the work
fits. The two blurs cost 7.5 ms of a 12.1 ms frame and dropped nothing.

**The dev container had no second browser.** Firefox would not start, and the cause was
not the browser: `/home/node/.cache` is owned by root, so Firefox could not create
`~/.cache/mozilla`. That is fixed in the working tree already.

## Goals / Non-Goals

**Goals:**

- Take the two CPU blurs out of the per-frame paint path, with a look the owner chose.
- Give the repository an instrument that reads main-thread paint cost, and a budget on it.
- Make Firefox a browser the gate runs, not a browser the project hopes about.

**Non-Goals:**

- No change to the overlay's placement, culling or transform. `plane-overlay` stands.
- No second look baseline. `e2e/look.spec.ts` stays a Chromium reading.
- No canvas text, no WebGL text, no font atlas.

## Decisions

### A text stroke, not a smaller blur

The measured options, on the same instrument as the budget: the mean frame interval with
the frame rate uncapped, at 1920x1080, with 10,000 systems and the HUD on, over the view
`browser-suite` states. The panels are
flat in every state, so the label edge is the only variable. Each state is the mean of
three runs, and the widest spread is 0.27 ms.

The third column reads each option against the `No edge at all` row of this same table.

| Option              | Mean frame | The edge costs | Look                       |
| ------------------- | ---------- | -------------- | -------------------------- |
| `0 0 10px` as it is | 8.7 ms     | 5.4 ms         | Soft cool glow             |
| `0 0 3px`           | 6.7 ms     | 3.4 ms         | Tighter glow, still a glow |
| 2.5px stroke        | 3.9 ms     | 0.6 ms         | Hard dark edge             |
| No edge at all      | 3.3 ms     | --             | Unreadable over the core   |

This is a second session of the same instrument, taken to rank the options. Its
`2.5px stroke` row, at 3.9 ms, is the state the `Neither blur` row of `proposal.md` reads
at 4.6 ms, so the two sessions sit 0.7 ms apart on the state they share. That is the drift
between sessions. The ranking is what this table is for, the budget's 2.4 ms of headroom
covers a drift of that size, and the two sessions are not added together: the same shadow
reads 5.4 ms here against a bare label and 4.2 ms there against a stroked one.

A smaller blur keeps the look and returns a third of the cost. The stroke returns almost
all of it and changes the look. The owner chose the stroke with those numbers in front of
them.

`paint-order: stroke fill` draws the stroke under the glyph, so the stroke widens the dark
edge outward rather than eating the letter. Firefox and Chromium both report
`CSS.supports('paint-order', 'stroke fill')` as true, and both honour
`-webkit-text-stroke`, which is checked and not assumed.

The stroke is 2.5 CSS pixels on a coordinate label and 2 on a marker name label, because
the name label draws at a smaller size.

### Flat panels, not a conditional blur

The alternative was to keep `backdrop-filter` and turn it off while the camera moves. It
holds the mockup's look at rest. It was rejected for two reasons: it needs a "the camera is
moving" class that the HUD does not have and that `map-hud` forbids it to derive from the
map's internals, and the blur would still run in every frame of every move, which is the
case that matters.

**What blurs, and what it costs.** Five rules carry the property, on six elements. While
the camera moves, only two of them are on the screen, both `gm-hud__panel`: the category
panel at 316 by 807 and the map options panel at 316 by 169 CSS pixels. The other four are the information
panel, a dialog, the dialog's frame and a lightbox. The three last were closed, and the
information panel draws only while a system is selected, which the reading did not do. The
reading counts the blurred elements that have a box on the screen, and counts two, so the
**3.5 ms** in the table is those two panels alone.

Those two panels draw at 0.86 alpha, so the backdrop shows through at 14 per cent
and the blur is close to invisible; the information panel is the third that draws over the
moving map, at 0.90.

The dialog scrim at 0.78, the dialog frame at 0.97 and the lightbox at 0.88 lose the
property as well, because the map keeps drawing behind an open dialog and each one
re-blurs in every frame while it is open. They keep the alpha they have. Raising a
full-screen scrim is the largest look change the change could make, it buys none of the
3.5 ms, and it is not what the owner was shown.

### Five decimal places, not four

The owner asked for four, which fixes `-9530.9375`. Five is the exact figure: 1/32 is
0.03125, five places in base ten, so five places reproduce every position the game can
hold and four still round the odd steps. The owner chose five when shown that.

### An uncapped frame rate as the instrument

Options considered:

1. **Read the process CPU time from `/proc`.** It is what found the fault. It needs the
   browser's process id, which the Playwright test fixture does not give, and it counts
   every process of the browser, including work that is not this page.
2. **Read the Gecko profiler from the test.** It gives the true attribution, down to
   `nsTextFrame::PaintOneShadow`. It is a Firefox-only API, it costs seconds a run, and
   the reading is a stack sample, not a number a budget can compare.
3. **Uncap the frame rate and read the interval.** `layout.frame_rate: 0` lets
   `requestAnimationFrame` run as fast as the work allows, so the mean interval **is** the
   per-frame main-thread cost. It is one preference, it needs no new API in the page, and
   it reads the same number the other budgets read.

The third is chosen. Its weakness is that it measures the whole frame, not the paint
alone, so it cannot say which part grew. The other two scenarios of the budget answer
that: one puts the old shadow back, the other puts the panel blur back, and each shows the
reading move on its own.

### The Firefox project runs two specs, not the suite

A second full run doubles the gate's wall time and buys almost nothing: the rest of the
suite reads behaviour that does not follow the browser. The Firefox project runs the
renderer check and the paint budget. It joins the timed pass, on one worker, because it
reads a time.

## Risks / Trade-offs

- **The budget is machine-dependent.** 7 ms is read on the project's test card in this
  container. A slower machine fails a correct tree. Mitigation: the gate is local and the
  container is the stated environment, as every other budget in the specs already assumes.
  The failure is loud and its cause is one number.
- **The look changes, and the mockup keeps the old look.** A hard edge is not a soft glow,
  and the panels lose their glass. Mitigation: the owner chose both against the measured
  alternatives, and the departure from `.design/` is recorded in the proposal and in the
  spec so the screenshot gate reads it as intended, not as drift.
- **`-webkit-text-stroke` is a prefixed property with no standard name.** Mitigation: it
  is supported in every browser the project runs, and the fallback if it were ignored is
  text with no edge, which the label opacity rules still keep readable over dark space.
- **The five-place position is longer text.** `POSITION` already takes both columns of the
  grid, and the requirement states that it holds the panel's longest value, so the extra
  two characters do not reflow the panel. The scenario that reads the box stays.
- **Firefox in the container is headless, and the owner's Firefox is not.** Headless
  Firefox composites in software. Mitigation: the fault reproduced here at the same
  proportion the owner's own profile shows, 30 to 40 per cent of the frame in CPU blur, so
  the instrument tracks the fault it is there to catch.

## Migration Plan

None. No data, no API and no stored state changes. `formatCoordinate` keeps its signature
and gains two decimal places; a host that read the panel text reads a longer number.
