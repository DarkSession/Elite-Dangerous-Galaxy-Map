## Why

The region labels pile up in the top left corner of every page that does not carry the
demo page's stylesheet, and they flicker there as the frame changes. The nine sample
pages of `apps/demo/examples/` are all such pages.

A reading of the built site measured it. Each sample page opened, then took the computed
style and the box of every `.region-label` over 40 steps of a zoom out:

| Sample                  | On load | Readings during a zoom out | `position: absolute` |
| ----------------------- | ------- | -------------------------- | -------------------- |
| `the-camera`            | 1       | 142                        | 0                    |
| `spheres-and-lines`     | 1       | 60                         | 0                    |
| `a-dataset-catalog`     | 0       | 68                         | 0                    |
| `a-record-with-details` | 0       | 59                         | 0                    |
| `the-system-icons`      | 0       | 59                         | 0                    |
| `systems-on-the-map`    | 0       | 0                          | —                    |
| `the-hud`               | 0       | 0                          | —                    |
| `the-nebulae`           | 0       | 0                          | —                    |
| `the-view-in-a-url`     | 0       | 0                          | —                    |

**Not one of the 388 readings was positioned.** Every one read `position: static`, every
one sat at `x = 0`, and they stacked down the left edge at `y = 0, 22, 44, 66, 88`, each
one 1,280 CSS pixels wide, which is the width of the page. `the-camera` shows the fault
on load, with "Norma Arm" across the top of the window.

The four samples that read nothing open at the default 60,000 light years, above the
30,000 light year zoom fade, and a zoom out only goes further out. A zoom in takes them
into the band as well, so the fault reaches all nine.

The same reading took `.gm-system-label` on those pages. Each one read
`position: absolute`, at its own place on the canvas. The fault is the region label
alone.

The library builds each region label with a class name and writes `left` and `top` on it
each frame, but it never sets `position`. `left` and `top` do nothing on a static box, so
every label lays out in normal flow from the top left of the overlay host. The chosen set
changes from frame to frame, so the stack re-flows and the labels blink.

`.region-label` carries a rule in exactly one file in the repository, the inline
`<style>` of `apps/demo/index.html`. The region label is the only overlay element the
library does not style itself: the system name label, the hover ring, the selection pin,
the grid label and the cursor marker all set their own `position` and their own look.

Two things make this the library's fault and not the page's. `docs/wiki/Getting-started.md`
tells a host that a bare canvas gets the region overlay, and never asks for any CSS. And
every region label browser test runs against the demo page, so the suite is green while
all nine sample pages are wrong.

## What Changes

- The label overlay SHALL set the whole look of a region label on the element itself:
  the position, the box, the font, the colour and the outline. A host that gives a canvas
  alone then gets labels in the right place, whatever stylesheet the page carries.
- The default look SHALL draw the outline with the blurred `text-shadow` the demo page's
  rule drew, and not with a stroke. The owner chose the shadow for the look. The cost is
  known and accepted: `browser-suite` records that Firefox rasterises a blurred text
  shadow on the CPU, and that the two shadows of the name label overlay cost 4.2 ms of a
  12.1 ms frame. The region overlay shows at most `MAX_LABELS`, which is 12, against the
  name overlay's 64, so the cost here is smaller. This is the one place the library draws
  an outline with a shadow; the system name label and the grid label keep their strokes.
- **BREAKING** for a host that restyles `.region-label` from a stylesheet: an inline
  style wins over a stylesheet rule, so the 13 properties the library now writes cannot
  be overridden that way. The class name stays, so a rule that sets a property the
  library does not write still applies. The three font properties go on as longhands and
  not as the `font` shorthand, which would also reset `font-style`, `font-variant`,
  `font-weight`, `font-stretch` and `font-size-adjust` and take five more properties
  from the host without naming them.
- The `.region-label` rule of `apps/demo/index.html` goes. The library's default carries
  the same look, so the rule is dead weight that a reader would take for the source of
  the look.
- The overlay host the library makes SHALL cover the canvas's box and take it again when
  the canvas moves or resizes. Today `makeLabelHost` writes the width and the height
  once, at creation, and pins the element to the origin of the canvas's parent. The host
  clips with `overflow: hidden`, so a canvas that is not at its parent's origin has every
  label offset, the labels near the new edges are cut off after a resize, and a canvas
  that measures 0 at the moment the map starts gives a host of 0 by 0 that hides every
  label for good. The place comes from the two client rects and not from
  `canvas.offsetLeft`, which is measured from a different element than the one the host's
  `left` resolves against; `design.md` gives the case where the two part company.
- The browser suite SHALL read the placement and not only the count. The sample page
  test reads canvas pixels alone, and the label host test counts elements alone, so
  neither one fails today.

### Scale

The overlay holds one pooled element for each of the 42 regions and shows at most
`MAX_LABELS`, which is 12, in a frame. The look is written once for each element when
the overlay is built, so the label write stays what it is today: `left`, `top` and
`opacity` on at most 12 elements.

The overlay host adds the only new per-frame work: two `getBoundingClientRect` reads and
a four-number compare, in a frame that already forces the layout with
`renderer.viewport()`. The compare writes nothing while the canvas holds still, so a
steady frame costs the two reads and nothing else. The work does not follow the number
of systems, the number of regions or the number of labels.

### Non-goals

- Renaming `region-label` to `gm-region-label` to match the library's other class names.
  The name is in the browser suite and in any host CSS, and the rename buys nothing this
  change needs.
- An option that lets a host replace the label look. No host asks for one, and the class
  name still carries a rule for any property the library leaves alone.
- The near-plane guards that read `clipW <= near`. That form is false for `NaN`, so a
  `NaN` coordinate reaches the division and the marker overlay writes `"NaNpx"`, which
  the CSSOM drops, leaving a pooled element at its static top-left position. The sites
  are `markers.ts:315`, `markers.ts:354`, `grid-labels.ts:549`, `picking.ts:113` and
  `icon-pass.ts:320`; `plane-overlay.ts:268` and `:406` already read `!(clipW > near)`.
  This is a second, latent path to a label in the top left, but it needs a `NaN`
  coordinate to fire and the name labels are off by default, so it is not what this
  report describes. It is worth its own change.
- `debug.project()` at `create-map.ts:1939`, which drops the `inFront` flag `project()`
  returns and hands back a finite, mirrored point for a position behind the camera.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `galactic-regions`: the requirement "A region in view carries a label that fades with
  its own range" says a label is one DOM element with one opacity, and says nothing about
  who places it. It gains the rule that the library writes the element's position and its
  look.
- `real-systems`: the requirement "The map is created through a library entry point that
  returns a handle" says the library makes its own overlay element with no `labelHost`,
  "so a host that gives a canvas alone gets a working map", and says nothing about what
  that element does afterwards. A new requirement says it covers the canvas's box and
  takes that box again when the canvas moves or resizes. The existing requirement and
  its scenario "The library makes its own label host" are unchanged.
- `sample-pages`: the requirement "Every sample draws on the GPU" reads canvas pixels
  alone. It gains a scenario that reads where the region labels of a sample page sit.

## Impact

- `packages/galaxy-map/src/app/labels.ts`, `createLabelOverlay`: the element factory
  writes the look. The measure step at `measureById` reads a correct box for the first
  time on a page with no CSS, so the placement maths runs on a real size.
- `packages/galaxy-map/src/app/create-map.ts`, `makeLabelHost` and `drawFrame`: the
  owned host covers the canvas and keeps covering it. `onResize` needs no change,
  because the frame that follows a resize does the work.
- `apps/demo/index.html`: the `.region-label` rule goes.
- `docs/wiki/Getting-started.md`: says the library styles the region labels.
- `e2e/systems.spec.ts`, `e2e/samples.spec.ts`: the two readings above.
- `tests/main-bundle.test.ts`: the entry chunk grows by the style table and the host
  placement, which both reach every map, so `ENTRY_CHUNK_LIMIT` rises from 275,000 to
  280,000 and the history comment records the reading.
- `packages/galaxy-map/src/app/labels.test.ts`: a unit reading of the element's style.
- No change to any dependency, to the exports map or to the public type surface.
