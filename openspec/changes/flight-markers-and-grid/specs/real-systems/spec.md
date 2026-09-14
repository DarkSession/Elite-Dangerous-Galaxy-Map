## ADDED Requirements

### Requirement: The demo page loads the Guardian Ruins data set

The demo page SHALL load one data set, which is a conversion of the Guardian Ruins data
of the Canonn Research Group. The library itself SHALL still bundle no data and fetch
none: the page is a host application and adds the records through `addCategories` and
`addSystems`, as any other host does. The production build SHALL drop the set, as it
drops it today, so the browser suite still reads an empty set.

**The source** is `Source/data/MapData-GR.js` of CanonnED3D-Map and the
`guardian_ruins.json` dump that file fetches. A build script SHALL make the committed set
from the dump, so the conversion is repeatable and the rules below are read from the
script and not from a hand edit. The script SHALL fetch the dump into a directory the
repository ignores, because the project does not commit data dumps.

**The counts below describe the committed file** and not the live dump. The dump gains
records over time, so a later run of the script may write another count. The committed file
is what the tests read, and the counts in the tests move with it when someone runs the
script again.

**A fixture holds the conversion rules.** The repository SHALL commit a small extract of
the dump, of about 20 sites over 8 systems, beside the expected output of the script over
that extract. The rule test reads the fixture and not the live dump, so it runs on a clean
checkout with no network. The extract is a fixture and not a data dump, by the size the
project's other fixtures hold.

**The categories** SHALL be `Ruins Alpha`, `Ruins Beta` and `Ruins Gamma`, each with the
colour and the description the project gives it. The source names a fourth category,
`Unknown`, which no record of the dump uses. The conversion SHALL drop a category that
holds no record, so the HUD's category browser shows no empty row.

**A record** SHALL be one system and not one site. The dump holds 600 sites in 212
systems, and a system holds up to three site types. The primary category SHALL be the type
of the system's first site in the dump, and the other types the system holds SHALL be its
secondary categories. 166 of the 212 systems hold more than one type.

**The images.** A record SHALL carry one image for each site type the system holds, in
the same order as its categories. An image's `url` SHALL be the thumbnail of that type at
`https://ruins.canonn.tech/images/maps/<type>-thumbnail.png`, and its `caption` SHALL name
the type. The project therefore redistributes no picture: the browser loads each one from
Canonn, and the library never fetches an image itself. A record carries 1 to 3 images, so
the information panel's two-column thumbnail grid and its lightbox both draw on most
records.

**The description** SHALL name how many sites the system holds and the body each one is
on, from the dump's `Body Name` field.

**The browser suite SHALL reach no network.** No browser test SHALL put a record of this
set on the map, because every record of it names a picture on another host. The build
SHALL keep one picture of the project's own under `public/`, and the browser test that
reads a thumbnail from the built page SHALL use a record of its own that names that
picture. The suite therefore still proves that the built page serves a picture it is given,
and it reaches `ruins.canonn.tech` in no run.

The rule the old browser test held, that a typo in a demo record's picture path ships
unseen, is now held by a unit test instead: the scenario "Every record carries an image for
each type it holds" reads every URL of the committed set.

`THIRD_PARTY_NOTICES.md` SHALL name the source of the records and of the thumbnail URLs,
and SHALL keep the Canonn MIT licence text it holds today.

#### Scenario: The committed set holds the converted records

- **WHEN** a unit test reads `src/app/demo-systems.json`
- **THEN** it holds 3 categories named `Ruins Alpha`, `Ruins Beta` and `Ruins Gamma`, and
  212 systems

#### Scenario: Every record carries an image for each type it holds

- **WHEN** a unit test reads every record of the committed set and compares the number of
  images with the number of categories the record names
- **THEN** the two numbers are equal for every record, every image URL starts with
  `https://ruins.canonn.tech/images/maps/`, and 166 records name more than one category

#### Scenario: The reader accepts the whole set

- **WHEN** a unit test adds the committed categories and then the committed records to a
  real system set
- **THEN** the category report adds 3, the record report adds 212, and it rejects none

#### Scenario: The script holds its conversion rules

- **WHEN** a unit test runs the script's conversion over the committed fixture extract and
  compares the result with the committed expected output
- **THEN** the two are the same, and the test reaches no network

#### Scenario: The committed set is what the conversion gives

- **WHEN** a unit test checks the committed set against the conversion's own rules: every
  record names 1 to 3 categories, its images match its categories one for one and in order,
  no two records share a name, and every position is finite
- **THEN** every check passes, whatever count the file holds

#### Scenario: No browser test loads a remote picture

- **WHEN** a search of `e2e/` looks for `ruins.canonn.tech` and for a read of
  `src/app/demo-systems.json`
- **THEN** it finds neither, and the browser test that reads a thumbnail from the built page
  names a picture the build serves from `public/`

#### Scenario: The production build carries no data set

- **WHEN** the browser test opens the built preview, waits for `ready` and reads
  `systemCount`
- **THEN** the reading is 0


## MODIFIED Requirements

### Requirement: A marker draws for every system at every zoom distance

The renderer SHALL draw one marker per system in the set, in one draw call, at every
zoom distance from 10 to 120,000 light years, for every system the range rule below keeps,
whose primary category is on, and whose name the filter keeps. There SHALL be no level of
detail: the pass draws the whole set in every frame.

A marker's size SHALL follow one rule for both styles, and that rule SHALL read the
camera **range** alone. The **disc diameter** in CSS pixels is a curve of `range`, the
distance from the camera to the system in light years:

| Range                 | Disc diameter in CSS pixels                        |
| --------------------- | -------------------------------------------------- |
| 10 and below          | 16                                                 |
| 10 to 50              | 16 down to 12, even in the logarithm of the range  |
| 50 to 1,000           | 12                                                 |
| 1,000 to 10,000       | 12 down to 7, even in the logarithm of the range   |
| 10,000 and above      | 7                                                  |

The readings the curve gives are therefore 16 at 10, 14.28 at 20, 12 from 50 to 1,000,
10.49 at 2,000, 8.99 at 4,000 and 7 from 10,000 out.

**The size does not read the viewport.** The old rule was `focalCss * 20 / range`, held
between 7 and 12, and `focalCss` is the CSS pixels per light year at one light year of
range, which follows the viewport height. A system 2,000 light years from the camera
therefore drew 9.35 CSS pixels in a 1,080 row canvas and 7 in a 400 row one, and the range
at which the size stopped changing moved with the window: about 1,560 light years at 1,080
rows and about 580 at 400. The curve above gives one size for one range at every
viewport.

**The plateau from 50 to 1,000 light years** is the band the user reads a neighbourhood
in. A marker is a mark on a system and not a picture of a star, so it should not grow as
the camera comes in over that whole band.

**The rise from 50 to 10 light years** is the last two wheel notches, where the camera is
inside one mass-code `a` boxel. A marker that grows there separates the system the user
flew to from the ones behind it.

**The floor of 7** is what makes a marker findable in the far view, where a true
perspective size falls below one pixel. **The cap of 16** stops a near marker from
covering the frame.

The renderer's own `focal` is in device pixels, because it comes from the drawing buffer
height, so `gl_PointSize` is the CSS diameter times the device pixel ratio. A `glow`
marker's sprite SHALL be **2.5 times the disc diameter**, so the two styles grow together
and stop together and one curve sets both. A glow's sprite therefore runs from 17.5 to 40
CSS pixels.

The pass SHALL hold the size it asks for at or below the card's maximum point size, which
`ALIASED_POINT_SIZE_RANGE` reports. A 40 CSS pixel glow at a device pixel ratio of 3 asks
for 120 device pixels, which is the largest sprite the map draws, so a card that reports
less must cap rather than let the driver decide.

A marker SHALL take the colour of its category as the category stands when the frame
draws. A category replaced under the same name SHALL therefore recolour every marker that
names it, and the set SHALL NOT copy the colour into the record.

The core colour SHALL NOT follow the population zone ramp that the decoration stars and
the point cloud use. Two systems of one primary category SHALL draw one colour, wherever
they lie, and two systems of different categories SHALL draw the two colours the
categories give. The category colour is the first of the two things that separate a real
system from an invented star. The second is the close fade of `close-view-stars`, which
holds the invented field at no light below a zoom distance of 640 light years while a
marker draws at every zoom distance.

The page SHALL expose the number of markers the last frame drew, which is the number the
range rule, the category visibility and the name filter kept together, and not the number
the set holds.

#### Scenario: A marker shows at every zoom distance

- **WHEN** the browser test adds one category with `maxDrawRange` 200,000, adds one system
  at (0, 0, 6,000), then opens the view `#c=0,0,6000&d=10&p=35&y=0` and the same cursor at
  500, 4,000, 20,000 and 120,000 light years, and reads the pixel at the projection of the
  system with the pass on and with it off
- **THEN** the two readings differ at every one of the five distances. The category takes a
  range above the default so that the 120,000 light year view reads the zoom limit and not
  the range limit

#### Scenario: The marker colours reach the frame over both grounds

- **WHEN** the browser test adds one category of the colour (153, 230, 255) and the
  `markerStyle` `disc`, then one system at the galactic centre, which is the brightest
  ground, and one 3,000 light years above the plane at the rim, which is the darkest,
  opens a view that shows each at a range above 3,000 light years, and reads the middle
  pixel of each marker and, on the row through its centre, the ring pixel whose own centre
  lies between 1 and 2 CSS pixels inside the edge of the disc, at a device pixel ratio of 1
- **THEN** every middle pixel is (153, 230, 255) within 2 per channel, and every ring
  pixel is (5, 10, 26) within 2 per channel

#### Scenario: The size falls to the floor and rises to the cap

- **WHEN** the browser test adds one category of the `markerStyle` `disc` and the
  `maxDrawRange` 200,000 and one system, opens a view at 120,000 light years and counts
  the pixels of the row through the marker's centre that differ from the frame drawn with
  the pass off, then opens a view that puts the system 500 light years from the camera and
  counts again, then a view that puts it 10 light years from the camera and counts a third
  time
- **THEN** the counts are 7, 12 and 16, each within 1, at a device pixel ratio of 1. The
  tolerance is one pixel, because a disc that does not sit on a pixel centre covers one
  more or one fewer pixel on its row. The category takes a range above the default because
  the system sits at the cursor, so at a zoom of 120,000 light years its camera range is
  120,000 exactly, on the boundary of the default cut

#### Scenario: The size does not follow the viewport height

- **WHEN** the browser test adds one system, opens a view that puts it 4,000 light years
  from the camera at a viewport of 1,080 CSS rows and counts the pixels of the row through
  its centre, then sets the viewport to 400 CSS rows and counts again
- **THEN** the two counts are the same within 1, and each is 9 within 1

#### Scenario: The size curve is continuous

- **WHEN** a unit test reads the size rule at 1,000 ranges spaced evenly in the logarithm
  from 1 to 200,000 light years
- **THEN** no two neighbouring readings differ by more than 0.05 CSS pixels, the reading
  never rises as the range grows, the largest reading is 16 and the smallest is 7

#### Scenario: The page reports the marker count

- **WHEN** the browser test reads the marker count with an empty set, adds 100 systems
  around Sol at a view that shows them all, draws a frame and reads the count again, then
  switches the systems pass off, draws again and reads it a third time
- **THEN** the readings are 0, 100 and 0

#### Scenario: The colour follows the category and not the position

- **WHEN** the browser test adds one category, then one system at Sol and one at the
  galactic centre, whose population zones differ, and reads the middle pixel of each
  marker at the same range; then adds a second category of another colour, replaces the
  record at Sol with one that names it, and reads the two pixels again
- **THEN** the first two pixels hold the same colour, and the second two hold the colour
  of each system's own category

#### Scenario: A recoloured category recolours its markers

- **WHEN** the browser test adds one category of the colour (153, 230, 255) and one
  system, reads the middle pixel of the marker, then adds a category of the same name and
  the colour (255, 40, 40), draws a frame and reads the pixel again
- **THEN** the first reading is (153, 230, 255) and the second is (255, 40, 40), each
  within 2 per channel, and the system count does not change


### Requirement: A marker draws in one of two styles

A category SHALL choose the style its markers draw in, through its `markerStyle` field.
There SHALL be exactly two styles, `glow` and `disc`. A category that names no style
SHALL draw `glow`.

**`glow`** SHALL draw a soft halo with four spikes and no ring. Over the sprite, with `r`
the distance from the centre in CSS pixels and `R` the sprite radius in CSS pixels:

- The colour SHALL be the category colour at every point of the sprite. The shape comes
  from the alpha alone, so a category colour reaches the frame unmixed at the centre.
- The halo term SHALL be `0.85 * (1 - r / R)^3`.
- The core term SHALL be `clamp((2.5 - r) / 1.5, 0, 1)`, which is 1 for `r` at or below
  1.0 CSS pixels and 0 from 2.5 outward. The opaque middle is what lets a test read the
  category colour as it is. The plateau is 1.0 CSS pixel because a sprite centre does not
  sit on a pixel centre: at a device pixel ratio of 1 the nearest pixel centre can lie
  0.71 CSS pixels from it, and the plateau has to cover that.
- Four spikes SHALL add, one along each of the sprite's two axes in each direction. The
  spike along an axis SHALL add
  `0.55 * max(0, 1 - p / 1.0) * max(0, 1 - a / R)^2`, where `a` is the distance from the
  centre along that axis and `p` is the distance from the axis, both in CSS pixels.
- The alpha SHALL be `min(1, spikes + max(core, halo))`.

The core is the larger of two terms and not a separate opaque disc, so the alpha falls
from 1 to the halo without a step. An opaque disc joined to a halo of `0.85 * (1 - r/R)^3`
would drop from 1.00 to 0.65 at the cap size and to 0.54 at the floor size in one device
pixel, which draws a hard-edged 2.5 CSS pixel disc inside the glow. The scenario "The glow
alpha has no step" is what holds this, because a test that only reads the frame outward
cannot tell a step from a steep fall.

The renderer SHALL expose the alpha rule as a function the unit tests read, as it exposes
the star brightness rule of `close-view-stars` today, so the rule is measured at its own
resolution and not at the resolution of a screenshot.

**`disc`** SHALL draw the marker the map draws today: a disc opaque inside its edge, with
the category colour in the core and the fixed ring colour (0.02, 0.04, 0.10) over the
outer 2 CSS pixels, and an antialiasing ramp in the outer 1 device pixel alone. A ring of
a fixed pixel width rather than a fixed fraction of the disc keeps the dark edge readable
at the floor size. The ring is fixed and dark, so the disc holds a readable edge over the
cream core of the galaxy and over dark space alike, whatever colour a category gives its
core.

`glow` is the default because it reads as a star. `disc` reads as a highlight, and a host
uses it for the one category it wants the user to pick out of the rest.

Both styles SHALL draw in the same pass and in the same draw call, so a set that mixes
the two costs no more calls than a set that uses one.

#### Scenario: The default style is the glow

- **WHEN** a unit test adds one category with no `markerStyle` and reads the style the
  table holds
- **THEN** it is `glow`

#### Scenario: The glow holds the category colour at its centre

- **WHEN** the browser test adds one category of the colour (153, 230, 255) with no
  `markerStyle`, adds one system at a view over dark space, and reads the middle pixel of
  the marker at a device pixel ratio of 1
- **THEN** the pixel is (153, 230, 255) within 2 per channel

A reading of the glow SHALL be the luminance the marker pass adds, which is the frame
drawn with the pass on less the frame drawn with it off. The composite writes about 9 of
255 over empty space, so a reading of the frame itself is the alpha of the glow over that
floor and not the alpha. A reading of the difference is the alpha times the colour of the
category, which is what the rule predicts.

A reading SHALL take a pixel by its index and not by the projection of the system. The
sprite centre has to sit on a pixel centre, or every sample lies half a pixel off the
spike it reads, so the browser tests of the glow take a viewport of an odd width and an
odd height: the middle of the screen is then the centre of one pixel.

#### Scenario: The glow has spikes

- **WHEN** the browser test draws one glow marker of the category colour (255, 255, 255)
  over dark space at the cap size, and reads the luminance the pass adds 8 pixels along the
  sprite's horizontal axis, 8 pixels along its vertical axis, 6 pixels along each axis,
  which is the same radius on the 45 degree diagonal, and 50 pixels out, which is past the
  sprite
- **THEN** the horizontal reading and the vertical reading are each at least 0.1 above the
  diagonal reading, and the reading past the sprite is 0. A white category makes the added
  luminance the alpha, so the rule predicts the readings: at 8 of the 20 pixel radius the
  spike adds `0.55 * (1 - 8/20)^2`, which is 0.198, over a halo of `0.85 * (1 - 8/20)^3`,
  which is 0.184, while the diagonal at 8.49 pixels is past the spike's 1.0 CSS pixel
  half-width and holds the halo alone, which is 0.162

#### Scenario: The glow has no ring

- **WHEN** the browser test draws one glow marker over dark space and reads the luminance
  the pass adds along the 45 degree diagonal at every device pixel from the centre to the
  sprite edge
- **THEN** the readings never rise as the distance grows, and the last reading inside the
  sprite is below 0.02

#### Scenario: The glow alpha has no step

- **WHEN** a unit test reads the glow alpha rule off the spike axes at 1,000 equal steps
  from the centre to the sprite edge, at the floor radius and at the cap radius
- **THEN** the alpha is 1 at the centre, it never rises as the distance grows, and no two
  neighbouring readings differ by more than 0.05. The core term falls at 1/1.5 per CSS
  pixel, so a step of a thousandth of the radius moves the alpha by at most 0.006. An
  opaque core joined straight to the halo fails this: its one step is 0.35 at the cap
  radius and 0.46 at the floor radius

#### Scenario: The glow fits the card's point size

- **WHEN** a unit test reads the sprite size the pass asks for at a device pixel ratio of
  1, 2 and 3 at the cap, and compares each with the maximum of
  `ALIASED_POINT_SIZE_RANGE`
- **THEN** every size the pass asks for is at or below that maximum, and where the card's
  maximum is smaller the pass asks for the card's maximum instead. At a device pixel ratio
  of 3 a 40 CSS pixel glow asks for 120 device pixels, which is the largest sprite the map
  draws

#### Scenario: The glow sprite is 2.5 times the disc

- **WHEN** the browser test adds two categories of the colour (255, 255, 255), one `glow`
  and one `disc`, adds one system of each at a range that puts both at the cap size, and
  counts the pixels of the row through each marker's centre that differ from the frame
  drawn with the pass off, at a device pixel ratio of 1
- **THEN** the glow count is between 2.0 and 2.7 times the disc count.

  The count is not the sprite diameter, because a glow has no edge. The row through the
  centre is a spike axis, where the alpha is
  `0.55 * (1 - a/R)^2 + 0.85 * (1 - a/R)^3`, and over dark space a channel of 255 changes
  by one 8-bit step only while that alpha is above 1/510. It falls under that at 0.94 of
  the radius, so a 40 CSS pixel glow counts about 38 pixels against a 16 pixel disc, which
  is 2.35. The bounds are wider than that figure because each of the two counts carries
  one pixel of rasterisation either way, and 39/15 is 2.60 while 37/17 is 2.18. The colour
  is pinned because a category whose brightest channel is well below 255 crosses the 8-bit
  floor sooner and counts fewer pixels.

  The cap size is now a range of 10 light years or less, so the test puts the camera on
  the two systems at the closest zoom. The old cap held from a range of about 1,560 light
  years inward at 1,080 CSS rows

#### Scenario: The two styles draw in one call

- **WHEN** a unit test draws the marker pass on a recording context with 100 systems of a
  `glow` category and 100 of a `disc` category in the set
- **THEN** the context recorded exactly one `drawArrays` call, and its count is 200

#### Scenario: A restyled category restyles its markers

- **WHEN** the browser test adds one `disc` category of the colour (255, 255, 255) and one
  system at a range that puts the marker at the cap size, reads the middle pixel and the
  row width of the marker, then adds a category of the same name with the `markerStyle`
  `glow`, draws a frame and reads both again
- **THEN** the row width grows by a factor between 2.0 and 2.7, and the system count does
  not change. The bounds are the ones the scenario above gives, and for the same reason


### Requirement: Frame budget with a full set

At 1920x1080 on the dev container's GPU, with 10,000 systems in the set, the mean render
time over 300 consecutive frames SHALL stay under 16.7 ms at zoom distances of 10, 500,
4,000, 20,000 and 120,000 light years, with the cursor at Sol and at the galactic centre.

The 10 light year view is the closest zoom. It is the most costly of the five for the
marker pass, because at that zoom a marker at the cursor is at its 40 CSS pixel glow cap
and every marker inside its category's range fills the sprite the size curve gives it, so
the pass writes the largest number of fragments it ever writes.

The cap moves from 30 to 40 CSS pixels with this change, which is 1.78 times the fragments
of the worst case the budget held before. That is the reading this requirement exists to
take again.

The pass rebases 10,000 positions every frame, which is 30,000 `float64` subtractions and
one buffer write of 120 KB. The measurement SHALL use the same function the far view's
frame budget uses, so it holds that CPU work and the GPU work together.

#### Scenario: Eight views under budget with 10,000 systems

- **WHEN** the browser test adds 10,000 systems spread over the model bounds, sets each
  of the eight views at 500, 4,000, 20,000 and 120,000 light years, and calls the
  measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget with 10,000 systems

- **WHEN** the browser test adds 10,000 systems spread over the model bounds, sets the two
  views at 10 light years, one with the cursor at Sol and one at the galactic centre, and
  calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget with every marker in range

- **WHEN** the browser test adds 10,000 systems of one category whose `maxDrawRange` is
  300,000 light years, all within 10 light years of Sol, sets the view at 10 light years
  with the cursor at Sol, and calls the measurement function for 300 frames
- **THEN** the returned mean is under 16.7 ms. This is the worst case for the marker pass,
  because every one of the 10,000 glow sprites is at the 40 CSS pixel cap, which writes
  16 million fragments over a frame of 2 million pixels. The old rule reached its 30 CSS
  pixel cap at a range of about 1,560 light years, so the old worst case put the systems
  within 10,000 light years of Sol
