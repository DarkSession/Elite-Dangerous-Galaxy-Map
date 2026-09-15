## REMOVED Requirements

### Requirement: The boundaries draw on the galactic plane in a zoom band

**Reason**: Three of its rules are replaced at once, so the block is replaced rather than
edited. The two-tone ribbon of a light core inside a dark outline becomes one soft warm
band. The per-pixel fade over the camera's distance to the line, from 200 to 1,500 light
years, becomes a fade over the zoom distance that empties the overlay below 5,000 light
years. The coverage the pass writes now passes through a blur, which rounds the 90 degree
corners of the traced set. The requirement "The boundaries draw as one soft band inside a
zoom band" states all three.

**Migration**: Nothing outside the map reads this. The pass is internal, the region mode
and the `regions` switch keep their names and their meanings, and no public call changes.
What changes for a user is the picture: no boundary below 5,000 light years, and one soft
band rather than a cored ribbon above it. `tests/region-views.ts` and `e2e/region-views.ts`
hold view constants this requirement chose, and the new requirement states that they are
searched again at a zoom of 10,000 light years or more.

## ADDED Requirements

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
  deviation `radius / 3` CSS pixels, sampled one **CSS pixel** apart with a linear filter on
  the coverage texture, with `2 * ceil(radius) + 1` taps. The largest radius is 8, so the
  count never passes **17** and no cap ever cuts the kernel.
- The step is one CSS pixel and not one device pixel so that the tap count does not follow
  the device pixel ratio. A step of one device pixel would need 33 taps at a ratio of 2 and a
  radius of 8, and a cap of 17 would then cut the kernel at 1.9 standard deviations and
  narrow the band by an amount that follows the display. The standard deviation is at least
  1 CSS pixel wherever the blur runs, because the blur runs only at a radius of 3 and above,
  so a step of one CSS pixel samples the kernel well.
- The blur SHALL run in `accurate` alone, and only where the radius reaches **3 CSS
  pixels**. In `simplified`, and in `accurate` above that zoom, the pass SHALL NOT blur and
  the normalisation SHALL be 1.
- The radius SHALL be `min(cell, 8)` CSS pixels, where `cell` is the region grid's own cell
  of **49.3494 light years** measured on the screen at the cursor. The radius is the **whole**
  cell, because the corner the blur has to round is one whole cell tall and one whole cell
  wide.

The radius follows the staircase it has to round. At 1,080 CSS rows it is 8 CSS pixels at a
zoom of 5,770 light years and below, where the cap holds it, 5.77 at 8,000, 4.62 at 10,000
and 3.85 at 12,000, so the blur runs below a zoom of about **15,390** light years. At 720
CSS rows the cell covers two thirds as many CSS pixels: 5.13 at 6,000, 3.85 at 8,000 and
3.08 at 10,000, and the blur runs below about **10,260**.

**The blur SHALL cover every zoom at which the cell is large enough to read as a staircase,
at both heights.** This is what sets the radius at the whole cell and not a part of it. The zoom fade leaves 0.10 of the
opacity at 6,000 light years, 0.65 at 8,000 and 1.00 at 10,000, so what a user sees of the
overlay runs from about 6,000 upward. A radius of 0.7 of the cell would stop the blur at
7,180 light years at 720 rows, where the fade still holds the line at 0.40 and under, and a
user on a 720 row buffer would never see a rounded corner. The whole cell carries the blur to
10,260 there, which is past the zoom the fade reaches 1.00 at. Above that height the cell is
under 3 CSS pixels, which is half the band's own width, and the staircase is then smaller
than the softness of the edge it sits on.

`simplified` never blurs, because the smoothed set has no staircase. The blur exists for
`accurate` alone, which is the mode the fault was reported against.

The cap of 8 CSS pixels holds the radius at a zoom of 5,770 light years and below at 1,080
rows, where the fade leaves 0.06 of the opacity and less. At 720 rows the cap is reached at
3,846 light years, which is below the band, so it never acts there.

**The blurred coverage SHALL be normalised, and the band SHALL widen with the radius.**

The coverage across a straight line is a triangular ridge, not an unbounded ramp. A blur
lowers its peak and widens it. The pass SHALL therefore divide the blurred coverage by the
kernel's own response at the ridge, so the band's peak alpha is the stated opacity at every
radius. Without it the band at a zoom of 5,000 light years in `accurate` would draw at about
half the opacity of the same band at 12,000.

The coverage is point-sampled on the device pixel grid, so what a straight run gives depends
on where the middle of the line falls between two pixels. The **normalisation** and the
**half-maximum width** are readings of the continuous kernel in CSS pixels and do not follow
the device pixel ratio. The **sampled peak** does: the figures below are at a ratio of 1,
which is the worst case, and a higher ratio samples the same ridge more finely and draws the
spread in toward 1.00. The readings are:

| radius, CSS pixels | normalisation | sampled peak | half-maximum width, CSS pixels |
| ------------------ | ------------- | ------------ | ------------------------------ |
| no blur            | 1.000         | 0.83 to 1.00 | 3.00 to 3.50                   |
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

The blur threshold of 3 CSS pixels is what keeps the table true. Below it the kernel's
standard deviation is under one device pixel and the sampling dominates: at a radius of 1.5
the same readings spread from 0.80 to 0.93, and the pass would be blurring by less than it
was aliasing.

The normalisation does not change the width. The band's half-maximum width SHALL follow the
radius, by the table above: 3.0 to 3.5 CSS pixels unblurred, 4.68 to 4.88 at a radius of
4.62, and 6.90 to 7.05 where the cap holds the radius at 8, which is the close end of the
zoom band at 1,080 rows. At 720 rows the close end gives a radius of 6.15 and a width of
about 5.6. That is wanted: the staircase is worst where the camera is nearest, and a
wider, softer band there is the game's own line.

What the blur changes besides the width is every corner: a 90 degree corner of the traced
set is a convex turn, and a blur rounds it. That is the purpose.

**The overlay draws in a band of zoom distance and nowhere else.** The fade SHALL be:

- nothing at **5,000** light years and below,
- rising on a smooth step to full at **10,000**,
- full from 10,000 to **20,000**,
- falling on a smooth step to nothing at **30,000** and above.

**REMOVED from this requirement**: the per-pixel fade over the camera's distance to the
line, from 200 to 1,500 light years, and the second channel of the coverage buffer that
carried it. The zoom band takes the overlay away below 5,000 light years, which is well
above every distance that fade acted at, so it has nothing left to do. The coverage buffer
returns to one channel.

**What the close zoom shows instead.** Below 5,000 light years the map draws no boundary
and places no region name. The user reads the region from the HUD's top bar, which names
the region under the cursor at every zoom. The requirement "The handle reports the region at
a plane point" states that, and the handle carries it as `regionNameAt`, with
`regionNameAtScreen` beside it. A drawn line at
that zoom carries no information the top bar does not, and the `accurate` staircase there
is about 4,600 CSS pixels a step.

This **replaces** the near fade that `library-datasets-and-publishing` added, and it keeps
that change's finding: the traced staircase is worst at the close zoom, so the close zoom
is where the overlay must not draw. It goes further, because the staircase is still 9 CSS
pixels a step at a zoom of 5,000 and the near fade left it there.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice. The rule SHALL hold for the traced set as well, whose joins are 90
degree corners and are the hardest case the pass draws.

**The chosen views are constants and they move again.** `tests/region-views.ts` searches
the boundary set for the views the scenarios below open, and `e2e/region-views.ts` holds what
it found. The four views it holds sit at zooms of 1,875, 1,600, 1,600 and 3,000 light years,
all below the band, and each SHALL be searched again at **10,000 light years or more**.

**The width search SHALL change its premises, because the old ones cannot hold at that
zoom.** `findVerticalCrossing` today derives the zoom from the run it found, so that the
chain leaves the frame at the top and at the bottom. The frame at 10,000 light years is
11,547 light years tall, and the longest straight run is 3,800 light years in the smoothed
set and 3,306 in the traced one, so that premise puts a ceiling of about 2,300 light years on
the search. The search SHALL therefore:

- take the zoom as **given** and not derive it from the run;
- hold the run over the **reading row** with at least **100 CSS pixels** of it above and
  below, in place of crossing the whole frame. At 10,000 light years and 1,080 rows one CSS
  pixel is 10.69 light years, so the run needs 2,138 light years. 282 runs of the smoothed
  set and 2 of the traced set hold it;
- drop the premise that the view sits within 16,000 light years of the galactic centre. That
  premise was there so the disc under the line could be brighter than the **dark outline**,
  and this change removes the outline. The band is one warm tone and it lightens whatever it
  crosses. In its place the reading point SHALL sit at least **5,000 light years** from the
  galactic centre, which keeps the reading off the bright core, where the band no longer
  lightens. Every run that holds the clearance below already sits further out than that; the
  nearest is at 15,633 light years;
- keep the clearance at **60 CSS pixels**, which is what the search holds today. 24 runs of
  the smoothed set and 2 of the traced set hold it at this zoom. The best of the smoothed set
  clears 1,861 light years, which is 174.0 CSS pixels, and the best of the traced set clears
  1,653, which is 154.6. The band is 6 CSS pixels wide and the blur reaches about 8 from its
  middle, so 60 isolates the reading with room to spare, and no reading asks for less.

The search SHALL run **once for each set**, and `e2e/region-views.ts` SHALL hold one crossing
view for each. A near-vertical straight run of the smoothed set is not a near-vertical
straight run of the traced staircase, so one view cannot serve both modes.

**The other three searches SHALL state their reading windows in CSS pixels, not in light
years.** They hold constants measured at a zoom of 1,600 light years, where one CSS pixel
covers 2.57 light years. At the new zooms one CSS pixel covers 10.7 to 19.3 light years, so
the same numbers fall inside the window each scenario reads and the searches return views the
readings cannot use. Each SHALL take the zoom and the viewport its scenario names, and SHALL
hold:

- the **join** search: a clearance of 20 CSS pixels, a fold reach of 12 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, and a comparison run between 16 and 40 CSS pixels
  from the bend and at least 8 CSS pixels long. The straight run must sit outside the reading
  window, which reaches 12 CSS pixels. At the scenario's own 1920x1080 and 12,000 light years
  one CSS pixel is 12.83 light years, so the old window of 40 to 200 light years is 3.1 to
  15.6 CSS pixels: it starts inside the reading window and leaves only 3.6 CSS pixels of
  usable run. At that viewport and zoom 6,713 bends of the smoothed set hold every premise;
- the **traced corner** search: arms of **48 CSS pixels**, a clearance of 20 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, a fold reach of 12 CSS pixels, and a comparison run
  between 12 and 40 CSS pixels from the node, against a read radius of 6. The polyline the
  reading classifies a pixel against SHALL reach the read radius, 6 CSS pixels along each arm,
  and not the 12 light years it reaches today, which is 1.1 CSS pixels at this zoom. The arms SHALL be
  longer than the far end of the run, or the comparison reads past the next node and off the
  drawn line; 48 leaves 8 CSS pixels of arm beyond the run. At 1920x1080 and 10,000 light
  years one CSS pixel is 10.69 light years, so the arms are 513 light years, the clearance is
  214 and the run window is 128 to 428, which is 28 CSS pixels of run. **10** nodes hold every
  premise, and the first of them clears 3,306 light years, or 309.3 CSS pixels, with arms of
  3,306 and 543;
- the **both sets** search: a clearance of 20 CSS pixels, which is 385 light years at
  1280x720 and 12,000 light years, against the 200 it holds today. **4,613** points hold every
  premise, and the one the search keeps, which is the one on the longest traced segment,
  clears 3,578 light years, or 186.0 CSS pixels. The search walks the segments in order and
  keeps only a longer one than it holds, so it improves its best four times over those 4,613.

**All three searches SHALL take the same radius floor the width search takes.**
`findVerticalCrossing`, `findTracedCorner` and `findPointNearBothSets` each hold
`radius > 16000` today, each for the same stated reason: the disc under the line had to be
brighter than the **dark outline**. This change removes the outline, so all three SHALL drop
the ceiling and SHALL hold a floor of **5,000 light years** from the galactic centre in its
place, which keeps every reading off the bright core, where the one warm tone no longer
lightens. The counts above are measured with the floor in place. The premise is not a detail
of one search: with the ceiling kept, the traced corner search holds 1 node and the both sets
search holds 474 points, so a reader cannot check any of these numbers without knowing which
rule applies. The join search holds no radius premise today and SHALL take none.

**The three searches SHALL hold their windows per search and not in one module constant.**
`NEIGHBOUR_ARC_LY` and the fold reach are shared between the join search and the traced corner
search today. The two scenarios read at different zooms, 12,000 light years and 10,000, so one
light year figure cannot serve both once the windows are stated in CSS pixels. Each search
SHALL derive its own windows from the zoom and the viewport it is given.

**The cost.** With the overlay on at 1920x1080 in `accurate` at a zoom of **5,200 light
years**, just inside the band, where the cap holds the blur radius at its largest of 8 CSS
pixels and the kernel at its widest of 17 taps, the draw time
SHALL be at most
**1 ms** more than the same view drawn with the overlay off, read with `measureFrames`.
The overlay SHALL stay inside the frame budget `real-systems` states, which the browser
suite already measures at a 20,000 light year view with a full set.

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
  at 10,000 light years and again at 4,000, at 1280x720, with the overlay on and again with
  it off, in each of `simplified` and `accurate`
- **THEN** at 10,000 light years the frame with the overlay differs from the frame without
  it in both modes; at 4,000 the two frames are byte-identical and the page holds no region
  label.

  10,000 light years is now the closest zoom at which the line draws in full. The centre has
  to be on both sets and not only on the traced one, because the smoothed line may sit
  49.3 light years from the traced one. The two lines coincide over most of their length, so
  such a point exists: the search gives a point on a traced segment within half a light year
  of the smoothed set

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 15,000 light years centred on a plane point
  that a unit test has found within 25 light years of a boundary chain, and reads the
  luminance at the projection of that point and at the projection of a plane point
  1,000 light years away from any chain
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  switched off the two readings differ by less than a fifth of the difference with it on

#### Scenario: The overlay fades out across the close end of the band

- **WHEN** the browser test opens the view a unit test has found **on** a chain of both
  sets, the same view the scenario "The boundary draws in full at the close end of the band"
  opens, at 12,000 light years, at 7,500 and at 5,000, with the overlay on and again with it
  off, in each of `simplified` and `accurate`, and reads the overlay's own contribution as
  the **largest** difference within 8 CSS pixels of the projection of the centre, the frame
  with the overlay less the frame without it
- **THEN** in both modes the contribution at 7,500 is between a fifth and four fifths of
  the contribution at 12,000, and the contribution at 5,000 is zero.

  7,500 light years is the middle of the smooth step, where the fade reads 0.5. The bounds
  are wide because the reading is a pixel of the frame and not the fade itself. The view is
  named and not taken from the scenario before it, because the 8 CSS pixel window has to hold
  one chain and no other: the search that finds this view keeps every other chain clear of
  it, and the 25 light year search the medium zoom scenario uses does not

#### Scenario: The line is one tone and lightens what it crosses

- **WHEN** the browser test opens the crossing view of the drawn set at **1920x1080** at a
  zoom of **10,000 light years**, reads one row of pixels across the chain, converts the run
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
  a radius of 4.62 CSS pixels here, which is the cell at this zoom and this height. The peak
  clause is what checks the normalisation: without it the blurred band would read at about
  three fifths of the unblurred band's alpha

#### Scenario: The blur keeps a straight run and rounds a corner

- **WHEN** a unit test builds the coverage field of a straight line and of a line that turns
  by 90 degrees, both by the pass's own ramp rule point-sampled on a device pixel grid at a
  ratio of 1, applies the pass's own blur kernel and its normalisation at radii of 3.00, 3.85,
  4.62, 5.77 and 8.00 CSS pixels, which are the table's own rows, and reads the peak and the
  half-maximum contour of each over **twelve sub-pixel phases** of the line
- **THEN** every reading falls inside the table this requirement states, within the
  tolerances it gives; the normalised peak is at most 1 and at least 0.91 at every radius
  and phase; and the blurred corner's contour departs from a **sharp corner of the same
  width** by at least 0.2 and at most 1.0 of the radius at the turn, and by less than 0.1 of
  it along each arm.

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

- **WHEN** the browser test opens a view at **1920x1080** at a zoom of **12,000 light
  years**, a unit test having chosen the place so that the drawn line **turns by at least 30
  degrees within a reach of 8 CSS pixels**, and reads the luminance of every pixel the overlay
  changes within 8 CSS pixels of that place
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
  at a lattice node where the traced line turns by 90 degrees, at **1920x1080** at a zoom of
  **10,000 light years**, and reads the overlay's own contribution at every pixel within
  **6 CSS pixels** of the node
- **THEN** no pixel at the corner has a contribution more than **3 per cent** above the
  largest contribution on a straight run of the same chain in the same frame, and no pixel
  inside the corner is unchanged.

  The tolerance is the sampling of the ridge and not the clamp, which the requirement above
  states: the corner reads up to 1.010 of a straight run at this radius.

  **This is the scenario that reads the clamp.** The viewport and the zoom are what put the
  blur under it: at 1,080 rows and 10,000 light years the radius is 4.62 CSS pixels, the blur
  runs, and the fade is full. At 1280x720 and 12,000 light years the radius is 2.56, the blur
  does not run, and the `MAX` blend holds the rule by itself, so the scenario would pass
  without checking anything the change added.

  The read radius of 6 CSS pixels reads this node alone. The search asks each arm to be at
  least 48 CSS pixels, so the nodes each side sit well outside the reading. The straight run
  the reading is compared with SHALL be a part of the same chain that holds its direction over
  at least 20 CSS pixels, which an arm of 48 CSS pixels does.

  The reading radius is a property of the view and not of the module. `readJoin` in
  `e2e/regions.spec.ts` SHALL take it from the view the unit test wrote, so the join scenario
  keeps its 8 CSS pixels and this one takes 6, and the window each reading excludes follows
  its own radius

#### Scenario: The overlay costs under a millisecond

- **WHEN** the browser test opens a view at 1920x1080 in `accurate` at a zoom of 5,200
  light years and reads `measureFrames` with the overlay off and with it on
- **THEN** the two readings differ by 1 ms or less

## MODIFIED Requirements

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
pixels. The bound is read on a settled anchor because the filter above adds up to 20 CSS
pixels of its own while a label is still going to a target that moved.

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

**The share SHALL grow with the screen gap between the two targets.** For a gap of `gap`
CSS pixels the share SHALL be `0.15 + 0.85 * min(1, gap / 120) ** 3`. At the gap the
sample grid gives a still region the share is near 0.15, and the smoothed target holds
about seven frames of the target. At **120 CSS pixels** the share is 1 and the frame's own
target is taken whole: above that figure the target has really moved, and the label must
go there at once.

The share SHALL follow the **cube** of the reach, and not the reach itself. A share that
follows the reach gives too much of a gap of 30 or 60 pixels to the label at once, and the
worst frame of a drag grows from 5.8 CSS pixels to 10.9. The cube holds the smoothing over
the whole range a drag works in, and opens it only near the figure where the target has
really moved.

The share SHALL grow and SHALL NOT step at one figure. A step is a gate. A gate that fires
puts the label somewhere else in one frame, which is the jump this filter is there to
stop.

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
projection of the smoothed target, the step SHALL be:

```
min(20, max(min(gap, 0.4), gap * 0.5 * min(1, gap / 48)))
```

That is: **half the gap** at or above a gap of **48 CSS pixels**, falling with the gap
below that, never more than a **20 CSS pixel** cap and never less than a **0.4 CSS pixel**
floor.

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
target whole, and moving half of the gap under a 20 pixel cap, changes the step by 1.0 CSS
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
frame 13, which is 217 milliseconds, and within 2 at frame 26. In the browser the push
leaves the label 70 CSS pixels out and reads **382 milliseconds** to 8 CSS pixels, against
the 400 the browser suite allows. The browser is slower than the unit test because the
camera jump there moves the target as well as the anchor, and the two filters run in
series. The label goes where it belongs and does not crawl.

The filter replaces a hold that kept the anchor where it was for as long as the point still
resolved to the region and still projected inside the frame. What the hold did, and should
not have, was keep a label at the frame edge it had been pushed to long after the region was
back in full view.

**The carried anchor SHALL NOT be dropped for leaving its own region.** The target is
always on its region, so an anchor that walks toward it comes back to the region on its
own. A gate does the opposite of what it is for: it drops the carried point in one frame,
and the label then goes to the target in one step, which is what a person sees as a jump.

**The carried anchor SHALL be dropped only when it goes out of reach of the frame.** The
reach is the frame grown by **a quarter of the frame** on each side. A wheel notch changes
the camera distance by 15 percent in a single frame, which throws the anchor of a label
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
pixels** and the mean is **0.13**. Over 28 wheel notches, each a change of distance of 15
percent in one frame, the worst is **7.0** and the mean **0.49**. Over a wheel held down,
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

**Labels SHALL take the same band of zoom distance as the boundaries**: none at 30,000
light years and above, full from 20,000 down to 10,000, falling on a smooth step to none at
**5,000** and below. A label SHALL carry the fade as the opacity of its element, so a name
and the boundary beside it always read at the same strength.

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
  15** and within 2 by frame 30, and it moves by no more than 20 CSS pixels in any one frame

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

- **WHEN** the camera jumps and the label of a region starts about 70 CSS pixels from the
  middle of its region
- **THEN** the label comes within 8 CSS pixels of the middle inside **400 milliseconds**,
  and no frame moves it more than 20 CSS pixels

#### Scenario: The share of the gap follows the gap

- **WHEN** a unit test reads the share for a gap of 4, 30, 90 and 120 CSS pixels
- **THEN** the share at 4 pixels is 0.15 to three places, the share at 30 pixels is under
  0.17, the share at 90 pixels is over 0.4, and the share at 120 pixels is 1

#### Scenario: The label walks smoothly while the camera drags

- **WHEN** a unit test runs the placement over 90 frames of a drag of 30 light years a
  frame across the galactic centre, and over 90 frames of a drag of 200 light years a frame
  at a camera distance of 20000, and reads for every label the length of the change of its
  screen step from one frame to the next, with both ends of each step projected through the
  frame they are read in, leaving out the frames in which a label leaves its region or the
  frame
- **THEN** the step changes by less than **0.2 CSS pixels** in a middle reading and by less
  than **0.7** in the worst tenth, over more than 200 readings of each drag, and no reading
  is over the 20 pixel cap. Taking each frame's target whole under a flat half-gap step
  gives 1.0 and 3.0 on the slower drag

#### Scenario: The filter does not hop between samples

- **WHEN** a unit test runs the placement over 120 frames of a slow pan across a region
  whose two nearest samples to the mean are within 1 light year of each other
- **THEN** the target of a frame moves by less than 1 CSS pixel, because the centre rule
  reads no sample while the centre of the region has room; no frame moves the anchor by
  more than the 20 CSS pixel cap; and the anchor's plane point changes by less than one
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

### Requirement: The region overlay has three modes

The map SHALL expose a region mode with exactly three values: `off`, `simplified` and
`accurate`. `simplified` SHALL be the default.

- `off` SHALL draw no boundary line and place no label.
- `simplified` SHALL draw the smoothed boundary set, which is the set the map draws today.
- `accurate` SHALL draw the traced boundary set, which the requirement below defines. It
  SHALL place the same labels `simplified` places, and its line SHALL take the wider blur
  radius the requirement "The boundaries draw as one soft band inside a zoom band"
  states.

`GalaxyMapOptions` SHALL carry an optional `regionMode`. The handle SHALL carry
`getRegionMode()` and `setRegionMode(mode)`. `setRegionMode` SHALL take effect in the next
frame and SHALL NOT rebuild the scene data, because the worker builds both sets in one
pass and the renderer holds both.

A value that is not one of the three SHALL leave the mode unchanged, and `setRegionMode`
SHALL report nothing: the reader of a whole data set reports its rejects, while a mode is
one value the host controls directly.

The `regions` pass switch SHALL stay as it is, a renderer probe the browser tests read. A
switch of `off` and a mode of `off` SHALL draw the same frame, so the two never disagree.

**Where the two sets differ, now that the overlay stops at 5,000 light years.** The two
sets differ in where the line sits, not in what the data says. The smoothed line may sit up
to 49.3494 light years from the boundary the region data holds. **At 1,080 CSS rows** and a
60 degree vertical field of view, one CSS row covers `1.1547 * distance / 1080` light
years, so the departure in CSS pixels is about `46,157 / distance`: 9.2 pixels at a zoom of
5,000 light years, 4.6 at 10,000, 2.3 at 20,000 and 1.5 at 30,000.

The overlay draws between 5,000 and 30,000 light years, so the departure runs from about
9.2 CSS pixels at the near end of that band down to about 1.5 at the far end. `accurate` is
therefore worth choosing at the **near end**, from 5,000 to about 12,000 light years, where
the departure is 9.2 down to 3.8 CSS pixels at 1,080 rows, and 6.2 down to 2.6 at 720 rows,
and the user sees which line they are given.
Above about 25,000 the two sets draw within 2 CSS pixels of each other and the mode changes
almost nothing on the screen.

**What the blur costs the mode.** The blur radius in `accurate` is the cell on the screen,
capped at 8 CSS pixels, which at 1,080 CSS rows is 8 at a zoom of 5,770 and below and 4.62 at
10,000, and the pass skips the blur above about 15,390 where the radius falls under 3. That is of
the same order as the departure itself, so the blur rounds the staircase into a smooth line
without moving it: a symmetric kernel leaves the middle of a straight run where it was, and
the departure figures above still hold. What the mode buys at the near end is the line's
**position**, and the blur takes only its corners.

This paragraph said before that the close zoom is what makes the difference matter, because
the departure reaches about 4,600 CSS pixels at a zoom of 10 and 1,080 rows. The overlay no
longer draws there at all. What the mode now answers is which side of a boundary a
**region** lies on at the zoom a user reads the galaxy at, and not which side one system
lies on at the zoom a user reads one system at. The requirement "The boundaries draw as one soft
band inside a zoom band" records that trade and why it was taken.

#### Scenario: The default mode is simplified

- **WHEN** the browser test creates a map with no `regionMode` in the options and reads
  `getRegionMode()`
- **THEN** it is `simplified`

#### Scenario: The options choose the mode

- **WHEN** the browser test builds a map through the library entry point with
  `regionMode` of `accurate`, of `off`, of the string `precise`, with an empty options
  object and with no options at all, and reads `getRegionMode()` on each
- **THEN** the readings are `accurate`, `off`, `simplified`, `simplified` and
  `simplified`, so a value the map does not know takes the default as a bad value on
  `setRegionMode` leaves the mode

#### Scenario: Each mode draws its own frame

- **WHEN** the browser test opens a view a unit test has chosen at a 90 degree corner of
  the traced set, at **1280x720** at a zoom of **12,000 light years**, and takes a digest of
  the canvas in each of the three modes
- **THEN** the three digests differ from one another.

  The view has to sit at a corner. The two sets carry the same line along a straight run of
  the boundary, so a view chosen anywhere else can draw the same frame in `simplified` and in
  `accurate`, and the reading would then say nothing about the mode. 12,000 light years is
  inside the band where the overlay draws in full. The scenario states the viewport because
  the departure of the two sets follows it: at 1280x720 the two lines sit about **2.56** CSS
  pixels apart there against a band 6 CSS pixels wide, which is under half a band and still
  moves enough pixels to change a digest

#### Scenario: The off mode removes both parts

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, sets the mode to `off`
  and reads the page and the frame
- **THEN** the page holds no region label, and the frame is byte-identical to the frame
  the same view draws with the `regions` pass switch off

#### Scenario: The mode changes without a rebuild

- **WHEN** the browser test opens a view, sets the mode to `accurate`, draws one frame,
  sets it back to `simplified` and draws one more, and reads how many times the scene data
  loaded
- **THEN** the frames differ, the scene data loaded once, and neither change waited for a
  load

#### Scenario: The labels do not follow the mode

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` in `simplified` and in
  `accurate`, and reads the text of every label
- **THEN** the two label sets hold the same names in the same order

#### Scenario: A bad mode changes nothing

- **WHEN** the browser test sets the mode to `accurate`, then calls `setRegionMode` with
  the string `precise` and with `undefined`, and reads the mode
- **THEN** it is still `accurate`
