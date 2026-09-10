## Why

The boundary set draws every curve as a chain of chords. Measured on the real data, the
worst turn at a vertex where the traced boundary does **not** turn is 30.6 degrees, and
the `Galactic Centre` — a near-circular region — draws as a heptagon.

Tightening the fit does not fix it. The source is a 49.3494 light year raster, and below
a tolerance of about 80 light years the simplification stops cutting across the staircase
and starts tracing it: at 60 light years the worst such turn is 90 degrees and 243
vertices turn by more than 15, against 14 today. The line gets worse, not better.

| fit tolerance | vertices | worst turn at a smooth place | turns over 15 degrees |
| --- | --- | --- | --- |
| 190 (today) | 562 | 30.6 deg | 14 |
| 100 | 678 | 25.9 deg | 9 |
| 80 | 750 | 25.9 deg | 7 |
| 70 | 798 | 51.6 deg | 11 |
| 60 | 1,114 | 90.0 deg | 243 |

So the **primitive** is the limit, not the parameter. A working spike replaced the chords
with a G1 arc spline at the unchanged 190 light year tolerance and drew the `Galactic
Centre` as a circle, with every real corner still sharp. It cost no accuracy at all: the
departure stayed at 185.8 and 189.8 light years, because an arc bulges **towards** the
traced boundary that the chord was cutting the corner off.

The same spike exposed two label faults that have nothing to do with arcs. Two of the
twenty labels in a normal frame sit flush against the frame edge and read as cut, because
the slide stops at the first point whose box just clears the edge. And the label with the
weakest contrast on the page is the one over the bright core — `GALACTIC CENTRE`, the
region the spec works hardest to guarantee is named.

## What Changes

**The boundary set carries arcs.**

- A primitive becomes a start vertex, an end vertex and a **signed curvature**. Zero
  curvature is a straight line, so the set holds both without a second code path.
- Each run of the simplified chain between two real corners is fitted with a **biarc
  spline**: consecutive vertices are joined by two circular arcs that meet tangentially,
  so the line is tangent-continuous inside a run and breaks only at a corner the traced
  boundary really has. The corner test is the two-chord traced turn the set already uses, at
  **30 degrees** rather than 20. Measured, no kept vertex of the set holds a traced turn
  between **22.93 and 39.59 degrees**, so 30 sits in an empty band 7.1 degrees above the
  highest wobble and 9.6 below the lowest real corner, and the result does not depend on the
  number. The four breaks below the band read 20.2 to 22.9 degrees and are raster jitter; the
  worst of them made the line kink 50.6 degrees on a smooth bend near the galactic centre.
- Measured on the build: **593 primitives over 716 vertices, 11.2 KiB**, against 439
  primitives, 562 vertices and 6.6 KiB today. The
  curvature is one `float32` per vertex, indexed exactly as the vertices are, so the
  renderer binds it at the same per-chain offset as the positions. The
  departure bound of 200 light years is unchanged and still met at 185.8 and 189.8.
- The fit tolerance stays at 190 light years. Arcs at 190 beat chords at 100, so the
  tolerance does not move and the departure figure the specs carry does not change.

**The renderer expands an arc on the GPU, and this is not what an earlier sketch of this
change said.**

- An earlier framing put an arc distance field in `regions.frag`. That is wrong.
  `regions.frag` measures distance **in screen pixels**, and a circle on the plane
  projects to a conic under perspective, not to a circle; distance to a conic needs a
  quartic. Measuring in world space instead and converting to pixels would make the drawn
  width anisotropic under obliquity and break the scenario that holds the line to 4 CSS
  pixels.
- Instead `regions.vert` expands one arc into a run of sub-segments, choosing how many from
  the **sagitta in pixels** — the turn is the wrong quantity, because at a fixed sub-angle
  the sagitta grows with the radius — and the fragment shader is **unchanged**. The screen-space width,
  the capsule ends and the `MAX` blending that makes a join read like a straight run all
  keep working exactly as they are tested today.
- This keeps the upload small — the arc data is 11.2 KiB — while the drawn geometry is
  generated per frame rather than stored.

**BREAKING**: `The set does not fragment` cannot survive as written. It allows at most 20
segments shorter than 500 light years, and it exists to stop a fit that meets the
departure bound by cutting the line into short pieces. With an arc primitive that test
measures the wrong thing: an arc's two halves are short by construction and shortness is
now what makes the line smooth. It is replaced by a rule that measures faceting directly:
walk the drawn line over a 1,000 light year window and, where the traced boundary does not
corner, hold the drawn turn to no more than 10 degrees above the traced turn at the same
place.

That bound is **relative** on purpose. Two absolute thresholds — a drawn turn over 10
degrees requiring a traced turn over 20 — leave a dead band that a correct fit falls into,
because a circle of radius `R` gives a windowed turn of `500 / R` radians and the two
thresholds sit at 2,865 and 1,432 light years. Measured on the three chains that bound the
`Galactic Centre`, the traced turn has a median of 9.0 degrees over that window and 45.3
percent of its 481 nodes are over 10 while only 15.6 percent are over 20, so about 30 percent
of the region this change exists to draw as a circle sits inside the band.

The same measurement answers the other question the 20 degree break test raises. It does not
turn every node of a tightly curving region into a corner: the median traced turn on that
boundary is 9.0 degrees, well under the test, and the 28 nodes over 60 degrees are the real
corners the fit has to keep.

**Labels stop short of the frame edge.**

- The slide's feasibility test **and the scale search** take the viewport **inset by a
  fixed number of CSS pixels**, rather than the viewport itself. Both, because the slide
  tests the floor-scale box and the scale search then grows it by up to 1.43 times. The box stays centred on its anchor, so
  nothing moves across a region boundary; the anchor simply stops sliding a little sooner.
- Measured today at `#c=15,0,25895&d=20000&p=35&y=0` and 1920x1080, 2 of the 20 labels sit
  against a frame edge: `Outer Arm` at 0.0 CSS pixels and `Norma Expanse` at 0.2. The other
  18 clear the nearest edge by 90.5 or more, so the fault is narrow and total: a box either
  has room or is flush, and a flush box reads as clipped.

**Labels stay legible over the bright disc.**

- `.region-label` is `#cfe4ff` with a black glow, which is tuned for the dark space
  between the arms. Over the core the text and the background are both bright and the
  glow reads as a smudge. The label SHALL hold a minimum contrast against the frame behind
  it, measured from the drawn pixels rather than asserted by eye.

## Capabilities

### New Capabilities

None. The work changes how an existing capability behaves.

### Modified Capabilities

- `galactic-regions`:
  - `The boundary set is simplified to straight segments` is **modified** — it becomes an
    arc spline. The trace, the chain linking, the departure bound, the corner rules and
    the transferability carry over; the primitive and the fragmentation scenario change.
  - `The boundaries draw on the galactic plane in a zoom band` is **modified** — the pass
    now draws a curved primitive, and the join rule has to hold where two arcs meet as
    well as where two straights meet.
  - `A region in view carries a label on its centre` is **modified** — the slide and the
    scale search both take an inset, and the label carries a contrast rule.

## Impact

- `src/scene-data/region-lines.ts` — gains the biarc fit after the simplification, and
  emits the curvature array. The trace and the simplification are unchanged.
- `src/scene-data/types.ts`, `src/scene-data/messages.ts` — `RegionLines` gains a
  curvature array, one value per vertex, transferable with the rest.
- `src/render/shaders/regions.vert` — expands one arc into sub-segments. This is the whole
  of the renderer change.
- `src/render/region-pass.ts` — binds the curvature attribute and raises the instance count
  per chain from one per segment to one per sub-segment.
- `src/render/shaders/regions.frag` — **unchanged**, deliberately.
- `src/render/renderer.ts` — passes the light-years-per-pixel the sub-chord count needs.
- `src/render/global.ts`, `src/app/main.ts` — a `regionLineCurvature` hook, because the
  browser view search cannot measure to the drawn line without the curvature.
- `src/app/labels.ts` — the slide's feasibility test and the scale search both take an
  inset.
- `index.html` — the label style gains whatever the contrast rule needs. The rule fixes the
  measurement and the bound; the treatment is the owner's call and the task list stops for
  it.
- `e2e/regions.spec.ts`, `tests/region-views.ts` — `gapTo` and `clearanceFrom` measure to
  a segment. They must measure to an arc, or the view searches will pick a point that is
  not on the drawn line.
- `e2e/region-views.ts` — holds three committed view constants that carry **vertex
  indices**: `VERTICAL_CROSSING`, `SHARP_CORNER` and `LONG_SEGMENT`. The biarc joints shift
  every index, and `tests/region-views.test.ts` re-runs the search and fails if the
  constants do not match, so they have to be regenerated.
- `src/render/region-pass.test.ts` — asserts one instance per segment and the exact
  attribute-pointer offsets. Both change with the sub-instances and the curvature
  attribute.
- `e2e/labels.spec.ts` — gains the inset assertion and the contrast reading.
- `docs/roadmap.md` — the phase 2 record of the straight-segment set is replaced.
- No dependency changes.

**Scale.** The fit runs once in the worker over 123 chains and 439 simplified spans, after
the simplification that already runs there; it is a closed-form biarc solve per span and
adds no region lookups. The page receives 593 primitives and 716 vertices, 11.2 KiB. The
renderer draws at most a few thousand sub-segments a frame at 1920x1080, against the 439
quads it draws today, and the region pass is a single-channel coverage buffer that already
runs well inside the frame budget. The label placement is unchanged in cost: the inset
moves one comparison.
