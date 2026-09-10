## Context

See `proposal.md` for motivation and for the measurements.

Four facts shape the approach.

**The evidence is a working spike, not a projection.** The biarc fit was built, wired into
`packRegionLines` and drawn by the current renderer through a tessellation, and the frames
were read on the NVIDIA card. Everything below about how the line looks and what it costs
comes from that build. The spike is kept out of the tree; its source and its one-line patch
sit beside this change in the session scratchpad.

**The raster is the floor for a chord fit.** The source is a 49.3494 light year staircase.
Douglas-Peucker picks its vertices from raster nodes, so tightening the tolerance shortens
the segments until the staircase itself has to be tracked. Measured, the worst turn at a
place the trace runs straight falls from 30.6 degrees at 190 light years to 25.9 at 80, and
then rises to 51.6 at 70 and 90.0 at 60. There is no tolerance that makes a chord fit smooth.

**The fragment shader measures distance in screen pixels.** `regions.frag` takes
`gl_FragCoord`, clamps it to the segment `vStart`-`vEnd` in device pixels, and writes
coverage from that distance, with `MAX` blending so an overlap at a join keeps the smallest
distance. That is what makes the drawn width exactly 4 CSS pixels at any device pixel ratio
and any obliquity, and it is what the join rule is tested against.

**The label rules shipped last change are sound and stay.** The four-step anchor, the
region test and the two-term clearance read are unchanged here. Only the two feasibility
tests gain a margin, and the style gains a contrast rule.

## Goals / Non-Goals

**Goals:**

- A boundary that curves where the region map curves and corners where it corners, from one
  primitive type.
- No loss of accuracy: the same fit tolerance and the same measured departure.
- No change to the drawn width, the join behaviour or the two-tone look, which are tested
  and correct.
- A label that never reads as clipped and never disappears into the disc behind it.

**Non-Goals:**

- Moving the region data, the trace or the chain linking.
- Changing the fit tolerance. Arcs at 190 beat chords at 100, so the tolerance stays and the
  departure figures the specs carry do not move.
- Fitting arcs to the raster by least squares. The fit below interpolates the kept vertices,
  which inherit the raster's half-cell error. A least-squares fit would average that out and
  do better; it is a larger piece of work and this change does not need it.
- Hiding the boundary at close zoom. Measured, a frame at 500 light years holds 0.19 of a
  primitive, so there is nothing there to hide. See the open question below.
- Any change to the coverage buffer or the composite.

## Decisions

### The primitive is an arc with a signed curvature, and a straight line is curvature zero

The alternative is two primitive types with two code paths, two attribute layouts and two
draw calls. A signed curvature collapses them: the renderer reads one number, and a
curvature of exactly zero takes the straight path. The fit emits 285 straight primitives and
308 arcs, so both paths are exercised on every build.

Curvature rather than a centre and a radius, because a straight line has no centre and an
almost-straight arc has one at an enormous distance. Curvature goes to zero smoothly where
radius goes to infinity, so the data has no special case and no precision cliff as a curve
flattens.

### The spline is a biarc, broken where the trace turns

A biarc joins two points with two prescribed tangents using two circular arcs that meet
tangentially. It interpolates both endpoints exactly and it is tangent-continuous by
construction, which is precisely what the three arc models the previous change rejected
could not do.

That rejection is worth restating so it is not re-litigated. Those models failed because an
arc was asked to be **long** and its tangent at the far end was whatever it happened to be:
two concentric arcs of different radii never meet, and a greedy general arc that maximises
reach arrives pointing the wrong way and needs a kink to rejoin, which is where its 47
invented corners came from against 10 for straight lines. A biarc is short and has room to
satisfy the tangent at both ends. It is a different construction, and the earlier evidence
does not argue against it.

The break test is the two-chord traced turn the set already carries, at more than 30
degrees. The number is 30 because a measured sweep puts it inside an empty band: thresholds
of 25, 30 and 35 give the identical fit, because no kept vertex of the set holds a traced
turn between **22.93 and 39.59 degrees**. A threshold of 30 sits 7.1 degrees above the
highest wobble and 9.6 below the lowest real corner, so the result does not depend on the
exact value.
The four breaks below the band read 20.2, 20.9, 21.0 and 22.9 degrees and are raster jitter,
not corners; the worst of them made the line kink 50.6 degrees on a smooth bend near the
galactic centre. The ceiling is the departure bound and not the corner counts: recall holds
at 221 of 221 up to 60 degrees, and at 70 the fit rounds a real corner and the departure
leaves the bound at 297.4 and 334.7. This matters: the classification that tells a real corner from a raster wobble is a
product of the previous change, and it is what makes "smooth here, sharp there" possible at
all. The old smoothing pipeline had no such test, rounded both alike, and destroyed the
right angles.

A run of a single span stays straight, because both its tangents are fixed by the break at
each end and the biarc degenerates to the chord. That is why 285 of the 593 primitives are
straight, and it is why the longest primitive is still the 14,970 light year one the drawing
scenarios use.

**Tangents.** The fit needs a direction at every kept vertex, and the rule differs at a
break. **At a break the tangent is one-sided**: it is taken from inside the run alone, and
the run on the other side takes its own. This is not a detail. A two-sided estimate at a
break averages across the corner and rounds it, which is exactly what the old smoothing
pipeline did to the right angles. Inside a run the estimate is two-sided, because the line
runs through. A chain end counts as a break.

The estimate inside a run is the **central difference** of the two neighbours along the
simplified polyline. This design expected the other answer and the measurement overturned it,
which is worth recording so it is not tried again. The reasoning was that a tangent taken
from the traced nodes over a reach of a few hundred light years averages the raster instead
of inheriting it, and so should fit better. Measured, it fits worse and it fits worse in the
one place that is not negotiable: the traced-node estimate gives a departure of **283.9 and
320.4 light years**, well past the 200 light year bound, against **185.8 and 189.8** for the
central difference. Averaging over a reach pulls the tangent away from the vertex the arc has
to pass through, and the arc then bulges to reach it.

The measure that decides between them is not recall of the real corners: a corner is a break,
the tangent at a break is one-sided, and an estimate used only inside a run cannot move a
corner angle. It is the departure, and then the worst windowed drawn turn where the traced
boundary runs straight, which reads 2.40 degrees for the central difference against 4.61 for
the traced-node estimate. Both measures point the same way.

### The GPU expands an arc; the fragment shader does not change

This is the decision most likely to be misread, because an earlier sketch of this change
said the opposite: that `regions.frag` would gain an arc distance field, `abs(length(p - c)
- r)` clamped to the angular wedge. **That is wrong**, and it is worth writing down why.

A circle on the plane `y = 0` does not project to a circle. Under perspective it projects to
a conic, and the distance from a point to a general conic needs a quartic solve — far too
expensive per fragment, and numerically unpleasant near a degenerate conic.

Measuring in world space instead does have a closed form: unproject the fragment to the
plane and take `abs(length(p - c) - r)`. It fails for a different reason. The line is 4 CSS
pixels wide **on the screen**, so a world distance has to be divided by the light years per
pixel at that fragment, and under obliquity that scale is anisotropic — the same figure the
label footprint rule had to unproject four corners to deal with. A line drawn that way is
not 4 pixels wide when the plane is oblique, and the scenario that holds it to 4 pixels
within 1 fails.

So the arc is expanded into sub-segments in `regions.vert`, and `regions.frag` is untouched.
Each sub-segment is the same screen-space capsule the pass already draws, with the same
`MAX` blending, so the width rule, the two-tone rule and the join rule keep working exactly
as they are tested today. The vertex shader reads the arc's ends and curvature, works out
which sub-chord this instance is, and emits the same quad it emits now.

```
  today:  drawArraysInstanced(TRIANGLE_STRIP, 0, 4, segments)
          instance i  ->  quad from vertex[i] to vertex[i+1]

  after:  drawArraysInstanced(TRIANGLE_STRIP, 0, 4, segments * SUB)
          instance i  ->  primitive p = i / SUB, sub-chord s = i % SUB
                          endpoints from the arc of p, at s/SUB and (s+1)/SUB
                          curvature 0 -> the chord itself, every sub-chord
                                         collapsing to one quad's worth of line
```

**How many sub-segments, and what sets the number.** The count is set by the **sagitta in
pixels**, not by the turn. The sagitta of a sub-chord is `R(1 - cos(dtheta/2))`, so at a
fixed sub-angle it grows with the **radius**: a large-radius, gentle arc is the worst case,
not the tightest one. `SUB` is the smallest count whose sagitta, divided by the light years
per pixel, stays under **a quarter of a CSS pixel**.

The bound is a quarter and not a half because the drawn reading flattens there. Measured on
the run the no-facet scenario walks, the direction changes by 2.283 degrees between
neighbouring windows at half a pixel, 1.977 at a quarter, and 2.192 at an eighth — a rise
inside the measure's own noise. The reading splits three ways: 1.492 degrees is the arc
geometry, which no sagitta reaches below; about 0.5 is where a weighted centroid lands inside
a pixel over a 12 pixel baseline; and the sub-chord expansion is 0.31 at half a pixel and
nothing measurable at a quarter. The frame budget does not decide it — half, a quarter and an
eighth all read near 1.5 ms against 16.7, at 20,493, 28,842 and 40,663 instances — so an
eighth would cost 41 percent more instances for no smoothness the frame can show.

`SUB` is one number per **draw call**, which is one chain, because the expansion uses the
attribute divisor: the divisor is set to `SUB`, so a primitive's attributes advance once
every `SUB` instances and the sub-index is `gl_InstanceID % SUB`. So this is not per-arc
adaptivity, and the design should not be read as promising it. It is the worst case **inside
one chain at the current zoom**, recomputed each frame. That is a real saving over one number
for the whole set at every zoom — a chain of tight local arcs does not pay for the 25,000
light year curve in another chain, and at wide zoom every chain falls to a few sub-segments —
and it costs one number per chain per frame on the CPU.

This keeps the **upload** small, which is the whole point of choosing it over a tessellated
upload: 593 primitives and 716 vertices, 11.2 KiB, against 1,229 vertices and 14.4 KiB if the
tessellation were baked into the data. It also keeps the fragmentation property meaningful,
because a primitive is still a whole arc rather than one of its twenty pieces.

**How the curvature is indexed.** One `float32` per **vertex**, not per primitive, with the
value at a vertex belonging to the primitive that starts there and the value at a chain's
last vertex unused. The chain index array counts vertices, and `region-pass.ts` binds a
chain's positions at `first x 12` bytes; a per-primitive array would need a second per-chain
offset, because a chain of `n` vertices holds `n - 1` primitives. One value per vertex wastes
492 bytes over the whole set and removes the offset. The upload is then 716 x 16 = 11.2 KiB,
against 14.4 KiB if the tessellation were baked into the data.

### The rule against faceting replaces the rule against short segments

`The set does not fragment` allowed at most 20 segments under 500 light years. Baking the
tessellation into the data gives 170, against a bound of 20. Expanding on the GPU keeps the
data at 593 primitives so the old bound would pass — and that is the trap. It would pass for
the wrong reason, and it would go on passing if the vertex shader drew each arc as one
chord, which is exactly the faceting this change exists to remove.

So the bound is replaced rather than kept: wherever the drawn line turns by more than 10
degrees over a 500 light year window each side, it turns by at most 10 degrees more than the
traced boundary does at the same place.

**The turn has to be windowed, or the new rule is true by construction too.** Read at a
break, it cannot fail: a break exists only where the traced turn is over 20 degrees, and
inside a run the drawn turn is zero. So the drawn turn is measured the same way the traced
turn is — walk the drawn line with the arcs sampled along their sweep, and take the angle
between the chord 500 light years back and the chord 500 light years forward.

**And the bound has to stop at a corner.** The relative form still fails a right angle,
because the raster rounds one over a cell or two and the window under-reads it: a true right
angle draws 91.0 degrees where the traced turn reads 78.9. So the bound applies where the
traced turn is at most the corner test, and above it the corner counts govern instead.

The exclusion and the corner test are not interchangeable, and this is the trap. With the
corner test at 20 the exclusion alone forgives the worst fault in the set: the chain 67 bend
reads 23.8, so the exclusion drops it, and the test passes at 1.9 degrees below the traced
turn while the line kinks 50.6 degrees. The corner test removes the fault from the line; the
exclusion removes a corner from the test. With both in place the arc fit's worst excess is
4.4 degrees against a bound of 10.

**And the bound has to be relative, not two thresholds.** A first draft said a drawn turn
over 10 degrees requires a traced turn over 20. A circle of radius `R` gives a windowed turn
of `500 / R` radians, so those two numbers are two different radii — 2,865 and 1,432 light
years — and every boundary curving between them fails while being fitted exactly as intended.
The measurement says the band is occupied: over the three chains that bound the `Galactic
Centre`, the traced turn has a median of 9.0 degrees and a 90th percentile of 33.8, with 45.3
percent of 481 nodes over 10 degrees and 15.6 percent over 20. About 30 percent of that
boundary is in the band, and it is the region the change exists to draw as a circle. So the
rule holds the drawn turn to no more than 10 degrees above the traced turn at the same place.
A faithful fit passes at any radius, and the straight fit still fails at 30.6 degrees drawn
where the traced turn is near zero.

The precision bound above is in the same position, and it is honest to say so: it is close to
true by construction, and what it still catches is a break test that drifts from the count.
Recall is the bound with teeth, because a rounded corner fails it.

### The slide gains a margin, not a clamp

The old placement clamped a box into the viewport with a 48 pixel inset, which slid the box
off its anchor and could push it across a boundary. That is not what this is. The margin
goes into the **feasibility tests**, and into both of them: the slide takes the point nearest
the centre whose floor-scale box lies inside the viewport **inset by the margin**, and the
scale search then takes the largest scale whose box lies inside **the same inset viewport**.
The box stays centred on its anchor and the anchor stays on the segment, so the proof that
the box lies inside its region is untouched — it rests on the clearance at the anchor, which
does not move.

Both, because the two steps test different boxes. The slide tests the box at the floor scale
and the search then grows it by up to 1.43 times in width. A label that never slides — its
centre is in frame, near an edge — would otherwise grow until it is flush with that edge, and
the rule would be false for exactly the labels that never move.

The connectedness argument is untouched too. The feasible set is still "the projected point
lies inside a fixed rectangle", still convex, still met by a line traversed monotonically in
exactly one interval. A smaller rectangle is still a rectangle.

Everything the margin costs is that a label leaves the page slightly sooner as its region
slides off. That is the trade and it is the right way round: a label that is on the page is
now readable, where before two of twenty read as clipped.

### The contrast rule is measured from the frame, not chosen by eye

`.region-label` is `#cfe4ff` with a black glow. Over the dark space between the arms it is
crisp; over the core the text and the background are both bright and the glow reads as a
smudge. The weakest label on the page is the one the placement rules guarantee is drawn.

The spec fixes the **property** — at least 3 to 1 — and not the treatment. The treatment is
a look decision for the owner, and there are several: a darker outline instead of a glow, a
translucent plate behind the text, or a colour that reads on both grounds. The task list
builds the measurement first, so whichever treatment is chosen can be checked rather than
argued about, and it stops for the owner before the style changes.

**The measurement has to credit every one of those treatments, and that decides how it
reads the pixels.** It reads the frame **with the label drawn** and splits the box into the
solid core of the glyphs and the ground around them. An earlier draft read the frame with the
label switched off, and that quietly refuses two of the three treatments: a plate and a wider
outline both change what the eye sees behind a glyph and change nothing at all in a
label-off read, so only a colour change could move the number. The rule as specified — median
text pixel against median ground pixel, antialiased edge excluded, WCAG relative luminance —
is reproducible between two honest builds, which the earlier "text pixels against the frame
behind them" was not: it named neither which pixels are text nor how to combine them, and
those two choices are what set the answer.

## Risks / Trade-offs

- **The arc-to-arc join has never been drawn.** It is now the most common join in the set,
  every few hundred light years along every curve, and two arcs that overlap slightly at a
  tangential joint would draw a bright line of spots along the whole curve. → The vertex shader extends
  each quad by the half width along the segment at both ends, and the fragment shader
  measures to the clamped segment with `MAX` blending, so the construction is
  angle-independent and a tangential join is the easiest case it will ever see. The scenario
  is kept because "easiest" is not "tested", and it reads the pixels rather than the
  geometry.

- **A sub-segment count chosen per draw can be wrong at some zoom.** Too few and the curve
  facets; too many and the pass draws thousands of degenerate quads. → `A curve shows no
  facet` reads the drawn direction at a fixed zoom, and the **frame budget** requirement of
  `far-view-rendering` bounds the cost: 16.7 ms mean at 1920x1080, run by
  `e2e/frame-budget.spec.ts` from 500 to 30,000 light years with the overlay on, which is its
  default. The placement budget is a different bound and does not apply here — it holds the
  label placement on the main thread to 0.5 ms. The count is a single function of radius and
  zoom, so it is cheap to measure across the whole band rather than trusting one view.

- **Curvature is a `float32` and an almost-straight arc has an enormous radius.** →
  Curvature, not radius, is what the data carries, so an almost-straight arc has a curvature
  near zero and loses no precision. The vertex shader has to take the straight path below a
  threshold rather than dividing by a curvature near zero, and the threshold is a real
  number that has to be chosen against the largest radius the fit produces.

- **The tangent estimate is the weakest part of the fit.** Central differences on the
  simplified polyline inherit the raster's half-cell error at every kept vertex. → The
  frames from that estimate already look right, so this is an improvement rather than a
  blocker. The task list measures the traced-node tangent against it rather than assuming
  it is better.

- **A biarc joint is not a traced node.** The previous change leaned on "every vertex is a
  traced node" for the watertight argument. → That argument only ever needed **chain ends**
  to be shared, and they still are: joints are interior to a run, and a run lies inside one
  chain. The spec says which guarantee applies to which point, and the scenario is narrowed
  to kept vertices rather than dropped.

- **The label margin removes labels a little earlier.** → It is 8 CSS pixels against a frame
  of 1080, and the alternative is two labels that read as cut. If it removes a label the
  owner wants, the margin is one constant.

- **The contrast rule may be unsatisfiable with a glow.** A pale text over a bright core may
  not reach 3 to 1 whatever the glow does. → Then the treatment changes, which is why the
  spec fixes the property and not the treatment. The task list builds the measurement before
  the treatment, so the answer is read rather than argued.

## Migration Plan

The change is a build-time and render-time rewrite behind an unchanged message boundary
shape, so there is no data migration and no persisted state. Roll back by reverting the
commit; nothing outside the repository holds the old set.

`docs/roadmap.md` records the straight-segment set and its figures in the phase 2 notes.
Those paragraphs are replaced with the arc set, its primitive and vertex counts, its
unchanged departure and its faceting rule.

## Open Questions

- **Should the boundary hide at close zoom?** The owner raised it and the measurement says
  no: at 500 light years a frame holds 0.19 of a primitive, so a boundary in frame is one
  straight line with both ends off screen, and across 577 light years a 25,000 light year
  curve departs from its chord by 1.7 light years. There is no faceting and no visible
  lossiness to hide. If it is still wanted it is a composition call about clutter, it is one
  constant in the fade, and it belongs in its own change because it retires three scenarios
  that pass today.
- ~~**Which contrast treatment.**~~ **Resolved.** The measurement landed first, and the owner
  picked a translucent black plate at 0.45 opacity. All three treatments were priced on the
  real pixels of all 20 boxes. A plate reaches the bound at 0.40 and carries margin at 0.45,
  where `GALACTIC CENTRE` reads 3.70 to 1. A black outline reaches it only as a 4 to 6 pixel
  solid halo, because the ground is a median and an outline moves it only once it covers more
  than half the box — measured, reach 2 px gives 1.21, 3 px gives 1.68 and 4 px gives 15.92.
  A colour change **cannot** reach it at all: against the `Galactic Centre` ground of 0.6142
  the text needs a luminance above 1.94 or below 0.171, and a text that dark then fails
  against the grounds of `Arcadian Stream`, `Formorian Frontier` and `Newton's Vault`. The
  best single colour is pure white at 1.58 to 1.
- **Whether to fit the arcs by least squares over the raster instead of interpolating the
  kept vertices.** It would beat the half-cell error the current fit inherits and would
  likely need fewer primitives. It changes no requirement above, so it can be a later change
  measured against the same scenarios.
