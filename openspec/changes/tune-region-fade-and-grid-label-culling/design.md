## Context

See [proposal.md](proposal.md) for the motivation. The state the two changes start from:

**The region fade.** [src/render/region-pass.ts](../../../src/render/region-pass.ts) holds
`REGION_RANGE_NONE = 8000` and `REGION_RANGE_FULL = 12000`. Three readers take them:
`region-composite.frag` through the `uRangeNone` and `uRangeFull` uniforms,
`labelRangeFade` and `labelSweepRuns` in
[src/app/labels.ts](../../../src/app/labels.ts), and `regionBandHalfWidthAtRange`, which
takes `REGION_RANGE_FULL` as the range the band is widest at and also sends it to the
ribbon shader as `uReferenceRange`.

**The grid label gate.** `gridLabelPlacements` in
[src/app/grid-labels.ts](../../../src/app/grid-labels.ts) drops a candidate when the
crossing's own projected point falls outside the viewport, before it builds the label
box. `planePlacement` in
[src/app/plane-overlay.ts](../../../src/app/plane-overlay.ts) then drops a placement
whose quad lies wholly outside the viewport, behind the near plane, or turned away. The
second gate is the one the spec wants; the first one is what takes the label early.

## Goals / Non-Goals

**Goals:**

- The region lines and the region labels fade over 5,000 to 8,000 light years of range.
- No line changes width at any range.
- A grid coordinate label stays while any part of it is on the screen.
- A grid label at the edge of the frame does not step in colour or opacity.

**Non-Goals:**

- The zoom fade (20,000 to 30,000) does not move.
- The reach rule, the cap of 8 and the overlap rule of the grid labels do not move.
- No new gate, no new constant that a caller can set, and no host option.

## Decisions

### The band's width keeps 12,000 light years as its own constant

`regionBandHalfWidthAtRange` reads `REGION_RANGE_FULL` today, and the spec said the two
figures were one figure. Moving the fade with the width tied to it would make the band
`8000 / 12000` of its current width at every range beyond 12,000: 23 CSS pixels at
12,000 where it measures 34.6 now, and 13.8 at 30,000 where it measures 20.7. That is a
look change over the whole galaxy, and the request is about the close end alone.

The width therefore takes a constant of its own, `REGION_WIDTH_RANGE = 12000`, and
`regionBandHalfWidthAtRange` and the `uReferenceRange` uniform read that. The fade
constants move alone.

Alternative: let the width follow the fade. Rejected — it changes every band in the
frame, every width figure in the spec and the look baselines, for a request that names
neither.

### The grid label gate moves to the quad the plane overlay already tests

The crossing check in `gridLabelPlacements` goes. `planePlacement` is called a few lines
later and already drops a quad wholly outside the viewport, so the rule the spec wants
needs no new test — it needs one test taken away. The candidate loop keeps the near-plane
check that `project` gives, because the Jacobian and the alpha gate read the projected
crossing and a point behind the camera has no useful one.

The work of a frame does not change: the sweep still projects 25 crossings and three
points each, and the cap of 8 still bounds the placements. What changes is which 8 the
frame keeps, and a label whose crossing has left the frame can now take a slot. That is
the point: those are the labels nearest the cursor.

Alternative: widen the crossing check by the label's own box in CSS pixels. Rejected —
the box is a quad on the plane, not an upright rectangle, so its width on the screen is
not known until the homography is solved. That is what `planePlacement` does.

### The background reading point is clamped, not dropped

`gridLabelBackground` returns a luminance of 0 for a point outside the reading, which
gives full opacity and the undarkened colour. With the old gate no label could be in that
state; with the new one a label at the edge can be, and it would step as its box centre
crossed the edge. The overlay therefore clamps the sample point to the last pixel inside
the frame before it reads. This is two `Math.min`/`Math.max` calls at the call site in
`createGridLabelOverlay`, not a change to `gridLabelBackground`, which keeps its fallback
for a null reading.

### The recorded views are searched again, not edited by hand

`e2e/region-views.ts` holds `NO_LINE_VIEW` and `ONE_CHAIN_POINT`, both found by the
searches in `tests/region-views.ts`, both asserted by `tests/region-views.test.ts`.
`NO_LINE_VIEW` needs a frame whose farthest plane point is under the new floor of 5,000
light years, and `ONE_CHAIN_POINT` needs a window that holds one chain at the three new
close zooms of 4,000, 6,500 and 8,000. Both searches already read `REGION_RANGE_NONE`, so
they run again and the constants they give are written back. The counts they report
(`heldCount`) move with them, and the unit test asserts what the search finds.

## Risks / Trade-offs

- **The frame budget at a close zoom.** `labelSweepRuns` now opens at any frame that
  holds plane beyond 5,000 light years, where it opened at 8,000, so the sampling sweep
  runs in frames that skipped it. The sweep's own bound is unchanged: under 2 ms as a
  mean over 300 frames and under 4 ms in any single frame. → The apply step runs
  `e2e/frame-budget.spec.ts` and the sampling budget scenario, and reads the figures
  rather than assuming them.
- **More band on the screen at a close zoom.** The composite is a full-screen pass at
  every zoom, so its cost does not follow how much of the frame the band covers. The
  ribbon draw is the whole set at every zoom. → The "overlay costs under a millisecond"
  scenario reads a 4,000 light year view and holds the bound.
- **The look baselines move.** Any snapshot of a view that holds plane between 5,000 and
  8,000 light years now carries band where it carried none. → The apply step reads each
  failing snapshot before it accepts it, and states which views changed.
- **A label the user can see reports an anchor outside the viewport.** A host that reads
  `gridLabelReadings()` and assumed the anchor was on the screen sees a point outside it.
  → The spec states it. No shipped reader of the page makes that assumption, though two
  browser readings did, which the entry below covers; the overlay itself reads the box and
  not the anchor.
- **Two browser readings assumed the old gate.** The scenario "Every label sits on a line"
  reads the drawn pixel at each label's anchor, and its test clamps the read rectangle into
  the canvas, so an off-frame anchor would read a patch at the frame edge and pass or fail
  by accident. The scenario "A label does not draw stronger than its line" works out the
  background weight itself, at the unheld box centre, and would disagree with the placement
  by the whole background term for a label at the edge. → Both scenarios are restated in the
  `coordinate-grid` delta, and task 5.3 changes both tests: the first skips a label whose
  anchor is outside the viewport and drops the clamp, the second reads the same held point
  the placement reads.
- **The label zoom ladder stops reading the slope.** The scenario "The region the camera is
  inside is named at every zoom" read 20,000, 15,000, 10,000, 7,500 and 4,000 light years
  against the old band. Against 5,000 to 8,000 every one of those zooms puts the anchor at
  the top or the bottom of the fade. → The ladder moves to 20,000, 15,000, 10,000, **2,500**
  and **1,000**, and the delta makes a reading strictly inside the band a condition of the
  test, so the implementation must measure the anchor range rather than assume it.

  The two close rungs are the measured ones. The anchor range runs far past the zoom at a
  pitch of 35 degrees, because the anchor is the part of the region the frame shows and that
  part sits up the frame. The ratio is not one figure: it runs from 1.17 at 20,000 light
  years to 2.60 at 2,500, and over the close end `range = 4,400 + 0.84 * zoom` fits it. 2,500 light years reads an anchor at 6,504.6, which
  is strictly inside the band, and 1,000 is the first rung at which the label leaves the
  page. A first reading of this bullet named 6,500 and 3,000, which read 10,160.61 and
  6,940.58: the first is the top of the fade and the second still carries a label.
- **The far-line bands read whole rows and the geometry was taken at the centre column.**
  The scenario "A far line still draws while the near line is gone" counts the pixels of a
  rectangle that runs the width of the frame, so a row holds only when every column of it is
  under the floor. A ray at the side of the frame meets the plane further away than the
  centre ray of the same row. → The lower band is **60 per cent** and not 45. The centre
  column falls under 5,000 light years at 40.3 per cent and the corner column at 57.43, and
  60 clears the corner figure with 2.6 points of room.
