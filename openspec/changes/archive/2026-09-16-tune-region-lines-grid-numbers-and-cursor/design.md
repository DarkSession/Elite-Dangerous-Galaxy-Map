## Context

See proposal.md for the motivation. Four marks are tuned, and each sits in one module:

| Mark              | Module                                                                |
| ----------------- | --------------------------------------------------------------------- |
| The boundary band | `src/render/region-pass.ts`, `src/render/shaders/region-composite.frag` |
| The subgrid reach | `src/render/grid-pass.ts`                                               |
| The numbers       | `src/app/grid-labels.ts`                                                |
| The cursor marker | `src/app/cursor-marker.ts`                                              |

Three constraints shape the work:

- The boundary pass writes **one** coverage channel at the full drawing buffer size and
  reads it once in a full-screen composite. The join rule is a `MAX` blend of that
  channel, so anything that adds a second ribbon draw would need a second buffer and a
  second join rule.
- The label sweep does fixed work in each frame: at most 25 crossings, 3 projections each
  and one homography solve for each candidate it keeps.
- The reference the look follows is a set of images the owner keeps outside the tree. It
  is read numerically, by sampling pixels, and no file of the repository names it.

## Goals / Non-Goals

**Goals:**

- Put the measured look of the reference boundary into the composite: a deeper outer band,
  a lighter core and a flat top with a short edge.
- Take the zoom bound off the grid levels with no change to the shader's structure.
- Move a number off its crossing and give it a reach that names every corner of the
  cursor's own cell.
- Give the marker a size that follows the camera distance.

**Non-Goals:**

- No change to the boundary's half width, its fades, its modes, its searched views or the
  counts `tests/region-views.test.ts` asserts.
- No change to the grid line's colour, width, alpha, merge rule or camera distance band.
- No change to the label's size rule, its alpha gate, its cap of 8 or its overlap test.
- No change to the marker's shape, colour or switch.

## Decisions

### The two tones come from the one coverage channel

The composite reads `coverage` once and takes both the alpha and the tone from it:

```glsl
float alpha = smoothstep(0.0, uEdgeShare, coverage);
float core  = smoothstep(0.75 - uCoreEdge, 0.75 + uCoreEdge, coverage);
vec3  tone  = mix(uTone, uToneCore, core);
```

`uEdgeShare` is `min(0.25, 4 / halfWidthCss)` and `uCoreEdge` is `1.5 / halfWidthCss`. The
pass already works the half width out on the processor for the ribbon quads, so both
shares are one divide there and no new state.

Alternatives considered:

- **Two ribbon draws**, a wide one and a narrow one. It is the obvious reading of "two
  lines", and it costs a second pass over the whole boundary set, a second coverage
  target and a second `MAX` join. The core would also join differently from the band at a
  corner, which is the fault the `MAX` rule exists to prevent.
- **A second channel in the coverage buffer** holding the core's own coverage. It doubles
  the buffer for a value the first channel already carries: the core is a threshold on the
  same distance.

### The numbers come from the reference and not from taste

The reference band was sampled across its width at three places, over two different
backgrounds. Solving `result = background + (tone - background) * alpha` for the two
backgrounds gives one alpha and one tone for each part:

| Reading            | Sample over the darker background | Sample over the lighter one | Solved tone     |
| ------------------ | --------------------------------- | --------------------------- | --------------- |
| Background         | `(102, 100, 109)`                 | `(126, 115, 120)`           | -               |
| Outer part         | `(154, 124, 109)`                 | `(163, 130, 115)`           | `(189, 140, 110)` |
| Core               | `(156, 132, 109)`                 | `(162, 139, 112)`           | `(189, 154, 108)` |
| Alpha, by channel  | -                                 | -                           | 0.63, 0.60, 0.45 |

The band measured about 40 pixels across with a core of 10 to 12, a flat middle and an
edge of about 5 pixels.

The spec takes the outer tone as measured, `(0.74, 0.55, 0.43)`, and the opacity as 0.62,
the middle of the three channel readings rounded to the tone. It takes the core **lighter
than the measurement**, `(0.90, 0.79, 0.52)` against the measured `(0.74, 0.60, 0.42)`.
The measured pair differ by 0.041 of luminance, which at an opacity of 0.62 is 6 of 255 in
the frame; the pair the spec states differ by 0.213, which is 34 of 255. The reference is
a screenshot of another program at its own scale and its own post-processing, so its
absolute separation is not a number this map can copy; what it shows is a band whose middle
reads as a line. 34 of 255 is what makes that reading hold at the band widths this map
draws, from 16 to 48 CSS pixels.

The look is checked against the reference by eye at apply time, with a screenshot taken at
a matching view, and the two tones are the values a reviewer can move if that check fails.
Nothing else in the change depends on them.

### The edge is fixed in CSS pixels and the core is a share

The edge is **4 CSS pixels** whatever the viewport, because it is a crispness and not a
size: an edge stated as a share of the half width would be 1.6 pixels on a small window
and 4.8 on a large one, and the band would read as sharp on one and soft on the other.

The core is **0.25 of the band's full width**, a share, because it is a part of the band
and has to grow with it. Its transition is 1.5 CSS pixels, fixed, for the same reason the
edge is.

**The edge is clamped to a quarter of the half width.** At the half width floor of 8 CSS
pixels, which is 500 CSS rows and below, a fixed 4 CSS pixel edge would take half of the
half width: the core's mix finishes at a gap of 3.5 CSS pixels and the flat top would end
at 4, so the band would read as a core with a ramp around it and no outer part at all. The
share is therefore `min(0.25, 4 / halfWidth)`, which is 4 CSS pixels from 1,000 CSS rows up
and a quarter below that. At the floor the edge is 2 CSS pixels and the outer part keeps
2.5 CSS pixels of flat top.

The clamp moves one reading of the delta: the width at half maximum is `2 * halfWidth -
edge`, which is 30.6 at 1,080 rows, 20.2 at 720 and 14.0 at 360, in place of a single
`2 * halfWidth - 4`. It is the reason a `min` appears at all; without a small-window case
the edge would be one constant.

### The grid keeps its per-level reach uniform

`gridReachPerLevel` stays, and it stays the one owner of the reach. It loses its
`focalCss` and `distance` parameters, because a reach no longer follows the camera, and it
fills the same array the renderer passes in. `gridZoomReach` and `GRID_REACH_ZOOM` go.

The alternative is to drop `uReach` and write `100 * spacing` in the shader. That moves a
rule into GLSL, where no unit test can read it, to save six floats.

### A number is placed by its own corner

`planePlacement` takes an anchor at the **middle** of the element, so the sweep gives it
the crossing less half the label's size and the gap:

```ts
const gap = GRID_LABEL_GAP_SHARE * spacingLy; // 0.04 of a spacing
const anchor = [gameX - widthLy / 2 - gap, gameZ + heightLy / 2 + gap];
```

**The two signs are not the same, and that is not a slip.** `planeCorners` in
`src/app/plane-overlay.ts` builds the element's rectangle with its local `y` growing
downward **along the game `-z` axis**, so the rectangle's `+z` edge is its top and its `-z`
edge is its bottom. Its bottom right corner is therefore at
`(anchor.x + widthLy / 2, anchor.z - heightLy / 2)`. Putting that corner at the crossing
less the gap gives `+` on `z` and `-` on `x`. The label then lies toward `-x` and `+z`,
which is up and to the left of the crossing on the screen at the default view. The delta's
scenario "A number stands clear of the lines it names" names the corner it reads, so a
wrong sign on either axis fails it rather than passing on the distance alone.

The sweep already has `widthLy` and `heightLy`, so this is arithmetic and not a new
projection. The reading the page exposes keeps the crossing's own projected point, which
the sweep already has, so "Every label sits on a line" still reads a lit pixel.

The background the label follows moves with the text: the sweep reads it at the centre of
the placement's screen bounding box, which `planePlacement` already returns, rather than at
the crossing. That is one more read of an existing value.

Alternatives considered:

- **An offset in screen pixels.** The label lies on the plane, so a screen offset would
  slide the text across the plane as the camera turns, and the gap would not follow the
  cell.
- **The middle of the cell above left.** It clears the lines by more, and it reads as a
  label of the cell rather than of the crossing. The number names a crossing.

### The marker's size band ends where the grid does

The size is `96 - 56 * smoothstep(12000, 60000, d)` CSS pixels. The near end is the camera
distance at which the coordinate grid goes out, so the marker holds its full size through
every view the grid draws in and shrinks only in the views that show the galaxy whole. The
far end is the start view, where the marker reaches its floor of 40 CSS pixels.

`cursorMarkerSideLy` already converts a CSS size to light years on the plane through
`planeSpanForScreenX`. The size becomes a function of `view.distance`, and both the overlay
and the placement read it from one place, so the element's own box and its plane rectangle
cannot disagree.

Alternatives considered:

- **A size in light years with clamps.** The marker would read as a place of the map and
  not as a control, and it would change size as the cursor moves over the plane.
- **One smaller size at every zoom.** It fixes the wide view and loses the near one, where
  the owner reads the current size as right.

### Two requirements outside the four marks carry the band's opacity

The opacity is 0.55 in two more places of the specs, and both are corrected in the delta:

| Requirement                                                     | What it says now                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `galactic-regions`, "A region in view carries a label ..."        | a scenario divides the band's alpha by 0.55 and reads the ridge profile |
| `coordinate-grid`, "The grid blends under the overlays ..."       | the boundary keeps `1 - 0.55` of the grid under it, that is 0.45        |

The first is the harder one. Its scenario scans a window of pixels at one range and takes
the **greatest** alpha, turned from a pixel through one tone luminance. The greatest reading
sits at the middle of a line, which now carries the **core** tone, so the scenario reads it
through the core tone and divides by 0.62. Two things follow. The flat top makes the reading
exact, which takes the 0.0025 term for the pixel offset out of the error budget. And the
scenario has to keep only the pixels over a background under 0.5 of luminance: over a
background brighter than both tones the two rooms are negative, the ratio of them turns
above 1, and a pixel of the outer part would read above a pixel of the core. The bound of
0.05 does not move.

Both requirements are restated in full in the delta, because a delta states a modified
requirement whole. Neither carries any other change.

### The test harness holds the tone and the opacity as its own constants

`e2e/regions.spec.ts` holds `TONE_LUMINANCE` and `BAND_OPACITY` as literals and turns a
pixel into an alpha through them. Three of its readings therefore move with the look and
not with the rule: the band width at half maximum, the `darkened` count and the
`middleIsLighter` flag. The harness takes the **two** tone luminances, reads the width
against the outer plateau rather than against the peak, and asserts the core over the outer
part in place of a middle-is-lighter flag. The `darkened` count is no longer 0 over a bright
background, because the outer tone at 0.581 sits below the tone-mapped core at 0.93, so the
assertion becomes the contribution and not its sign.

## Risks / Trade-offs

- **The lattice fills the frame again at a shallow pitch.** → This is the behaviour the
  owner asked for. Two rules still bound it: a level draws nothing below 8 CSS pixels of
  screen spacing, and a level stops at 100 of its own lines. Neither ends the lines that
  run toward the horizon: at a pitch of 45 degrees and a camera distance of 4,000 light
  years those are still 9.9 CSS pixels apart at the top row. The requirement states that
  reading and accepts it, rather than claiming a bound the two rules do not give. The frame
  budget scenario measures the cost, and the requirement states that a reach cuts what a
  level draws and not what the shader reads.
- **The deeper outer tone darkens the galactic core where the cream lightened it.** → The
  core tone is 0.213 of luminance above the outer tone at the same opacity, so a boundary
  reads as a line over the brightest part of the picture by its own contrast. The
  scenario "The band carries a lighter core inside a deeper outer part" holds that
  difference at 0.132 in the frame.
- **Three region scenarios read the profile across the band and their numbers move.** →
  Each is restated in the delta with its derivation, and the band's own half width is
  unchanged in all three. The searched views and the five counts
  `tests/region-views.test.ts` asserts read the geometry and the clearances, not the tone,
  so none of them moves.
- **The chosen core tone is stronger than the measurement.** → It is the one number in the
  change that rests on judgement rather than on a reading, and it is stated as a constant
  in one module. The look check at apply time is what settles it.
- **The label offset can push a number outside the viewport.** → The drop rules of
  `plane-overlay` already take an element whose quad falls off the frame, and the sweep
  drops a crossing that projects outside the viewport before it places anything. A number
  at the frame edge is dropped as it was.
- **A wider reach puts more numbers in the frame.** → The cap of 8 and the overlap test
  are unchanged, and the sweep's candidate ring is unchanged at 25 crossings, so the work
  of a frame does not move.

## Migration Plan

No data, no storage and no public API changes. `GalaxyMapOptions`, the handle and the
`debug` surface are untouched, so a host that embeds the map sees only a different
picture.

One baseline image is expected to move. `e2e/look.spec.ts` shoots the default view, at
60,000 light years, where neither the grid nor the boundary overlay draws. The cursor
marker does draw there, as a DOM element over the canvas and inside the shot's own box,
and it falls from 96 to 40 CSS pixels. The baseline is regenerated in the same change, and
the regenerated image is compared with the old one so that nothing else moved.
