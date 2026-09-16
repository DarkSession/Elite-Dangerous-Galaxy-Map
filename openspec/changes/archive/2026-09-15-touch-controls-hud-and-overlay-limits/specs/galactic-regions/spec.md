## MODIFIED Requirements

### Requirement: The boundaries draw as one soft band inside a zoom band

The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

Which set draws SHALL follow the region mode: the smoothed set in `simplified`, the traced
set in `accurate`, and neither in `off`. Both sets draw through the same pass, with the same
half width, the same tone and the same join rule. The **drawn** band is not always the same
width: the blur runs in `accurate` alone, and it widens the band there, which the table below
states.

**The line is one soft tone.** The two-tone ribbon, a light core of 2 CSS pixels inside a
dark outline of 1 CSS pixel each side, SHALL be replaced by a single band with a soft
falloff, which is the line the game draws.

- The tone SHALL be `(0.86, 0.74, 0.60)`, a warm cream.
- The opacity SHALL be **0.55** where the overlay draws in full.
- The **half width SHALL be 3 CSS pixels**, so the whole band is 6 CSS pixels across
  whatever the device pixel ratio is. The line was 4 CSS pixels wide with a 2 pixel core.
- The coverage the pass writes SHALL be `max(0, 1 - gap / 3)`, where `gap` is the distance
  from the middle of the line in CSS pixels, evaluated for each device pixel of the ribbon
  quad, in a single-channel buffer at the **full drawing buffer resolution**.
- The alpha SHALL be `smoothstep(0, 1, coverage / peak)`, where `peak` is the normalisation
  the next part defines. The `smoothstep` **clamps at 1**, so the band has a flat top.

The flat top is what holds the join rule after the blur. A blur lifts the inside of a corner
above a straight run's peak: measured against the normalisation, the largest reading near a
90 degree corner is **1.04** of a straight run's at a radius of 3 CSS pixels, 1.07 at 3.85,
1.10 at 4.62, 1.13 at 5.77 and 1.15 at the cap of 8. The reading is not at the apex, which
sits a little under the straight run, but about one CSS pixel inside the turn. Without the
clamp a corner would therefore draw brighter than its own line. Before the blur the `MAX`
blend equation held that rule by itself; the clamp holds it now, and the scenario "A 90 degree
corner of the traced set is not brighter than its line" reads it.

**The corner rule SHALL carry a tolerance of 3 per cent**, and the scenarios that read it
SHALL state it. The clamp holds the corner at exactly 1 of the normalisation, but the drawn
straight run is a **sample** of the ridge and reads 0.91 to 1.00 of it as the line's own phase
moves. A corner therefore reads up to 1.022 of a straight run at a radius of 3 CSS pixels,
1.015 at 3.85, 1.010 at 4.62, 1.006 at 5.77 and 1.002 at 8, over every pair of phases. The
traced arms run along the lattice, so a chain holds one phase over a whole run and a bad phase
does not average out. Before the blur the `MAX` equation made the corner and the arm the same
number and no tolerance was needed.

The dark outline is what carried the old line over the bright disc. The warm tone carries
it instead: its luminance is 0.755, above every part of the frame but the core itself, so
the band lightens the picture nearly everywhere and needs no darker edge to be seen.

**The coverage passes through a blur before it is drawn.** The pass SHALL write each
segment's coverage into a buffer, blur that buffer, and read the blurred buffer once to
write the band over the frame.

- The blur SHALL be separable and symmetric, one pass on each axis, over the
  full-resolution single-channel buffer. Its kernel SHALL be a Gaussian of standard
  deviation `sigma` CSS pixels, sampled one **CSS pixel** apart with a linear filter on
  the coverage texture, with `2 * ceil(3 * sigma) + 1` taps.
- **`sigma` SHALL be `max(radius / 3, 1)` CSS pixels.** The largest radius is 8, which gives
  a standard deviation of 2.667 and **17** taps, so the count never passes 17 and no cap ever
  cuts the kernel. The smallest standard deviation is the floor of 1, which gives 7 taps.
- The step is one CSS pixel and not one device pixel so that the tap count does not follow
  the device pixel ratio. A step of one device pixel would need 33 taps at a ratio of 2 and a
  radius of 8, and a cap of 17 would then cut the kernel at 1.9 standard deviations and
  narrow the band by an amount that follows the display. The floor of 1 CSS pixel on the
  standard deviation is what keeps a step of one CSS pixel a good sample of the kernel at
  every radius.
- **The blur SHALL run in `accurate` at every zoom the overlay draws at.** `simplified`
  SHALL NOT blur and its normalisation SHALL be 1.
- The radius SHALL be `min(cell, 8)` CSS pixels, where `cell` is the region grid's own cell
  of **49.3494 light years** measured on the screen at a range of
  `max(cursorDistance, 10000)` light years. The radius is the **whole** cell, because the
  corner the blur has to round is one whole cell tall and one whole cell wide.

**The radius reads the cursor, with a floor at the nearest range that draws.** Most of the
frame sits near the cursor's own range, so the cursor is what the radius follows above
10,000 light years: 3.85 CSS pixels at a zoom of 12,000 at 1,080 rows, 2.31 at 20,000 and
1.54 at 30,000. The floor of 10,000 light years is what holds at a close zoom. The range
fade draws no line nearer than that, so the largest staircase a close frame can hold is the
cell at 10,000 light years, which is **4.62 CSS pixels** at 1,080 rows and 3.08 at 720, and
the radius reads 4.62 at every zoom of 10,000 light years and below. The cap of 8 therefore
never acts at 1,080 rows or below, and acts at 2,160 rows and above, where the cell at
10,000 light years is 9.23 CSS pixels.

A line at a range of 10,000 light years is still in the frame at a zoom of 20,000, where its
staircase is 4.62 CSS pixels and the radius is 2.31. The floored standard deviation still
softens it, and it draws at the bottom of the range fade, so it is the faintest line in the
frame. Reading the radius at 10,000 light years at every zoom would instead widen every far
line to hold one fading near one, which is the fault the paragraph below states.

Reading the radius at the cursor is what the pass did before, and it cannot hold once the
near lines are gone: at a zoom of 4,000 light years the cell at the cursor is 11.5 CSS pixels
and the cap gives a radius of 8, but every line the frame draws is 10,000 light years off or
further, where the cell is 4.62. A radius of 8 would smear a band 6 CSS pixels wide over
lines whose staircase is a fifth of that.

**The floor on the standard deviation is what smooths the far lines.** Above a zoom of about
15,390 light years at 1,080 rows the radius falls under 3 CSS pixels, and the rule this
replaces stopped blurring there. The traced line at those zooms is a staircase of 1 to 2 CSS
pixels a step, which the drawn band cannot separate from its own edge but which still
flickers as the camera moves. With the floor the band at every radius under 3 draws exactly
as the radius 3.00 row of the table below draws, because the kernel is the same.

`simplified` never blurs, because the smoothed set has no staircase. The blur exists for
`accurate` alone, which is the mode the fault was reported against.

**The blurred coverage SHALL be normalised, and the band SHALL widen with the radius.**

The coverage across a straight line is a triangular ridge, not an unbounded ramp. A blur
lowers its peak and widens it. The pass SHALL therefore divide the blurred coverage by the
kernel's own response at the ridge, so the band's peak alpha is the stated opacity at every
radius. Without it the band at a zoom of 10,000 light years in `accurate` at 1,080 rows,
whose radius is 4.62 CSS pixels, would draw at about four fifths of the opacity of the same
band at 20,000, whose radius is 2.31 and whose standard deviation the floor holds at 1.

The coverage is point-sampled on the device pixel grid, so what a straight run gives depends
on where the middle of the line falls between two pixels. The **normalisation** and the
**half-maximum width** are readings of the continuous kernel in CSS pixels and do not follow
the device pixel ratio. The **sampled peak** does: the figures below are at a ratio of 1,
which is the worst case, and a higher ratio samples the same ridge more finely and draws the
spread in toward 1.00. The readings are:

| radius, CSS pixels | normalisation | sampled peak | half-maximum width, CSS pixels |
| ------------------ | ------------- | ------------ | ------------------------------ |
| no blur            | 1.000         | 0.83 to 1.00 | 3.00 to 3.50                   |
| under 3.00         | 0.758         | 0.69 to 0.76 | 3.80 to 4.13                   |
| 3.00               | 0.758         | 0.69 to 0.76 | 3.80 to 4.13                   |
| 3.85               | 0.679         | 0.63 to 0.68 | 4.24 to 4.49                   |
| 4.62               | 0.613         | 0.58 to 0.61 | 4.68 to 4.88                   |
| 5.77               | 0.530         | 0.51 to 0.53 | 5.37 to 5.60                   |
| 8.00               | 0.411         | 0.40 to 0.41 | 6.90 to 7.05                   |

The sampled peak column is stated to 2 decimal places, and a reading SHALL fall inside its
range within **0.01** at each end. The width column is stated to 2 decimal places and holds
within **0.05** CSS pixels. The columns are rounded readings of a continuous rule, not bounds
the rule was built to meet.

The **lower end** of each width range is the continuous reading, which a line whose middle
falls on a sample gives. The **upper end** is the widest the point-sampled profile reads over
the phases between two samples. The lower end therefore does not follow the device pixel
ratio and the upper end draws in toward it as the ratio rises.

The **normalisation** column is the continuous response of the same taps at the ridge, which
the processor works out. The **sampled peak** column is what one row of device pixels reads
as the line's own phase moves. Dividing the second by the first leaves the band's alpha
rippling along its own length by at most **9 per cent** at a radius of 3 CSS pixels, 7 per
cent at 3.85, 6 per cent at 4.62, 5 per cent at 5.77 and 3 per cent at 8. That is smaller than the ripple the
line carries today: the unblurred point-sampled ridge reads 0.83 to 1.00, which is 17 per
cent. The blur therefore makes this worse for no radius.

A radius between two rows reads between them. At 720 CSS rows and a zoom of 10,000 light
years the radius is 3.08, and its readings sit between the 3.00 row and the 3.85 row.

**The `under 3.00` row holds every radius the floor acts at, and it is the 3.00 row.** The
standard deviation is `max(radius / 3, 1)`, so a radius of 2.99 and a radius of 0.50 both
give a standard deviation of 1 and 7 taps, which is the same kernel the radius of 3.00 gives.
One kernel gives one normalisation, one sampled peak and one width, so the row is a copy of
the 3.00 row and not a rounding of it.

This is what the floor buys. The rule this replaces stopped the blur below a radius of 3,
stating that the standard deviation of `radius / 3` was then under one device pixel and the
sampling dominated: at a radius of 1.5 the readings spread from 0.80 to 0.93. The floor takes
the standard deviation away from the radius at exactly that point, so the kernel is never
sampled badly and the band never goes back to the unblurred staircase.

The normalisation does not change the width. The band's half-maximum width SHALL follow the
radius, by the table above: 3.0 to 3.5 CSS pixels in `simplified`, which never blurs, 3.80 to
4.13 in `accurate` at every radius under 3, and 4.68 to 4.88 at a radius of 4.62, which is
the largest radius 1,080 rows gives. The cap of 8 gives 6.90 to 7.05 and acts at 2,160 rows
and above. That is wanted: a wider, softer band is the game's own line.

What the blur changes besides the width is every corner: a 90 degree corner of the traced
set is a convex turn, and a blur rounds it. That is the purpose.

**A line goes out by its own range to the camera, and the overlay goes out by the zoom at
the far end alone.** Two fades SHALL multiply.

**The range fade** SHALL be read for each pixel, from the camera's distance to the point of
the galactic plane under that pixel:

- nothing at **10,000** light years and below,
- rising on a smooth step to full at **20,000**,
- full above 20,000.

**The zoom fade** SHALL be read once for the frame, from the camera's distance to the
cursor:

- full at **20,000** light years and below,
- falling on a smooth step to nothing at **30,000** and above.

**MODIFIED in this requirement**: the close end of the zoom band, which was nothing at 5,000
light years and below, rising to full at 10,000. It is replaced by the range fade above.

The close end could not tell a line that shows its staircase from one that does not, because
a zoom is one number for the whole frame. At a zoom of 8,000 light years the boundary a few
hundred light years from the cursor steps about 6 CSS pixels a cell, and the boundary near
the horizon is 40,000 light years off and steps under 1.2. The close end took both away, so
a user who zoomed in to read a neighbourhood lost the region lines of the whole galaxy
around them and not only the one under the cursor.

The range fade takes away the lines that carry the staircase and keeps the ones that do not.
The largest cell that can draw is therefore the cell at 10,000 light years, which is **4.62
CSS pixels at 1,080 rows** and 3.08 at 720. That reading is the floor the blur radius above
takes, so a close frame is blurred for the widest staircase it can hold.

**The plane point under the pixel** is what the range is measured to. The boundary chains
are drawn on the plane `y = 0`, so for any pixel a line covers, that point is the line's own
point and the reading is exact. Where the ray through the pixel does not meet the plane in
front of the camera, which is a pixel above the horizon, the fade SHALL be full. Nothing of
the boundary set is drawn there, and the blur can only carry coverage a few pixels into it.

**REMOVED from this requirement**: the per-pixel fade over the camera's distance to the
line, from 200 to 1,500 light years, and the second channel of the coverage buffer that
carried it. The range fade above replaces it at a distance forty times larger, and it needs
no second channel: the composite pass reads the plane point under each pixel from the frame's
own projection, so the coverage buffer stays one channel.

**What the close zoom shows instead.** Below 10,000 light years of range the map draws no
boundary, and below a zoom of 5,000 light years it places no region name. The user reads the
region from the HUD's top bar, which names the region under the cursor at every zoom. The
requirement "The handle reports the region at a plane point" states that, and the handle
carries it as `regionNameAt`, with `regionNameAtScreen` beside it.

**The labels keep the zoom band they hold.** The requirement "A region in view carries a
label" states it: none at 30,000 light years and above, full from 20,000 down to 10,000,
falling to none at 5,000 and below. A label names the region the view sits in, and the view
sits at one distance, so a reading per frame is the right reading for a name. A label is
also a box of text 100 CSS pixels wide, which a range fade would take away on one side and
keep on the other. The lines and the labels therefore no longer read at the same strength at
every zoom, which they did before this change.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice. The rule SHALL hold for the traced set as well, whose joins are 90
degree corners and are the hardest case the pass draws.

**The chosen views are constants and they move again.** `tests/region-views.ts` searches
the boundary set for the views the scenarios below open, and `e2e/region-views.ts` holds what
it found. Every view it holds SHALL be searched again.

**The two premises below govern three of the four searches**: the width search, the join
search and the traced-corner search. Each of those reads a window of the frame and compares
two parts of it, or compares it with the same window drawn another way, so the whole window
must carry one strength of the range fade.

**The both-sets search is exempt from both premises.** The view it finds is the one the fade
scenarios open, at zooms of 9,000, 15,000, 20,000, 25,000 and 31,000 light years. It exists
to be read inside both fades, so a premise that put it outside them would take away the only
view that reads them. It keeps its viewport of **1280x720**, and its window of 8 CSS pixels
holds one chain and no other at every one of those zooms.

**Premise one: the reading point SHALL sit at a range of at least 20,000 light years from
the camera.** Each of the three searches puts the **cursor on the reading point**, so the
range of that point is the zoom itself, and a zoom of 20,000 light years holds the premise
exactly.

The range fade is a smooth step that ends at 20,000 light years, so its slope there is
**zero**. A window around a point at that range therefore carries one strength over the whole
of itself, to better than a millionth: the three searches work at a pitch of 89 degrees, where
every plane point of a window a few tens of CSS pixels wide sits within about 3 light years of
the cursor's own range, and the fade's flat top reads no difference over 3 light years.

Inside the fade the strength follows the range, and the slope is steepest in the middle. At a
range of 15,000 light years a window of 40 CSS pixels spans about 430 light years, which the
fade reads as 6 per cent, twice the 3 per cent the corner rule allows. A window there would
fail the corner rule on the fade and not on the drawing. This is why the premise is a floor
and not a band.

**Premise two: the zoom SHALL be at most 20,000 light years**, where the zoom fade is full.
Above it the whole overlay fades out. With premise one the two together fix the zoom of each
of the three views at **exactly 20,000 light years**.

**The viewport and the zoom of the three governed views SHALL move together**, so that one
CSS pixel covers the number of light years it covers today:

| search        | view today          | view after          | light years a CSS pixel covers |
| ------------- | ------------------- | ------------------- | ------------------------------ |
| width         | 1920x1080 at 10,000 | 3840x2160 at 20,000 | 10.69                          |
| traced corner | 1920x1080 at 10,000 | 3840x2160 at 20,000 | 10.69                          |
| join          | 1920x1080 at 12,000 | 3200x1800 at 20,000 | 12.83                          |

Every window these three searches state in CSS pixels therefore holds the same number of
light years it holds today, and every count of runs, bends and nodes they report is a count
over the same geometry. The zoom of each is 20,000 light years, which is premise two's
bound, and the rows follow it.

The blur radius is the same as well, because the radius is read in CSS pixels from the same
cell. At 2,160 rows and a range of 20,000 light years the cell measures **4.62 CSS pixels**,
which is what the readings at 1,080 rows and 10,000 light years were taken at. At 1,800 rows
and 20,000 light years it measures **3.85**, which is what the join reading at 1,080 rows and
12,000 light years was taken at. Both are rows of the table above.

**The counts in this requirement were measured at the old viewports and zooms, and the
implementation SHALL measure them again.** The premises above change which runs, bends,
nodes and points each search holds, so the counts the requirement stated before are
readings of the old rule and are taken out of this delta. The implementation SHALL run each
of the four searches under the new premises, SHALL write the counts it finds back into this
requirement, and SHALL NOT carry the old ones over. A count is a fact of the data and the
view, so a stated count that nobody measured is worse than no count at all.

**These are the counts the four searches hold under the new premises**, each read from the
search itself:

| search                 | what the count holds      | count |
| ---------------------- | ------------------------- | ----- |
| width, of the smoothed set | straight runs         | 23    |
| width, of the traced set   | straight runs         | 2     |
| join                   | bends of the smoothed set | 6,713 |
| traced corner          | lattice nodes             | 10    |
| both sets              | plane points              | 4,605 |

Each count is the number of candidates that hold every premise of its search, and not the
number the search keeps. `tests/region-views.test.ts` SHALL assert each of the five counts,
so a count that moves fails a test and nobody can carry a stale count forward.

The join count and the traced corner count are the same numbers the old rule gave, and the
two searches did not stand still. The width the searches read is stated in CSS pixels, and
the table above moves the viewport and the zoom together, so one CSS pixel covers the same
12.83 and 10.69 light years it covered before. The same candidates therefore hold. The
both-sets count is 4,605 under the wider rule, because the fade scenarios now open its
point at zooms up to 31,000 light years. The search keeps every other chain outside the 8
CSS pixel window at the widest of those zooms, which is 397.73 light years, and that is
more than the 384.90 its 20 CSS pixel clearance asks for at 12,000. The base spec records
4,613, but the old code counted no holders, so the two figures are readings of different
rules and their difference is not a measurement.

**The width search SHALL take the zoom as given** and SHALL NOT derive it from the run it
found. It SHALL hold the run over the reading row with at least **100 CSS pixels** of it
above and below, in place of crossing the whole frame. At 2,160 rows and 20,000 light years
one CSS pixel is 10.69 light years, so the run needs 2,138 light years, which is what the
same rule asked for at 1,080 rows and 10,000.

The search SHALL drop the premise that the view sits within 16,000 light years of the
galactic centre. That premise was there so the disc under the line could be brighter than
the **dark outline**, and the outline is gone. In its place the reading point SHALL sit at
least **5,000 light years** from the galactic centre, which keeps the reading off the bright
core, where the band no longer lightens. The clearance SHALL stay at **60 CSS pixels**.

The search SHALL run **once for each set**, and `e2e/region-views.ts` SHALL hold one crossing
view for each. A near-vertical straight run of the smoothed set is not a near-vertical
straight run of the traced staircase, so one view cannot serve both modes.

**The other three searches SHALL state their reading windows in CSS pixels, not in light
years**, and SHALL each take the zoom and the viewport its scenario names. They SHALL hold:

- the **join** search: a clearance of 20 CSS pixels, a fold reach of 12 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, and a comparison run between 16 and 40 CSS pixels
  from the bend and at least 8 CSS pixels long. The straight run must sit outside the
  reading window, which reaches 12 CSS pixels;
- the **traced corner** search: arms of **48 CSS pixels**, a clearance of 20 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, a fold reach of 12 CSS pixels, and a comparison run
  between 12 and 40 CSS pixels from the node, against a read radius of 6. The polyline the
  reading classifies a pixel against SHALL reach the read radius, 6 CSS pixels along each
  arm. The arms SHALL be longer than the far end of the run, or the comparison reads past
  the next node and off the drawn line; 48 leaves 8 CSS pixels of arm beyond the run;
- the **both sets** search: a clearance of 20 CSS pixels.

**All three searches SHALL take the same radius floor the width search takes**, a floor of
**5,000 light years** from the galactic centre, and SHALL drop the ceiling of 16,000 that
each holds today. The ceiling was there so the disc under the line could be brighter than
the dark outline, which is gone. The join search holds no radius premise today and SHALL
take none.

**The three searches SHALL hold their windows per search and not in one module constant.**
`NEIGHBOUR_ARC_LY` and the fold reach are shared between the join search and the traced
corner search today, and the two scenarios read at different zooms, so one light year figure
cannot serve both once the windows are stated in CSS pixels. Each search SHALL derive its
own windows from the zoom and the viewport it is given.
**The cost.** With the overlay on at 1920x1080 in `accurate` at a zoom of **4,000 light
years**, where the blur radius is at its largest for that height, 4.62 CSS pixels and 11
taps, the draw time SHALL be at most **1 ms** more than the same view drawn with the overlay
off, read with `measureFrames`. The overlay SHALL stay inside the frame budget
`real-systems` states, which the browser suite already measures at a 20,000 light year view
with a full set.

**The pass now runs at every zoom under 30,000 light years**, where the close end of the
zoom band used to stop it below 5,000. A close zoom therefore pays for the ribbon draw, the
two blur passes and the composite where it paid for none. The cost reading above is taken at
a close zoom for that reason, and not at 5,200 light years as it was before.

The ribbon draw is the whole boundary set whatever the zoom, and the two blur passes and the
composite are full-screen passes whose cost follows the drawing buffer and the tap count.
None of the three reads a star system, so the cost is the same for a set of none and a set of
10,000, and it does not follow the 400 billion systems of the galaxy.

`debug` SHALL carry `regionCoverageSize()`, which returns the width and the height of the
coverage buffer, and null before the first frame that draws the overlay. It reports the
storage and not a reading of it, so a test can hold the buffer at the full drawing buffer
size and can hold a frame above the band to taking none.

Every target of the pass SHALL take its storage in the first frame that needs it, and the
**blur SHALL take none in a frame that does not blur**. `simplified` is the mode the map
starts in and it blurs at no zoom, so that mode SHALL hold one full-resolution target and
not three.

#### Scenario: The coverage buffer holds the whole drawing buffer

- **WHEN** the browser test reads `debug.regionCoverageSize()` at a zoom of 40,000 light
  years, which is above the band, and again at a zoom inside the band, and reads
  `debug.drawingBufferSize()` at the second view
- **THEN** the first reading is null and the second is the drawing buffer's own width and
  height.

  A smaller target cannot hold the band. The coverage is a point-sampled ridge and not a
  band limited field, so the sampled peak of a straight run moves from 0.67 to 1.00 with
  the line's own phase at half resolution, and one normalisation cannot hold a peak that
  moves by a third

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region
  overlay on, and again with it switched off
- **THEN** the two image files are byte-identical

#### Scenario: The boundary draws in full at the close end of the band

- **WHEN** the browser test opens a view a unit test has found **on** a chain of both sets,
  at a zoom of **20,000 light years** and again at **4,000**, at 1280x720, with the overlay
  on and again with it off, in each of `simplified` and `accurate`, and reads the frames
  within 8 CSS pixels of the projection of the centre
- **THEN** at 20,000 light years the frame with the overlay differs from the frame without it
  in both modes; at 4,000 the two frames are identical within that window and the page holds
  no region label.

  **MODIFIED in this scenario**: the band is now the range band and not the zoom band, so the
  close end moved from 10,000 light years to 20,000, and the reading at 4,000 is a window and
  not the whole frame.

  20,000 light years is the closest range at which a line draws in full: the range fade
  reaches 1 at 20,000 and the zoom fade leaves 20,000 at 1, so both readings are 1 at the
  cursor's own range. At 4,000 the centre sits at the cursor, where the range fade is 0. The
  rest of the frame is not read there, because a line near the horizon is over 10,000 light
  years off and does draw, which is the whole point of the range fade.

  The centre has to be on both sets and not only on the traced one, because the smoothed line
  may sit 49.3 light years from the traced one. The two lines coincide over most of their
  length, so such a point exists: the search gives a point on a traced segment within half a
  light year of the smoothed set

#### Scenario: A far line still draws while the near line is gone

- **WHEN** the browser test opens a view at a zoom of **4,000 light years** at a pitch of
  **30 degrees**, in `accurate`, with the overlay on and again with it off, and counts the
  pixels the overlay changed in the **top 10 per cent of the rows** and in the rows **below 30
  per cent**
- **THEN** the top band holds changed pixels and the lower band holds none.

  The bands are set by the geometry and not by eye. The vertical field of view is 60 degrees,
  so the horizon sits at `0.5 - 0.5 * tan(pitch) / tan(30)` of the frame height from the top.
  A pitch of 30 degrees puts it at the top edge, so every row of the frame reads the plane. A
  lower pitch would put the horizon inside the frame and the rows above it would be sky, which
  is why this scenario does not read at a pitch of 5.

  At a zoom of 4,000 light years and a pitch of 30 the camera sits **2,000 light years** above
  the plane. The rows whose plane point is beyond 20,000 light years, where the range fade is
  1, are the top **11.0 per cent**; the rows whose plane point is under 10,000, where the fade
  is 0, are everything below **21.1 per cent**. The two bands this scenario reads, 10 per cent
  and 30 per cent, sit inside those and do not touch.

  The close end of the zoom band this replaces cleared both bands

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 20,000 light years centred on a plane point
  that a unit test has found within 25 light years of a boundary chain, and reads the
  luminance at the projection of that point and at the projection of a plane point
  1,000 light years away from any chain
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  switched off the two readings differ by less than a fifth of the difference with it on

#### Scenario: The overlay fades out across the close end of the band

- **WHEN** the browser test opens the view a unit test has found **on** a chain of both sets,
  the same view the scenario "The boundary draws in full at the close end of the band" opens,
  at zooms of **20,000**, **15,000** and **9,000 light years**, with the overlay on and again
  with it off, in each of `simplified` and `accurate`, and reads the overlay's own
  contribution as the **largest** difference within 8 CSS pixels of the projection of the
  centre, the frame with the overlay less the frame without it
- **THEN** in both modes the contribution at 15,000 is between a fifth and four fifths of the
  contribution at 20,000, and the contribution at 9,000 is zero.

  The centre sits at the cursor, so its range to the camera is the zoom. 15,000 light years is
  the middle of the smooth step, where the range fade reads 0.5, and 9,000 is below the 10,000
  at which it reaches 0. The bounds are wide because the reading is a pixel of the frame and
  not the fade itself.

  The view is named and not taken from the scenario before it, because the 8 CSS pixel window
  has to hold one chain and no other: the search that finds this view keeps every other chain
  clear of it, and the 25 light year search the medium zoom scenario uses does not

#### Scenario: The overlay fades out across the far end of the zoom band

- **WHEN** the browser test opens the same view at zooms of **20,000**, **25,000** and
  **31,000 light years** and reads the same contribution, in each of `simplified` and
  `accurate`
- **THEN** in both modes the contribution at 25,000 is between a fifth and four fifths of the
  contribution at 20,000, and the contribution at 31,000 is zero.

  25,000 light years is the middle of the far smooth step. The range fade is 1 at every one of
  these three views, because the centre's range is the zoom and every zoom here is above
  20,000, so this scenario reads the zoom fade alone

#### Scenario: The line is one tone and lightens what it crosses

- **WHEN** the browser test opens the crossing view of the drawn set at **3840x2160** at a
  zoom of **20,000 light years**, reads one row of pixels across the chain, converts the run
  from device pixels to CSS pixels by the device pixel ratio, and compares it with the same
  row with the overlay off, in each of `simplified` and `accurate`
- **THEN** in both modes the middle of the run is lighter than both ends, no pixel of the run
  has a lower **luminance** than the same pixel with the overlay off, by
  `0.2126 r + 0.7152 g + 0.0722 b`, which is the reading the band is built to raise and not
  every channel of it, and the whole run of changed pixels is between 5 and 16 CSS pixels
  wide.

  The band is one tone and its luminance is 0.755, so it lightens every pixel of the disc it
  crosses. The old two-tone line could darken a pixel with its outline, and the scenario it
  replaces could not hold that.

  The band's half width is 3 CSS pixels, so the ramp covers 6, but the run of changed pixels
  is **5 or 6** and not always 6. The coverage is point-sampled on the device pixel grid, and
  the sample at a gap of exactly 3 carries no coverage. Where the middle of the line falls on
  a sample the samples sit at gaps 0, 1, 2 and 3 and the run is 5; where it falls between two
  samples they sit at 0.5, 1.5 and 2.5 and the run is 6. The phase of a found view is not
  controllable, which is why the bound carries both. The same phase is what spreads the
  table's unblurred width over 3.00 to 3.50 CSS pixels.

  5 or 6 is the **unblurred** run, which is what `simplified` gives at every zoom. The blur
  widens it: at the radius of 4.62 CSS pixels this view gives, `accurate` changes about 9 to
  10 CSS pixels. The bound of 5 to 16 covers both modes, and the scenario that follows
  measures the difference between them at half maximum.

  The viewport and the zoom are both doubled from the readings this scenario held before,
  from 1920x1080 at 10,000 light years to 3840x2160 at 20,000. One CSS pixel covers the same
  10.69 light years, the blur radius is the same 4.62, and every bound above is therefore
  unchanged. The doubling is what puts the reading beyond the range fade and inside the zoom
  fade at once.

  The band lightens the frame here because the search keeps the reading at least 5,000 light
  years from the galactic centre. Over the core itself the tone's luminance of 0.755 sits
  under the picture and the band would darken it, which is why the premise is in the search
  and not left to chance

#### Scenario: The blurred band is wider than the unblurred one

- **WHEN** the browser test reads the half-maximum width of the same two rows, in
  `simplified` and in `accurate`, at the same viewport and zoom
- **THEN** the width in `simplified` is between **3.0 and 3.5 CSS pixels**, the width in
  `accurate` is between **4.6 and 4.9**, and the peak alpha of the two differs by less than
  15 per cent.

  `simplified` never blurs, so it gives the unblurred band at every zoom. `accurate` blurs at
  a radius of 4.62 CSS pixels here, which is the cell at the range this view reads at and this
  height. The peak clause is what checks the normalisation: without it the blurred band would
  read at about three fifths of the unblurred band's alpha

#### Scenario: The far band is wider than the unblurred one as well

- **WHEN** the browser test reads the half-maximum width of the same two rows at **1920x1080**
  at a zoom of **20,000 light years**, where the blur radius is 2.31 CSS pixels and the floor
  holds the standard deviation at 1, in `simplified` and in `accurate`
- **THEN** the width in `simplified` is between **3.0 and 3.5 CSS pixels**, the width in
  `accurate` is between **3.75 and 4.18**, and the peak alpha of the two differs by less than
  15 per cent.

  This is the reading the floor buys. The rule this replaces ran no blur at a radius of 2.31,
  so both modes gave the same 3.0 to 3.5 here and the traced staircase drew unsoftened

#### Scenario: The blur keeps a straight run and rounds a corner

- **WHEN** a unit test builds the coverage field of a straight line and of a line that turns
  by 90 degrees, both by the pass's own ramp rule point-sampled on a device pixel grid at a
  ratio of 1, applies the pass's own blur kernel and its normalisation at radii of 0.50, 1.50,
  2.99, 3.00, 3.85, 4.62, 5.77 and 8.00 CSS pixels, which are the table's own rows and three
  radii the floor acts at, and reads the peak and the half-maximum contour of each over
  **twelve sub-pixel phases** of the line
- **THEN** every reading falls inside the table this requirement states, within the
  tolerances it gives; the three radii under 3.00 read the same normalisation, sampled peak
  and width as the 3.00 row, to three decimal places, because the floor gives them the same
  kernel; the normalised peak is at most 1 and at least 0.91 at every radius
  and phase; and the blurred corner's contour departs from a **sharp corner of the same
  width** by at least 0.2 and at most 1.0 of the radius at the turn, and by less than 0.1 of
  it along each arm, the departure at a radius under 3.00 being read against the 3.00 radius
  the floor gives it.

  The departure is measured against a sharp corner of the same width, and not against the
  unblurred corner, because the blur does two things at once: it rounds the turn and it
  widens the band. Only the first one is this scenario's property. The reference is the
  contour a sharp corner holds at the blurred straight run's own half-maximum half width: at
  the turn that contour sits at the half width outside the bend and at the root of two times
  the half width inside it, and along each arm it sits at the half width. The test reads the
  departure at the turn along the bisector, on the inside and on the outside, and takes the
  larger of the two. It reads the departure along each arm at 8, 11, 14 and 17 CSS pixels
  from the turn, on both sides, and takes the largest.

  Against the unblurred corner the two halves cannot both hold. That comparison gives 0.27 to
  0.53 of the radius at the turn and 0.14 to 0.25 along the arms, because it counts the
  widening as a departure. Against the sharp corner the readings are 0.226 to 0.288 of the
  radius at the turn and 0.000 to 0.013 along the arms.

  The phases are what make this a real test. A single phase hides the sampling, and the
  sampling is where the earlier draft of this requirement was wrong.

  This is a unit test and not a browser test, because the property is a property of the
  kernel, the ramp and the pixel grid. The browser tests below read what they give on screen

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view at **3200x1800** at a zoom of **20,000 light
  years**, a unit test having chosen the place so that the drawn line **turns by at least 30
  degrees within a reach of 8 CSS pixels** and sits at the cursor, whose range is the zoom, and reads the luminance of every pixel the overlay changes within 8 CSS pixels of
  that place
- **THEN** taking each pixel's change as the frame with the overlay less the frame
  without it, no pixel at the bend has a change more than **3 per cent** above the largest
  change on a straight run of the same chain in the same frame, and no pixel inside the bend
  is unchanged.

  The bend is measured over a reach and not between two neighbouring segments, because
  the requirement above holds every single vertex of the smoothed set to 20 degrees, so no
  two neighbouring segments of it can meet under 160 degrees. The comparison is of the
  overlay's own contribution, because the overlay draws at less than full opacity and the
  galaxy under a corner can be brighter than the galaxy under a straight run

#### Scenario: A 90 degree corner of the traced set is not brighter than its line

- **WHEN** the browser test sets the mode to `accurate`, opens a view a unit test has chosen
  at a lattice node where the traced line turns by 90 degrees and sits at the cursor, whose
  range is the zoom, at **3840x2160** at a zoom of **20,000 light years**, and reads the
  overlay's own contribution at every pixel within **6 CSS pixels** of the node
- **THEN** no pixel at the corner has a contribution more than **3 per cent** above the
  largest contribution on a straight run of the same chain in the same frame, and no pixel
  inside the corner is unchanged.

  The tolerance is the sampling of the ridge and not the clamp, which the requirement above
  states: the corner reads up to 1.010 of a straight run at this radius.

  **This is the scenario that reads the clamp.** The viewport, the zoom and the range are
  what put the blur under it: at 2,160 rows the radius is 4.62 CSS pixels, the widest the
  radius rule gives, and the node sits beyond the range fade, so the line draws in full. A
  smaller viewport gives a smaller radius, and a node inside the range fade draws at a part
  of its alpha, and either reading would compare a corner against a straight run that the
  fade or the radius already changed.

  The read radius of 6 CSS pixels reads this node alone. The search asks each arm to be at
  least 48 CSS pixels, so the nodes each side sit well outside the reading. The straight run
  the reading is compared with SHALL be a part of the same chain that holds its direction over
  at least 20 CSS pixels, which an arm of 48 CSS pixels does.

  The reading radius is a property of the view and not of the module. `readJoin` in
  `e2e/regions.spec.ts` SHALL take it from the view the unit test wrote, so the join scenario
  keeps its 8 CSS pixels and this one takes 6, and the window each reading excludes follows
  its own radius

#### Scenario: The overlay costs under a millisecond

- **WHEN** the browser test opens a view at 1920x1080 in `accurate` at a zoom of 4,000
  light years and reads `measureFrames` with the overlay off and with it on
- **THEN** the two readings differ by 1 ms or less.

  4,000 light years is the costliest frame the pass can draw. The radius rule reads the cell
  at `max(cursorDistance, 10000)`, so every zoom of 10,000 light years and below gives the
  same widest radius of 4.62 CSS pixels, which is 11 taps on each of the two blur passes. The
  reading was 5,200 light years before this change, because the zoom band took the whole
  overlay away below 5,000. The band goes, so the pass now runs at every zoom under 30,000
  and the cost must be read where the kernel is widest

### Requirement: A region in view carries a label

The page SHALL draw region labels as text over the canvas. A region SHALL be a candidate
for a label when it covers enough of the frame to be worth naming, measured by sampling.

The page SHALL sample the frame on a grid of screen points, resolve the plane point
under each one at `y = 0`, and read the region that holds it from a region grid the
scene data carries. A region SHALL be a candidate when it holds at least 1 percent of
the samples that fall on the plane inside the model bounds. A region that holds no
sample SHALL NOT be a candidate, whatever its bounds are.

A region that carried a label in the frame before SHALL stay a candidate until its share
falls below **half** that threshold. Without this a region sitting on the threshold
enters and leaves the candidate set between frames, and its label blinks.

A label's anchor SHALL be worked out **on the galactic plane and then projected to the
screen**, not worked out on the screen. The sample points are a grid that is fixed in
screen space, so any position averaged or chosen in screen space changes only when a
sample crosses a region edge: it holds still and then steps. The plane position under a
sample moves with the camera, so a position worked out from those moves with the camera
too, and its projection slides rather than steps.

**A label belongs at the centre of its region.** A label's target SHALL be the region's
own centroid on the galactic plane, while the region under that centroid is that region
and while the centroid projects inside the frame with the 48 CSS pixel label inset. The
inset is the room the label box needs, and it is the same figure the anchor is held
inside, so the target is the centre exactly while the centre has room for the label.

The centroid is one fixed point of the galaxy. Nothing about the frame goes into it, so a
label on it does not move over the map at any camera speed: its projection slides with the
camera, and nothing else moves it. At a view of the whole galaxy 11 of the 20 labels sit on
the centre of their region, and over a drag of 90 frames every one of the 512 readings of a
label on its centre holds the same plane point as the frame before, to the last digit.

**Where the centre has no room, the label SHALL move the least it can.** This rule SHALL
apply only while the centroid projects **inside the frame**. Outside the frame the rule
says nothing useful: holding a projection that is far away inside the inset gives a corner
of the frame, and a corner carries nothing about where the region is. The frame then shows
only a part of the region, and the rule below answers that case.

The page SHALL hold the projection of the centroid inside the inset and read that held
point back to the plane. When the region under the read-back point is the label's own
region, that point SHALL be the target. This is the shortest move on the screen that gives
the label room.

When the read-back point is over another region, the page SHALL search out from the
**projection of the centroid** on rings of **12, 24, 48 and 96 CSS pixels**, twelve
directions to a ring, and take the first point that is on the label's own region and
inside the inset. The rings are a coarse step and not the least move: a point on the
region at 60 pixels is skipped, and the point at 96 taken. Four rings hold the worst
reading of the measure to 4.7 CSS pixels, so a finer step buys nothing a reader can see. The search SHALL measure on the screen and not on
the plane: at a low pitch one light year across the screen is many light years up it, so a
point near on the plane can be far on the screen, and the rule is about the screen.

The search SHALL stop at **96 CSS pixels**. A region can reach into the inset band at the
edge of the frame, and the point of it that is both on the region and inside the inset can
be hundreds of pixels along that band. To move the label there costs more than it gives:
the label leaves the middle of its region for a corner of the frame. Where no point that
near holds the label, the target SHALL stay the centroid, and the box rule below moves the
box itself into the frame. The label then touches the frame edge, stays on the middle of
its region and stays readable.

**Where the centre does not project inside the frame, the label SHALL go to the part of
the region the frame shows.** The target SHALL be the mean of the plane positions of the
samples its region holds, or, when the region under that mean is another region, the plane
position of the sample its own region holds nearest that mean. A region under the camera
fills the whole frame, and the middle of the frame is where its label belongs.

**The handover between the two rules SHALL carry a hysteresis band.** The centre rule SHALL
be taken up when the centroid projects **inside the frame**, and SHALL be held, once taken
up, while the centroid projects inside the frame grown by **a quarter of the frame** on each
side, which is the reach the carried target and the carried anchor already take.

The two rules can name places most of a frame apart, and the centroid's projection sits
exactly on the frame edge as the camera turns. Without the band the target crosses back and
forth between the two on almost every frame there. The smoothed target then settles
between them, which is a place neither rule chose, and the label sits on neither the centre
of its region nor the part of it the frame shows.

Over a view in which regions reach past the frame, the displaced target measures **4.7 CSS
pixels** from the projection of the centroid at worst. An earlier rule that measured
nearness on the plane moved one such label **192 CSS pixels** sideways to hold a 29 pixel
move down, which reads as the label leaving its region.

Reading the frame's samples is what makes a label move while the camera moves, because the
sample grid is fixed on the screen and slides over the plane. The centre rule is there so
that a label whose region has room for it reads none of that.

**The label box SHALL NOT cross the edge of its own region.** A box that crosses the edge
reads as naming the region beside it. The box is a screen thing and the target is a plane
point, so the page SHALL read the plane step of one screen pixel across and one down, and
then move the target in those two directions. Six points of the box SHALL be tested
against the region: the four corners and the middle of the top and the bottom edge. The
search SHALL grow its step over five passes and try twelve directions at each, SHALL take
the point that leaves the fewest points of the box off the region, and SHALL stop as soon
as none are. Every candidate SHALL sit on the region and project inside the frame, so the
search never moves a label off its region or off the screen.

A region narrower on the screen than the label is wide has no point that holds its box.
At a view of the whole galaxy 1 of 12 boxes still crosses, at a wide view 2 of 12, and at
two closer views none. To hold those as well needs the label to get smaller, which this
change does not do.

The anchor SHALL move in every frame in which the camera moves, and SHALL NOT snap to the
grid of sample points. While a region shows as one connected patch and its anchor has
settled on the target, a camera turn of 0.1
degrees between two frames SHALL move its anchor, and SHALL move it by less than 8 CSS
pixels. The bound is read on a settled anchor because the filter above adds up to the
cap of its own, which is 20 CSS pixels in a frame of 60 a second, while a label is still
going to a target that moved.

Both halves are needed. A rule that snaps to the nearest sample moves the anchor a whole
sample spacing at once, 32 CSS pixels, which the upper bound catches. A rule that
averages sample positions in screen space passes that upper bound easily, at a worst move
of 1.0 CSS pixels, and still reads as jumping, because the anchor is unmoved in 58
percent of frames and carries the whole motion in the rest. Only the lower bound catches
that one.

**The target SHALL be smoothed before the anchor follows it.** The target of a frame is
the mean above, or the fallback above. A region that carried a label in the frame before
SHALL carry the smoothed target it used into this frame, and the smoothed target of this
frame SHALL be the carried one moved a share of the way to the frame's own target, in
plane coordinates.

The carried target SHALL be dropped, and the frame's own target taken whole, when it no
longer resolves to its region and when it goes out of reach of the frame. The reach is the
frame grown by **a quarter of the frame** on each side, which is the reach the carried
anchor takes below. A zoom magnifies the view, so a point on the centre of its region can
go off the frame while the region itself stays in view; a target further out than the
reach is stale.

**Every rule of the placement SHALL read the seconds the frame covers.** The page SHALL
give the placement the time since the frame before, clamped to at most **0.1 seconds**, and
every share, floor and cap below SHALL be a rate over that time and not a figure per frame.

A rule per frame makes the speed of a label follow the frame rate of the display. The rules
below were measured at **60 frames a second**, and a figure per frame moves a label **2.4
times as fast** on a 144 Hz display and 0.5 times as fast on a 30 Hz one. A label on a fast
display therefore crossed much more of the screen in the same time than the one the rules
were tuned against. Each rate below is set so that a frame of 16.667 milliseconds gives
exactly what the rule per frame gave, so every measured reading in this requirement holds
at 60 frames a second and now holds at every other frame rate as well.

**The share SHALL fall by half over a fixed time.** The smoothed target SHALL take
`1 - 0.5 ** (seconds * 1000 / 71)` of the gap to the frame's own target, so the gap falls
by half every **71 milliseconds**. At 60 frames a second that is a share of 0.150, which is
the share this rule held per frame.

**The smoothed target SHALL NOT move over the map faster than 120 CSS pixels a second.**
The page SHALL read `carry`, which is how far the projection of the carried target moved
between the frame before and this frame. That is the map's own motion under the label. The
move of the smoothed target on the screen SHALL be at most `carry + 120 * seconds` CSS
pixels. Where the share asks for more, the move SHALL be cut to that bound, along the line
to the frame's own target.

**This is the rule that stops a label travelling further than it should.** A label rides
the map. `carry` is what the map moved, and the 120 CSS pixels a second is the whole of
what the label may add to that. A label can therefore never cross the frame while the
galaxy under it holds still, and it can never overtake the galaxy by more than a fifth of a
1080 row frame in a second.

**The cap SHALL NOT apply on a frame the caller marks as a view jump.** A jump is a write of
the view that is not a movement of it: `setView`, the landing of a selection flight, and a
view read from the URL. On such a frame the page SHALL drop the carried target and take the
frame's own target whole. The drift cap answers a label that wanders while the map moves
normally; on a jump the whole frame is another place, and holding a target from the frame
before would make the label walk the width of the screen to catch up.

**The anchor SHALL NOT be dropped on a jump.** It keeps the plane point it holds and walks
to the whole-taken target under its own cap of 1,200 CSS pixels a second. This is what the
scenarios "A pushed anchor comes back to the centre at once" and "A label that must really
move does not crawl" read, and their figures are figures of the anchor. The caller already
knows which writes of the view are jumps, so the page does not have to guess it from how far
the frame moved: a fast drag and a jump can move the same number of pixels.

**REMOVED from this requirement**: the share that grew with the gap by
`0.15 + 0.85 * min(1, gap / 120) ** 3`, and with it the reading of **120 CSS pixels** at
which the frame's own target was taken whole. That reading was a gate, and this requirement
already states what a gate does: it puts the label somewhere else in one frame, which is
the jump the filter is there to stop. The three rules that moved a target a long way in a
few frames all crossed it. The target rule hands over from the region's centre to the
frame's own samples, and the two can sit most of a frame apart. The search that moves a
label off a neighbour steps between rings of 12, 24, 48 and 96 CSS pixels. A region that
shows as two patches carries its target from one patch to the other. Under the cap above
each of those is a walk the user can follow.

The carried target is still dropped, and the frame's own target still taken whole, when it
no longer resolves to its region or goes out of reach of the frame. That is the rule for a
camera that really jumps, and the cap does not apply to it: there is nothing to walk from.

Where the smoothed point falls on another region, the carried point SHALL be kept. A
region can show as two separated patches, and the point between this frame's target and
the one before then falls in the gap. Taking this frame's target instead would carry the
label to the other patch in one frame.

**A held anchor goes to its smoothed target at once, and answers the sampling noise
slowly.** A region that carried a label in the frame before SHALL carry its anchor's plane
point into this frame, and that point SHALL then move toward the smoothed target.

The step SHALL be read on the screen and not on the plane, because a plane step of a fixed
size covers a different number of pixels at every zoom. The projection is not linear, so
the share of the plane gap that gives the wanted step SHALL be **solved for**: the page
reads what a share really moved on the screen and corrects it, **up as well as down**,
until the step is the one asked for. A correction that goes downward alone makes the label
crawl near the camera, where the first guess undershoots: over a jump from a camera
distance of 640 to 10 the anchor ran at about a third of the cap and took 52 frames rather
than 25.

For a gap of `gap` CSS pixels between the projection of the carried point and the
projection of the smoothed target, over a frame of `seconds`, the step SHALL be:

```
fall = 1 - 0.5 ** (seconds * 1000 / 16.667)
min(1200 * seconds, max(min(gap, 24 * seconds), gap * fall * min(1, gap / 48)))
```

That is: the gap falls by half every **16.667 milliseconds** at or above a gap of **48 CSS
pixels**, the speed falls with the gap below that, the step is never more than a cap of
**1,200 CSS pixels a second** and never less than a floor of **24 CSS pixels a second**.

At 60 frames a second those rates give a share of 0.500, a cap of 20.0 CSS pixels and a
floor of 0.40 CSS pixels in one frame, which is what this rule held per frame. Every
reading in this requirement is stated at 60 frames a second and is unchanged.

**Why both parts are needed.** The anchor is read from a grid of samples that is fixed on
the screen. The grid slides over the plane while the camera moves, so samples cross region
edges and the target of a frame does not move smoothly. Over a drag of 30 light years a
frame at a camera distance of 2000, the target steps 3.3 CSS pixels in a middle frame, and
it changes that step by 2.2 CSS pixels from one frame to the next. A mean of the target
over 20 frames still moves 1.9 pixels a frame, so most of that is not noise to average
away: the visible part of a region really does travel under the camera, and the label must
follow it.

A person reads the change of step from frame to frame, and not the step: a label that
keeps its step slides with the map, and a label that changes it jumps. Taking each frame's
target whole, and moving half of the gap under the cap, changes the step by 1.0 CSS
pixels in a middle frame of that drag and by 3.0 in the worst tenth, and the labels shake.

Speed that falls with the gap takes that to 0.45 and 1.3, because a large gap is a real
move and a small gap is the noise. It cannot go further on its own: the band from 8 to 48
pixels is both the noise the label must ignore and the last part of every relocation, so
more damping there slows every move. Smoothing the target first separates the two. The
anchor then follows a line that already moves smoothly, at the same speed as before, and
the change of step falls to **0.09** and **0.36**. Over a faster drag of 200 light years a
frame at a distance of 20000 it is **0.16** and **0.67**.

The knee is 48 CSS pixels because that is the smallest real move the anchor must answer at
full speed. The floor is there because speed that falls with the gap otherwise takes
hundreds of frames over the last few pixels.

A label pushed to the frame edge by a camera that then jumps back measures 128 CSS pixels
from the middle of its region in the unit test. It is within 8 CSS pixels of that middle at
frame 13, which is 217 milliseconds, and within 2 at frame 26.

**The browser reading of this push was taken again.** It read **382 milliseconds** to 8 CSS
pixels from 70 CSS pixels out before this change, against the 400 the browser suite allows,
and it was slow because the camera jump moved the target as well as the anchor and the two
filters ran in series. The push is a `setView`, which the rule above marks as a view jump,
so the target is now taken whole and the anchor runs alone. The new reading is **162.3
milliseconds** to 8 CSS pixels, 45.6 to 20 and 378.9 to 2, and the worst frame moved the
label by 20.03 CSS pixels against the cap of 20.0 that a frame of 16.667 milliseconds gives.
The 382 milliseconds are retired.

The push starts **47.5 CSS pixels** from the middle of the region and not the 70 it started
at. The browser reads the label in the frame after the jump, and the anchor has already run
one step of its cap by then: the old rule crept the target as well, so the first reading sat
further out. The bound of 400 milliseconds stands, and the label goes where it belongs and
does not crawl.

The filter replaces a hold that kept the anchor where it was for as long as the point still
resolved to the region and still projected inside the frame. What the hold did, and should
not have, was keep a label at the frame edge it had been pushed to long after the region was
back in full view.

**The carried anchor SHALL NOT be dropped for leaving its own region.** The target is
always on its region, so an anchor that walks toward it comes back to the region on its
own. A gate does the opposite of what it is for: it drops the carried point in one frame,
and the label then goes to the target in one step, which is what a person sees as a jump.

**The carried anchor SHALL be dropped only when it goes out of reach of the frame.** The
reach is the frame grown by **a quarter of the frame** on each side. A wheel held down
changes the camera distance by 15 percent in a frame, which throws the anchor of a label
near the edge a little outside the frame while its region stays in view; the margin keeps
that anchor and the filter walks it back. A camera that jumps to another view leaves the
anchor further out than that, and the label re-places at once.

An earlier gate dropped the anchor at the frame edge itself, with no margin, and fired on
almost every wheel notch.

A region is not always a convex shape, so the straight line from the carried point to the
target can go over a neighbour. The step SHALL get shorter, halving up to six times, to
land on the region where a shorter step does. Where none does, the step SHALL stand: the
anchor comes back to the region as it walks.

A region that carried no label in the frame before SHALL start at the target.

**The drawn anchor SHALL be held inside the viewport, and not inside the inset.** The inset
is where the target rule puts a label that must move. To hold the drawn anchor there as
well pins a label near the frame edge to one place on the screen while the map slides under
it, which reads as the label moving over the map. The box rule moves the box itself fully
into the frame, so a label at the edge stays readable and still slides with its region.

**A zoom SHALL read like a drag.** The measure is how far a label moves from the projection
of its own region centre from one frame to the next, because a label that holds that offset
slides with the map. Over a drag of 60 light years a frame the worst reading is **2.7 CSS
pixels** and the mean is **0.13**. Over 28 steps of 15 percent of the distance, each in one
frame, which is more than a wheel notch moves in a frame, the worst is **7.0** and the mean
**0.49**. Over a wheel held down,
with no still frame between the notches, the worst is **13.2** and the mean **1.40**.

Before these rules the same wheel notches gave a worst reading of **38.3** and the held
wheel **36.9**, and the anchor of one label ran **2,500 CSS pixels** past the frame while
its region stayed in view.

The candidate that holds the sample nearest the centre of the frame SHALL be placed
first, so the region the view is centred on is always named. Ordering by sample count
alone does not do this: at a view of the galactic centre at 1280x720, 24 regions clear
the threshold and 14 of them hold more samples than the `Galactic Centre`, so the cap
below is reached before it. The remaining candidates SHALL be placed in order of the samples they hold, most first,
after the count of a candidate that carried a label in the frame before is multiplied by
**1.2**. The order decides which label the overlap rule drops, so an order that changes
between frames drops a different label each time and the set of labels flickers. The
bonus is a margin and not a priority: a region that now fills the frame still overtakes a
region that is leaving it, which a rule placing every past label ahead of every new one
would prevent. Candidates that are still equal after the bonus SHALL be placed in order
of region id, so the order is total and cannot change between two frames that hold the
same counts.

When no sample lands on the plane inside the model bounds, no label SHALL be placed. A
label whose box would overlap a label already placed SHALL be dropped, and at most 12
labels SHALL be placed.

The sampling SHALL cost, at 1920x1080, less than 2 milliseconds of the main thread as a
mean over 300 frames and less than 4 milliseconds in any single frame. The page SHALL
expose both figures so a test can read them.

**Labels SHALL keep a band of zoom distance**: none at 30,000 light years and above, full
from 20,000 down to 10,000, falling on a smooth step to none at **5,000** and below. A label
SHALL carry the fade as the opacity of its element.

The band is the label's own, and it is no longer the band the boundaries take. The
boundaries hold the far end of it, from 20,000 to 30,000 light years, and take a **range
fade** in place of the close end, so a far line still draws at a close zoom. A label does not
take the range fade. A label names the region the view sits in, and the view sits in one
region at a close zoom, so a name that faded by the range of its own anchor would go out
exactly where it is the only name the frame needs. The HUD's top bar carries the name below
5,000 light years.

Below 5,000 light years the page SHALL place **no** label and SHALL NOT run the sampling
sweep. The sweep costs up to 2 milliseconds of the main thread, and a frame that shows no
name has no reason to pay it. The user reads the region from the HUD's top bar at those
zooms.

The placement rules above are a pure function of the frame's samples and do not read the
fade, so the unit scenarios below hold at every camera distance they name. Several of them
sit at camera distances of 2,000, 640, 800 and 10 light years, where no label now reaches
the screen, the anchor scenarios among them. They are kept as regression bounds on the
placement itself, and their figures were measured there; they are not claims about what a
user sees at those zooms.

#### Scenario: No label at the far view

- **WHEN** the browser test opens the default view
- **THEN** the page holds no region label

#### Scenario: The core is named

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`
- **THEN** a label reading `Galactic Centre` is on the page, its box lies inside the
  viewport, and it is placed even though at least 12 other regions hold more samples

#### Scenario: The region the camera is inside is named at every zoom

- **WHEN** the browser test opens `#c=0,0,0&p=35&y=0` at each of 20,000, 15,000, 10,000,
  7,500 and 4,000 light years
- **THEN** a label reading `Inner Orion Spur` is on the page at 20,000, at 15,000 and at
  10,000, and its box lies inside the viewport; at 7,500 that label is on the page at an
  opacity between 0.2 and 0.8; and at 4,000 the page holds no region label.

  "Every zoom" is every zoom the overlay draws in. The band above takes the labels away
  below 5,000 light years, and the HUD's top bar names the region there instead

#### Scenario: A region with nothing on screen carries no label

- **WHEN** the browser test opens `#c=0,0,0&d=12000&p=35&y=0`, reads every label on the
  page, and works out for itself which regions the frame shows, by resolving the plane
  point under a grid of screen points against the coarse region grid rather than reading
  the counts the label code made
- **THEN** every label on the page names a region the frame shows, and no label names a
  region it does not

#### Scenario: The camera keeps the label of the region it sits in when it turns away

- **WHEN** the browser test opens `#c=0,0,0&d=12000&p=35&y=0` and then
  `#c=0,0,0&d=12000&p=35&y=180`, where the camera looks away from the Inner Orion Spur's
  centroid, and in each view works out for itself what share of the plane samples each
  region holds, by resolving a grid of screen points against the coarse region grid rather
  than reading the counts the label code made
- **THEN** both views hold a label reading `Inner Orion Spur`, every label on the page names
  a region whose measured share is at least 1 percent, and no region whose measured share is
  at least 5 percent is left without a label.

  The view moved from 500 light years to 12,000, because the fade above places no label at
  500. The shares are measured by the test and not written into it, because the shares at
  the new distance are not the shares the old one gave

#### Scenario: A label anchor moves with the camera and does not snap

- **WHEN** a test opens `#c=0,0,0&d=2000&p=35&y=0` at 1920x1080, turns the camera by 0.1
  degrees between frames over 120 frames, and reads the anchor of `Inner Orion Spur` in
  every frame, where that region shows as one connected patch
- **THEN** the anchor moves in every frame, and no frame moves it by 8 CSS pixels or
  more. The vertical field of view is 60 degrees, so at 1080 rows a 0.1 degree turn
  carries a point about 1.6 CSS pixels at the centre of the frame and about 3.4 at its
  side, and the upper bound holds that with room. Two rules fail this scenario. Taking
  the sample nearest the mean moves the anchor 32 CSS pixels at once, which the upper
  bound catches. Averaging the sample positions in screen space passes the upper bound at
  a worst move of 1.0 CSS pixels and fails the lower one, because it leaves the anchor
  unmoved in 58 percent of the frames

#### Scenario: A region in two patches keeps its anchor on itself

- **WHEN** a unit test places a region whose samples fall in two separated patches of one
  frame, so that the mean of its sample positions lies on a different region
- **THEN** the anchor is a sample the region itself holds, it is not the mean, and the
  region under it is that region. Taking the sample nearest the mean without restricting
  it to the region's own samples would put the anchor on the region the mean landed on

#### Scenario: A region on the threshold does not blink

- **WHEN** a unit test runs the placement over consecutive frames in which one region's
  share falls from above 1 percent to 0.7 percent and then to 0.4 percent
- **THEN** the region is a candidate while its share is above 1 percent, it is still a
  candidate at 0.7 percent because it carried a label in the frame before, and it is not
  a candidate at 0.4 percent

#### Scenario: A region entering the frame overtakes one that is leaving

- **WHEN** a unit test runs the placement over consecutive frames of a pan in which a
  region that carries a label falls to 60 percent of the samples of a region that carries
  none
- **THEN** the region that carries none is placed first, because the 1.2 bonus is a
  margin against a swap on a near tie and not a priority that holds a stale label in
  place; and where the two counts are within the bonus of each other the region that
  carried a label keeps its place

#### Scenario: A pushed anchor comes back to the centre at once

- **WHEN** a unit test runs the placement over a camera that jumps in one frame from a
  corner of the frame, where the region's anchor is held against the 48 pixel inset, to the
  middle of the frame, and then over 60 further frames with the camera still
- **THEN** the anchor starts more than 40 CSS pixels from the projection of the region's
  mean, no frame carries it away from that mean, it is within 8 CSS pixels of it **by frame
  15** and within 2 by frame 30, and it moves by no more than 20 CSS pixels in any one
  frame, which is the cap of 1,200 CSS pixels a second over a frame of 16.667 milliseconds

#### Scenario: A label sits on the centre of its region

- **WHEN** a unit test reads the labels of a view of the whole galaxy at 1280 by 720, and
  for each one works out whether its region's centroid sits on that region, projects inside
  the frame with the 48 pixel inset, and holds the label box
- **THEN** every label whose centre has that room takes the centroid itself as its target,
  to the last digit, and more than half of the labels of the frame do

#### Scenario: A label whose centre has no room goes to the visible part

- **WHEN** a unit test reads the labels of a view at a camera distance of 800 inside the
  galactic centre, where a region reaches well past the frame
- **THEN** each label whose centre has no room takes a target that is not the centroid,
  that sits on its own region, and that projects inside the frame

#### Scenario: A label whose centre is outside the frame goes to the visible part

- **WHEN** a unit test places the label of the region the camera sits in at a camera
  distance of 10, where the region fills the frame and its centre projects far outside it
- **THEN** the label sits near the middle of the frame, on the mean of the region's own
  samples, and not against an edge of it

#### Scenario: A label reaches its place after a view jump

- **WHEN** a unit test settles the label of `Inner Orion Spur` at a camera distance of 640,
  then jumps the camera to a distance of 10 and runs the placement on
- **THEN** the anchor is within 8 CSS pixels of its target by frame 25. A step corrected
  downward alone ran at about a third of the cap and took 52 frames

#### Scenario: A displaced label moves only a little

- **WHEN** a unit test reads the labels of a view of a corner of the galaxy at a camera
  distance of 9000, where regions reach past the frame, and for each label whose centre has
  no room but still projects inside the frame reads how far its target is from the
  projection of the centroid
- **THEN** no target is more than 6 CSS pixels from the centre, and the worst reading is
  4.7 CSS pixels

#### Scenario: The label box stays inside its own region

- **WHEN** a unit test places the labels of four views, from the whole galaxy to a camera
  distance of 800, and tests six points of each label box against the region grid
- **THEN** at most 2 of the 12 boxes of any view cross the edge of their own region, and
  every one that does belongs to a region narrower on the screen than the label is wide

#### Scenario: A label on its centre does not move over the map

- **WHEN** a unit test runs the placement over 90 frames of a drag of 200 light years a
  frame at a camera distance of 20000, and reads the plane point of every label whose
  target is its region's centroid
- **THEN** every one of the 512 readings holds the same plane point as the frame before, to
  the last digit, and none moves

#### Scenario: A zoom reads like a drag

- **WHEN** a unit test reads, for every label, how far it moves from the projection of its
  own region centre from one frame to the next, over a drag of 60 light years a frame, over
  28 wheel notches of 15 percent each with 6 still frames between them, and over the same
  28 notches with no still frame between them
- **THEN** the drag moves a label by less than 8 CSS pixels at worst, the notches by less
  than 12 at worst and less than 1 on the mean, and the held wheel by less than 20 at worst
  and less than 2 on the mean

#### Scenario: A label that must really move does not crawl

- **WHEN** the camera jumps and the label of a region starts about 47.5 CSS pixels from the
  middle of its region
- **THEN** the label comes within 8 CSS pixels of the middle inside **400 milliseconds**,
  and no frame moves it more than `1200 * seconds` CSS pixels.

  **MODIFIED in this scenario**: the premise. The browser reads the label in the frame
  after the jump, and the jump now takes the target whole, so the anchor has already run
  one step of its cap by the first reading. The premise read about 70 CSS pixels while the
  target crept as well. The measured reading is 162.3 milliseconds to 8 CSS pixels

#### Scenario: The rates give the old figures at 60 frames a second

- **WHEN** a unit test reads the target share, the anchor share, the anchor cap and the
  anchor floor for a frame of 16.667 milliseconds
- **THEN** the target share is 0.150, the anchor share is 0.500, the cap is 20.0 CSS pixels
  and the floor is 0.400 CSS pixels, each within 0.001

#### Scenario: The share of the gap follows the gap

- **WHEN** a unit test reads the share of the gap the target rule takes over a frame of
  16.667 milliseconds, at gaps of 4, 30, 90 and 120 CSS pixels
- **THEN** every reading is 0.150 to three places.

  **MODIFIED in this scenario**: the share grew with the cube of the gap before this change,
  from 0.150 at a gap of 4 CSS pixels to 1 at a gap of 120, which took the whole gap in one
  frame. It reads one figure now, and the drift cap of `carry + 120 * seconds` CSS pixels
  holds a large gap instead. The heading is the heading of the scenario this one replaces.

#### Scenario: A label moves the same distance at every frame rate

- **WHEN** a unit test settles a label, pushes its anchor 128 CSS pixels from the middle of
  its region, and runs the placement forward over 300 milliseconds with the camera still, in
  frames of exactly **1/30**, **1/60** and **1/144 of a second**, and reads how far the anchor
  has come after the frames **3, 6 and 9** at 1/30, **6, 12 and 18** at 1/60 and **15, 29 and
  44** at 1/144, which are the first frames that end at or after 100, 200 and 300
  milliseconds
- **THEN** the three readings are within **10 CSS pixels** of each other at 100 milliseconds
  and within **2 CSS pixels** at 200 and at 300.

  The frames are named and not the marks, because a mark does not fall on a frame boundary at
  every rate and floating point decides which side of it a sum of frame times falls on: six
  additions of 1/60 give 0.09999999999999999, which is under 0.1. The frame times are exact
  fractions of a second and not 33.333, 16.667 and 6.944 milliseconds: at 33.333 milliseconds
  the third frame ends at 99.999 and a test that read the mark would take the fourth, which
  reads 118.25 and breaks the bound below.
  Under it the rates give 116.0, 108.2 and 108.8 CSS pixels at 100 milliseconds, 120.8,
  119.9 and 120.3 at 200, and 123.2, 122.8 and 123.4 at 300. The spread is 7.8, 0.9 and 0.6.

  Under a rule per frame the 144 Hz run reaches 8 CSS pixels of the middle at frame 13, which
  is 90 milliseconds, and the 30 Hz run is still 11.4 CSS pixels out at 300 milliseconds,
  which is 9 frames.

  100 milliseconds is the coarsest mark because the damping `min(1, gap / 48)` and the cap of
  `1200 * seconds` are not rates: a 1/30 second frame takes one coarse step through the
  damping band where a 1/60 second frame takes two. The exponential term is a rate and
  carries no spread. The spread is therefore in the first frames alone, and it is gone by 200
  milliseconds

#### Scenario: The target does not overtake the map

- **WHEN** a unit test runs the placement over 120 frames of a drag of 30 light years a
  frame across the galactic centre, and over 120 frames with the camera still, and for every
  label reads how far its smoothed target moved on the screen and how far the projection of
  the target it carried moved
- **THEN** in every frame of both runs the target's move is at most the carried point's move
  plus `120 * seconds` CSS pixels, within 0.01, and over the still run no target moves more
  than 2.1 CSS pixels in any frame.

  The frames are 16.667 milliseconds, where `120 * seconds` is 2.0 CSS pixels

#### Scenario: A view jump takes the target whole

- **WHEN** a unit test settles a label, then runs one frame that it marks as a view jump, in
  which the region's own target names a plane point **300 CSS pixels** from the one the label
  carried, and then runs 30 frames with the camera still
- **THEN** the smoothed target is the frame's own target in the jump frame, the anchor is
  still the plane point it held before the jump, and the anchor comes within 8 CSS pixels of
  the new target inside **25 frames of 16.667 milliseconds**.

  The anchor's own rule gives 21 frames from a gap of 300 CSS pixels, and 25 is the bound
  with room for the projection solve. Under the drift cap the same move would take 2.5
  seconds, so this reading is what shows the cap did not apply

#### Scenario: A target that must cross the frame walks there

- **WHEN** a unit test places a label whose centre rule and whose sample rule name points
  **300 CSS pixels** apart, moves the camera so the centre rule hands over to the sample
  rule, and runs the placement on with the camera still
- **THEN** over frames of 16.667 milliseconds no frame moves the smoothed target more than
  2.1 CSS pixels, the target comes within **1 CSS pixel** of the new rule's point within
  **3 seconds**, and it never passes it. The approach is exponential, so the target never
  reaches the point exactly. The rule gives about 2.65 seconds

#### Scenario: The handover does not cross back and forth

- **WHEN** a unit test runs the placement over 120 frames of a slow camera turn that holds
  the centroid of one region within 10 CSS pixels of the frame edge
- **THEN** the rule that names that label's target changes at most once over the 120 frames

#### Scenario: The label walks smoothly while the camera drags

- **WHEN** a unit test runs the placement over 90 frames of a drag of 30 light years a
  frame across the galactic centre, and over 90 frames of a drag of 200 light years a frame
  at a camera distance of 20000, and reads for every label the length of the change of its
  screen step from one frame to the next, with both ends of each step projected through the
  frame they are read in, leaving out the frames in which a label leaves its region or the
  frame
- **THEN** the step changes by less than **0.2 CSS pixels** in a middle reading and by less
  than **0.7** in the worst tenth, over more than 200 readings of each drag, and no reading
  is over the cap of `1200 * seconds` CSS pixels. Taking each frame's target whole under a
  flat half-gap step
  gives 1.0 and 3.0 on the slower drag

#### Scenario: The filter does not hop between samples

- **WHEN** a unit test runs the placement over 120 frames of a slow pan across a region
  whose two nearest samples to the mean are within 1 light year of each other
- **THEN** the target of a frame moves by less than 1 CSS pixel, because the centre rule
  reads no sample while the centre of the region has room; no frame moves the anchor by
  more than the cap of `1200 * seconds` CSS pixels; and the anchor's plane point changes by
  less than one
  sample spacing in any single frame

#### Scenario: Labels neither crowd nor overlap

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` and reads the box of
  every label
- **THEN** there are at most 12 labels and no two boxes overlap

#### Scenario: The sampling stays inside its budget

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080 and reads
  the mean and the worst sampling time the page exposes over 300 frames
- **THEN** the mean is under 2 milliseconds and the worst single frame is under 4

#### Scenario: The sweep does not run below the band

- **WHEN** the browser test opens `#c=0,0,0&d=4000&p=35&y=0`, draws 60 frames and reads
  `labelSampling()`, which carries `frames`, `meanMs` and `worstMs`
- **THEN** the page holds no region label, `frames` is 0 and both `meanMs` and `worstMs` are
  0, so the sweep ran in no frame of the sixty

