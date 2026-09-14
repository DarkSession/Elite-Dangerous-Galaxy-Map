## MODIFIED Requirements

### Requirement: The boundaries draw on the galactic plane in a zoom band

The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

Which set draws SHALL follow the region mode: the smoothed set in `simplified`, the traced
set in `accurate`, and neither in `off`. Both sets draw through the same pass, with the
same width, the same two tones and the same join rule, so the mode changes where the line
sits and nothing else about it.

A line SHALL be drawn in the width the screen sees, not in the width the card's default
line gives: a core of 2 CSS pixels, with an outline of 1 CSS pixel on each side, so the
whole line is 4 CSS pixels whatever the device pixel ratio is. The core SHALL be the
lighter colour and the outline SHALL be the darker one.

**The two tones are washed out.** The core SHALL be `(0.505, 0.658, 0.853)` and the
outline `(0.125, 0.172, 0.267)`, and the opacity SHALL be **0.42**. Each tone is a third
of the way from where it was toward the average of the two, and the opacity fell from
0.55. The overlay's own contrast, the core's luminance less the outline's, times the
opacity, therefore falls from 0.389 to 0.198, which is 51 percent of what it was. The
wash is what makes the `accurate` staircase read as a soft edge rather than a row of
steps; the line keeps its hue and still reads as a boundary.

The consequence to know: the outline no longer darkens every background. Its luminance
rose from 0.051 to 0.169, so over the dark space between the arms, where the frame reads
below about 0.17, the outline now lightens the pixel rather than darkening it. It still
darkens the bright disc, and it is still darker than the core everywhere, which is what
makes the line read as a line.

The fade adds one channel to the coverage buffer and one interpolation to each fragment.
The overlay SHALL stay inside the frame budget `real-systems` states, which the browser
suite already measures at a 20,000 light year view with a full set.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice. The rule SHALL hold for the traced set as well, whose joins are 90
degree corners and are the hardest case the pass draws.

The lines SHALL fade in as the zoom distance falls: nothing at 30,000 light years and
above, full at 20,000 and below.

**A line fades out as the camera comes near it.** The fade SHALL be worked out for each
pixel of the line, from the distance between the camera and the nearest point of the
segment that pixel draws, in light years: nothing at **200** light years and below, full
at **1,500** and above, on a smooth step between. The fade multiplies the zoom fade.

The fade is per pixel and not per chain, so one line that runs from under the camera out
to the horizon fades along its length rather than all at once. This is what the camera
approaching a boundary shows: the line goes before the camera reaches it.

This **reverses** the decision phase 3.1 recorded. That phase held the line to the closest
zoom, so a user at 10 light years could see which side of a boundary a system sat on.

What the fade takes away is the line **near the camera**, and not the whole overlay at a
close zoom. A line far across the frame still draws, which is what the per-pixel rule is
for. The zoom at which the whole frame goes empty is the zoom at which every plane point in
it is inside 200 light years. At the default pitch of 35 degrees and a 60 degree vertical
field of view, the top of the frame looks 5 degrees below the horizon, so it shows plane
points about 11.4 times the camera's height above the plane: about 65 light years at a zoom
of 10, about 990 at a zoom of 150, and about 3,300 at a zoom of 500. The overlay is
therefore empty at a zoom of 10, and at a zoom of 500 it is faint under the cursor and full
at the top of the frame.

What is bought for it is that the `accurate` staircase, whose 49.3494 light year step is
about 4,600 CSS pixels at a zoom of 10 and 1,080 rows, is never on the screen at the zoom
where it is worst. The browser suite runs at 1280x720, where the same figures are two thirds
of these.

**The chosen views are constants and they move.** `tests/region-views.ts` searches the
boundary set for the views the scenarios above open, and `e2e/region-views.ts` holds what it
found. Two of them sit at a zoom of 500 light years, where the near fade now draws nothing,
so they SHALL be searched again at a zoom where the camera is 1,500 light years or more
from the place the scenario reads. The crossing view sits at 1,875 and is already above
that.

The region labels SHALL NOT take this fade. A label is placed at a point inside its own
region, and the camera is always near the region it is looking into, so a near fade on the
labels would empty the overlay of names at every close zoom. Labels keep the zoom fade
alone, which the requirement "A region in view carries a label" states.

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region
  overlay on, and again with it switched off
- **THEN** the two image files are byte-identical

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 10,000 light years centred on a plane point
  that a unit test has found within 25 light years of a boundary chain, and reads the
  luminance at the projection of that point and at the projection of a plane point
  1,000 light years away from any chain
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  switched off the two readings differ by less than a fifth of the difference with it on

#### Scenario: The boundary still draws at the closest zoom

- **WHEN** the browser test opens at 4,000 light years and at 1,500, with the overlay on
  and again with it off, in each of `simplified` and `accurate`, centred on a plane point a
  unit test has found **on** a chain of **both** sets
- **THEN** at both distances and in both modes the frame with the overlay differs from the
  frame without it.

  1,500 light years is now the closest zoom at which the line draws in full. The centre has
  to be on both sets and not only on the traced one, because the smoothed line may sit
  49.3 light years from the traced one. The two lines coincide over most of their length, so
  such a point exists: the search gives a point on a traced segment within half a light year
  of the smoothed set

#### Scenario: The boundary fades out as the camera comes near

- **WHEN** the browser test opens the view of the scenario above at 1,500 light years, at
  500 and at 150, with the overlay on and again with it off, in each of `simplified` and
  `accurate`, and reads the overlay's own contribution as the **largest** difference within
  8 CSS pixels of the projection of the centre, the frame with the overlay less the frame
  without it
- **THEN** in both modes the contribution at 500 is below a third of the contribution at
  1,500 and above zero, and at 150 it is zero.

  The centre sits **on** a chain of both sets, which is what the scenario above states and
  what the search gives. A centre merely within 25 light years of one would be 47 CSS pixels
  from the line at a zoom of 500 against a line 4 pixels wide, and a reading beside the line
  would report zero for the wrong reason. The reading
  is a search within 8 CSS pixels of the projection, which covers the line's own width and
  the rounding, as the existing suite already searches near a point.

  The reading is near the cursor, which is the point the camera is 150 or 500 light years
  from. The frames are not byte-identical at 150: the top of the frame shows plane points
  about 990 light years away, and the line still draws there. Only a view straight down
  empties the whole frame

#### Scenario: One line fades along its own length

- **WHEN** the browser test opens a view at 3,000 light years and a pitch of 5 degrees, a
  unit test having chosen the cursor and the yaw so that one chain runs from the lower edge
  of the frame to the cursor, and reads the overlay's own contribution at the pixel where
  the chain crosses the lower tenth of the frame and at the pixel of the cursor
- **THEN** the contribution at the lower edge is below a third of the contribution at the
  cursor, and both are on the same chain

#### Scenario: The line is four CSS pixels wide and two-toned

- **WHEN** the browser test opens a view in which the camera is **1,500 light years or
  more** from the place it reads, so the near fade is full there, a unit test having chosen
  the view so that a boundary chain
  crosses the frame within 5 degrees of vertical, reads one horizontal row of pixels
  across it, converts the run from device pixels to CSS pixels by the device pixel ratio,
  and compares it with the same row with the overlay off, in each of `simplified` and
  `accurate`
- **THEN** in both modes the run of changed pixels is 4 CSS pixels wide within 1 CSS pixel,
  the middle of the run is lighter than both ends, and every pixel of the run differs from
  the same pixel with the overlay off.

  The ends are no longer held to be darker than the frame under them. The washed outline
  reads at a luminance of 0.169, so over the dark space between the arms it lightens the
  pixel. What holds everywhere is that the middle is lighter than the ends

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view in which the camera is **1,500 light years or
  more** from the bend, so the near fade is full there, a unit test having chosen the place
  so that the drawn line **turns by at least 30 degrees within a reach of 8 CSS pixels**,
  and reads the luminance of every pixel the overlay changes within 8 CSS pixels of that
  place
- **THEN** taking each pixel's change as the frame with the overlay less the frame
  without it, no pixel at the bend has a larger change than the largest change on a
  straight run of the same chain in the same frame, and no pixel inside the bend is
  unchanged.

  The bend is measured over a reach and not between two neighbouring segments, because
  the requirement above holds every single vertex of the smoothed set to 20 degrees, so no
  two neighbouring segments of it can meet under 160 degrees. That does not make the join
  weaker as a test: it makes it stronger. The median segment of the drawn set is 5.09 light
  years, which is 2.0 CSS pixels at a zoom of 1,600 light years and 1280x720, against a
  line 4 CSS pixels wide, so the ribbon quads of a bend overlap more than they did when a
  bend was one sharp corner. The view is at 1,600 and not at the 500 it was, because the
  near fade draws nothing at 500. The comparison is of the overlay's own contribution, because the overlay
  draws at less than full opacity and the galaxy under a corner can be brighter than the
  galaxy under a straight run

#### Scenario: A 90 degree corner of the traced set is not brighter than its line

- **WHEN** the browser test sets the mode to `accurate`, opens a view a unit test has
  chosen at a lattice node where the traced line turns by 90 degrees, at a zoom of **1,600
  light years**, where the camera is 1,600 light years from the node so the near fade is
  full there and a 49.3494 light year segment is 19.2 CSS pixels at 1280x720, which is
  longer than the 8 CSS pixel read radius, and reads the overlay's own
  contribution at every pixel within 8 CSS pixels of the node
- **THEN** no pixel at the corner has a larger contribution than the largest contribution
  on a straight run of the same chain in the same frame, and no pixel inside the corner is
  unchanged

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

A label's anchor SHALL be the projection of the mean of the plane positions of the
samples its region holds, when the region under that mean is the same region. When it is not, the anchor
SHALL be the projection of the plane position of **the sample its own region holds whose
plane position is nearest that mean**.
Taking the nearest sample of any region would put the anchor on the region the mean
landed on, which is the region the fallback exists to avoid. A region can appear in the frame as
two separated patches, and the mean of those falls between them, on a different region;
the second rule is what puts the anchor on the region in that case.

The anchor SHALL move in every frame in which the camera moves, and SHALL NOT snap to the
grid of sample points. While a region shows as one connected patch and its anchor has
settled on the target, a camera turn of 0.1
degrees between two frames SHALL move its anchor, and SHALL move it by less than 8 CSS
pixels. The bound is read on a settled anchor because the glide above adds up to 4 CSS
pixels of its own while a label is still travelling.

Both halves are needed. A rule that snaps to the nearest sample moves the anchor a whole
sample spacing at once, 32 CSS pixels, which the upper bound catches. A rule that
averages sample positions in screen space passes that upper bound easily, at a worst move
of 1.0 CSS pixels, and still reads as jumping, because the anchor is unmoved in 58
percent of frames and carries the whole motion in the rest. Only the lower bound catches
that one.

**A held anchor glides back toward its region's mean.** A region that carried a label in
the frame before SHALL carry its anchor's plane point into this frame, and that point SHALL
then move toward the frame's own target by **8 percent of the gap between them**, in plane
coordinates. The target is the mean of the region's sample plane positions, or the fallback
above when the region under that mean is another region.

The glide's own contribution to the anchor's motion on the screen SHALL be capped at **4
CSS pixels** in one frame, so a label that has a long way to travel still slides rather
than jumps.

At 60 frames a second the anchor closes half the gap in about 8 frames and 90 percent of it
in about 28, so a label that was pushed to the frame edge comes back to the middle of its
region in under half a second once nothing holds it out there.

The glide replaces a hold that kept the anchor where it was for as long as the point still
resolved to the region and still projected inside the frame. The hold is what stopped the
anchor hopping between two samples almost equally near the mean, and a glide of 8 percent
a frame stops that too, because it is continuous. What the hold also did, and should not
have, was keep a label at the frame edge it had been pushed to long after the region was
back in full view.

A carried point that no longer resolves to its own region SHALL be replaced by the target at
once, so an anchor never sits on another region. A carried point that no longer projects
inside the frame SHALL be replaced by the target at once, as it is today. A region that
carried no label in the frame before SHALL start at the target.

The anchor SHALL then be held inside the viewport with an inset of 48 pixels, which only
moves a label whose box would otherwise cross the frame edge.

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

Labels SHALL follow the same zoom fade in as the boundaries: none at 30,000 light years
and above, full at 20,000 and below. Labels SHALL NOT fade out at close zoom.

#### Scenario: No label at the far view

- **WHEN** the browser test opens the default view
- **THEN** the page holds no region label

#### Scenario: The core is named

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`
- **THEN** a label reading `Galactic Centre` is on the page, its box lies inside the
  viewport, and it is placed even though at least 12 other regions hold more samples

#### Scenario: The region the camera is inside is named at every zoom

- **WHEN** the browser test opens `#c=0,0,0&p=35&y=0` at each of 20,000, 10,000, 4,000,
  1,000 and 500 light years
- **THEN** a label reading `Inner Orion Spur` is on the page at every one of the five
  distances, and its box lies inside the viewport

#### Scenario: A region with nothing on screen carries no label

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, reads every label on the
  page, and works out for itself which regions the frame shows, by resolving the plane
  point under a grid of screen points against the coarse region grid rather than reading
  the counts the label code made
- **THEN** every label on the page names a region the frame shows, and no label names a
  region it does not

#### Scenario: The camera keeps the label of the region it sits in when it turns away

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, where every plane sample
  resolves to the Inner Orion Spur, and then `#c=0,0,0&d=500&p=35&y=180`, where the
  camera looks away from that region's centroid and the samples are about 91 percent
  Inner Orion Spur, about 8 percent Sanguineous Rim and about 1 percent Elysian Shore
- **THEN** the first view holds exactly one label, `Inner Orion Spur`; the second holds
  `Inner Orion Spur` as well, because it holds about 91 percent of the samples of that
  frame; and the second view names no region other than `Inner Orion Spur`,
  `Sanguineous Rim` and `Elysian Shore`. Those three are the regions that clear the 1
  percent rule in that frame: the measured shares are 91.3, 7.5 and 1.2 percent. The
  expected names are written out rather than read back from the counts the label code
  itself made, so the test can fail

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

#### Scenario: A pushed anchor comes back to the centre

- **WHEN** a unit test runs the placement over a pan that carries a region from a corner of
  the frame, where its anchor is held against the 48 pixel inset, to the middle of the
  frame, and then over 60 further frames with the camera still
- **THEN** the anchor moves toward the region's mean in every one of those 60 frames, it is
  within 2 CSS pixels of the projection of that mean by frame 60, and it moves by no more
  than 4 CSS pixels in any one of them

#### Scenario: The glide does not hop between samples

- **WHEN** a unit test runs the placement over 120 frames of a slow pan across a region
  whose two nearest samples to the mean are within 1 light year of each other
- **THEN** no frame moves the anchor by more than 8 CSS pixels, and the anchor's plane
  point changes by less than one sample spacing in any single frame

#### Scenario: Labels neither crowd nor overlap

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` and reads the box of
  every label
- **THEN** there are at most 12 labels and no two boxes overlap

#### Scenario: The sampling stays inside its budget

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080 and reads
  the mean and the worst sampling time the page exposes over 300 frames
- **THEN** the mean is under 2 milliseconds and the worst single frame is under 4



### Requirement: The region overlay has three modes

The map SHALL expose a region mode with exactly three values: `off`, `simplified` and
`accurate`. `simplified` SHALL be the default.

- `off` SHALL draw no boundary line and place no label.
- `simplified` SHALL draw the smoothed boundary set, which is the set the map draws today.
- `accurate` SHALL draw the traced boundary set, which the requirement below defines. It
  SHALL place the same labels `simplified` places.

`GalaxyMapOptions` SHALL carry an optional `regionMode`. The handle SHALL carry
`getRegionMode()` and `setRegionMode(mode)`. `setRegionMode` SHALL take effect in the next
frame and SHALL NOT rebuild the scene data, because the worker builds both sets in one
pass and the renderer holds both.

A value that is not one of the three SHALL leave the mode unchanged, and `setRegionMode`
SHALL report nothing: the reader of a whole data set reports its rejects, while a mode is
one value the host controls directly.

The `regions` pass switch SHALL stay as it is, a renderer probe the browser tests read. A
switch of `off` and a mode of `off` SHALL draw the same frame, so the two never disagree.

**Where the two sets differ, now that the near fade is there.** The two sets differ in
where the line sits, not in what the data says. The smoothed line may sit up to 49.3494
light years from the boundary the region data holds. **At 1,080 CSS rows** and a 60 degree
vertical field of view, one CSS row covers `1.1547 * distance / 1080` light years, so the
departure in CSS pixels is about `46,157 / distance`: 31 pixels at a zoom of 1,500 light
years, 5.8 at 8,000, 1.8 at 25,000 and 1.5 at 30,000. It falls as the camera pulls back,
and it drops under one CSS pixel above a zoom of about 46,000.

The overlay draws between 1,500 and 30,000 light years, so the departure runs from about 31
CSS pixels at the near end of that band down to about 1.5 at the far end. `accurate` is
therefore worth choosing at the **near end** of the band, from 1,500 to about 8,000 light
years, which is its lower fifth by distance, where the departure is 31 down to 5.8 CSS
pixels and the user sees which line
they are given. Above about 25,000 the two sets draw within 2 CSS pixels of each other and
the mode changes almost nothing on the screen.

This paragraph said before that the close zoom is what makes the difference matter, because
the departure reaches about 4,600 CSS pixels at a zoom of 10 and 1,080 rows. The near fade
takes the line
away where the camera is within 200 light years of it, so at a zoom of 10 the whole frame is
inside the fade and that reading is no longer on the screen. What the mode now answers is
which side of a boundary a **region** lies on at the zoom a user reads the galaxy at, and
not which side one system lies on at the zoom a user reads one system at.
The requirement "The boundaries draw on the galactic plane in a zoom band" records that
trade and why it was taken.

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
  the traced set, at a zoom of 2,000 light years, and takes a digest of the canvas in each
  of the three modes
- **THEN** the three digests differ from one another.

  The view has to sit at a corner. The two sets carry the same line along a straight run
  of the boundary, so a view chosen anywhere else can draw the same frame in `simplified`
  and in `accurate`, and the reading would then say nothing about the mode. 2,000 light
  years is above the near fade band, so the line draws in full

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

### Requirement: The region data carries its attribution

The repository SHALL hold a `THIRD_PARTY_NOTICES.md` file that names the source of the
region data and its terms: klightspeed's EliteDangerousRegionMap under MIT for the
region tables, and Frontier Developments' media-usage rules, which are non-commercial,
for the game data behind them. If **either build** carries the package's procedural
naming tables, the file SHALL also hold the BSD 3-Clause text those tables require.

The repository now emits two builds, the library and the demo site, so the search reads
both. The demo site is the one the public loads, and the library is the one another project
installs, so a table that reaches either one reaches a user.

The file SHALL also name the sources the demo site adds: the two further Canonn Research
Group data sets, which `dataset-catalog` lists, and the loading image the demo site serves
from `public/`.

#### Scenario: The notice names every source

- **WHEN** a unit test reads `THIRD_PARTY_NOTICES.md`
- **THEN** it names `EliteDangerousRegionMap`, `MIT`, `Frontier`,
  `@elite-dangerous-almanac/core`, `EDLoader1.svg`, `Guardian Structures` and
  `Notable Systems`

#### Scenario: The bundle carries no unlicensed table

- **WHEN** a test runs `pnpm build` and `pnpm build:demo-site` and searches both outputs
  for the package's procedural naming tables
- **THEN** either the tables are absent from both, or `THIRD_PARTY_NOTICES.md` holds the
  BSD 3-Clause text in full
