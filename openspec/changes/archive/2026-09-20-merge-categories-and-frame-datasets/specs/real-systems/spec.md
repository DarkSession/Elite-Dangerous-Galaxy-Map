## MODIFIED Requirements

### Requirement: A record follows the shape of an EDSM or a Spansh dump

A record SHALL carry a `name` that is a string of at least one character and a `coords`
object whose `x`, `y` and `z` are finite numbers. The position is in game coordinates in
light years.

A record MAY carry `categories`, an array of names of categories the table holds. The
array MAY hold any number of names. The reader SHALL drop a name that repeats and SHALL
keep the rest in the order the record gave them. A `categories` that is present and is not
an array SHALL be read as an empty list, as an optional field of the wrong type is
dropped. An entry of the array that is not the name of a category the table holds SHALL
reject the record, which covers an entry that is not a string.

**The first name of the list is what the record's `primaryCategory` was.** It gives the
**colour**, the **style** and the **draw range** of the marker. Every later name decides
whether the marker draws at all and may become the drawn one when an earlier name is
switched off: the requirement "A category can be turned off" states that rule.

**The record carries one list and not two.** `primaryCategory` and `secondaryCategories`
are gone. A record that carries either name SHALL have it dropped with every other field
the reader does not know, so an old record reads as a record that names no category.

A record whose `categories` is empty, or that names none, SHALL be accepted while the
category table is empty and SHALL be rejected as `no-category` while the table holds a
category. The requirement "A set holds categories or holds none" states that rule and what
such a marker draws in.

The reader SHALL keep these optional fields when they are present and of the stated
type, and SHALL drop every other field of the record:

| Field             | Type                       |
| ----------------- | -------------------------- |
| `id64`            | number, string or `bigint` |
| `allegiance`      | string                     |
| `government`      | string                     |
| `primaryEconomy`  | string                     |
| `security`        | string                     |
| `population`      | finite number              |
| `bodyCount`       | finite number              |
| `description`     | string                     |
| `primaryStar`     | string                     |
| `images`          | array, read as below       |
| `icons`           | array, which `system-icons` defines |

The reader SHALL store `id64` as a decimal string. A Spansh `id64` is a 64-bit integer,
and `JSON.parse` loses digits above 2^53, so a host that needs every digit passes a
string or a `bigint`.

`description` is text about the system, written in the **Markdown subset** that
`system-details` states. The reader SHALL keep the string as the record gave it: it SHALL
NOT strip a character, SHALL NOT escape one, and SHALL NOT parse the text. The HUD parses
it when it draws it, and it draws no HTML from it, so a description from an untrusted dump
carries no markup into the page.

`primaryStar` is the class of the system's primary star, for example `K5 V`. Neither field
changes how a marker draws. The HUD shows each one, and it hides the description section
when the record carries none and the `details` loader of `system-details` gives none.

`images` is an array of entries, each an object with a `url` string and an optional
`caption` string. The reader SHALL keep at most **8** entries, in the order the record
gave them, and SHALL drop the rest. The reader SHALL drop an entry that is not an object,
an entry whose `url` is not a string, an entry whose `url` is empty, and an entry whose
`url` names a scheme that is not `http` or `https`. A `url` with no scheme is a relative
URL and SHALL be kept. A bad entry SHALL NOT reject the record, because an image is
decoration and the rest of the record still draws and still reads.

The scheme rule is a safety rule, not a formatting one. The HUD puts the `url` in an image
element, so a `javascript:` or a `data:` URL from an untrusted dump would run or embed
content the host did not mean to serve. The library SHALL NOT fetch an image itself: the
browser loads it from the element.

`icons` is an array of at most **4** entries, which `system-icons` states the shape of and
the map draws over the system's marker. It is the one optional field a bad value **rejects**
the record for, rather than drops: `system-icons` states why, and the two reasons the
requirement below names are what the report carries. The same URL rule the images hold
covers a host icon's `url`.

`getSystem` SHALL read a record back with `categories` and with neither of the two names
it replaces.

#### Scenario: An EDSM record and a Spansh record are both read

- **WHEN** a unit test adds two categories, then one EDSM record, which carries `id64`,
  `name`, `coords`, `categories` and `date`, and one Spansh record, which carries those
  fields and `allegiance`, `government`, `primaryEconomy`, `security`, `population`,
  `bodyCount`, `bodies` and `stations`
- **THEN** both are accepted, the kept fields hold the values the records gave, and
  neither `date` nor `bodies` nor `stations` is held

#### Scenario: An unknown secondary category rejects the record

- **WHEN** a unit test adds the category `A`, then three records: one whose `categories`
  are `['A', 'B']`, where the table does not hold `B`, one whose `categories` is the
  string `A` and not an array, and one whose `categories` are `['A', 7]`
- **THEN** the first and the third are rejected as `unknown-category`, and the second is
  rejected as `no-category`, because a `categories` of the wrong type reads as an empty
  list and the table holds a category

  A secondary category is now an entry of `categories` after the first, and the reader
  rejects an unknown name wherever it sits in the list.

#### Scenario: The secondary categories are kept in order, without a repeat

- **WHEN** a unit test adds the categories `A`, `B` and `C`, then one record whose
  `categories` are `C`, `B`, `C` and `A`
- **THEN** the record is accepted and reads back the categories `C`, `B` and `A`, in that
  order, and the marker takes the colour of `C`

#### Scenario: The old field names are dropped

- **WHEN** a unit test adds the category `A`, then one record that carries
  `primaryCategory: 'A'` and `secondaryCategories: []` and no `categories`
- **THEN** the record is rejected as `no-category`, and neither name is held on any record
  the set reads back

#### Scenario: A large id64 keeps every digit

- **WHEN** a unit test adds a record whose `id64` is the string `2871051900826` and one
  whose `id64` is the bigint `18262930337633`
- **THEN** the reader holds `"2871051900826"` and `"18262930337633"`

#### Scenario: The three HUD fields are kept when they are strings

- **WHEN** a unit test adds one category, then one record that carries `description`,
  `primaryStar` and `images` of one entry, and one record whose `description` is the
  number 4 and whose `primaryStar` is null
- **THEN** both records are accepted, the first holds all three, and the second holds
  neither string

#### Scenario: The image list drops a bad entry and caps at eight

- **WHEN** a unit test adds one record whose `images` hold, in order, an entry with the
  `url` `https://example.test/a.png` and the caption `A`, an entry with the `url`
  `javascript:alert(1)`, an entry with the `url` `/local/b.png`, an entry that is the
  string `c.png`, and then 10 more entries with valid `https` URLs
- **THEN** the record is accepted and holds 8 images: the `https` entry with its caption,
  the relative entry, and the first 6 of the 10, and neither the `javascript` entry nor
  the string entry is held

#### Scenario: An images field that is not an array is dropped

- **WHEN** a unit test adds one record whose `images` is the string `a.png` and one whose
  `images` is an empty array
- **THEN** both records are accepted and neither holds an image

#### Scenario: A description keeps its Markdown characters

- **WHEN** a unit test adds one record whose `description` holds a star, a backtick, a
  bracket and a backslash, and reads the record back from the handle
- **THEN** the string reads exactly as the record gave it, character for character

#### Scenario: An icon list is kept and a bad one rejects the record

- **WHEN** a unit test adds one record whose `icons` is `['titan']` and one whose `icons`
  is the string `titan`
- **THEN** the first is accepted and holds one icon, and the second is rejected as
  `bad-icon`

### Requirement: The reader reports every record it rejects

`addSystems` SHALL return a report of `added`, `replaced` and `rejected`. Each rejected
entry SHALL carry the index of the record in the call and one reason from this set:
`no-name`, `no-coords`, `no-category`, `unknown-category`, `out-of-bounds`,
`over-capacity`, `bad-icon`, `unknown-icon`.

A record whose position lies outside the galaxy model bounds SHALL be rejected as
`out-of-bounds`. The bounds are the volume the map draws, so a record outside them could
never show. The reader SHALL reject a bad record and SHALL keep reading the rest of the
call.

A record that names **no category**, while the category table holds at least one, SHALL be
rejected as `no-category`. A category is what colours a marker in a set that has
categories, so a system without one in such a set has no colour to draw in. The host
therefore adds its categories before its systems, and the report names every record that
arrived too early. While the table is **empty** such a record SHALL be accepted, which the
requirement "A set holds categories or holds none" states.

A record one of whose `categories` names a category the table does not hold SHALL be
rejected as `unknown-category`.

`bad-icon` and `unknown-icon` are what an unreadable `icons` field gives, and
`system-icons` states which fault gives which. They are the last two reasons the reader
tests, so a record that is faulty in an earlier field reports that earlier reason.

#### Scenario: Each fault gets its own reason

- **WHEN** a unit test adds one category, then seven records: one valid, one with an
  empty name, one with no `coords`, one whose `coords.x` is `NaN`, one at
  (0, 0, 900,000), one with no `categories`, and one whose `categories` name a category
  the table does not hold
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `no-coords` at
  index 2, `no-coords` at index 3, `out-of-bounds` at index 4, `no-category` at index 5
  and `unknown-category` at index 6

#### Scenario: An icon fault reports after an earlier fault

- **WHEN** a unit test adds one record with an empty name and an `icons` of
  `['no-such-icon']`, and one valid record whose `icons` is `['no-such-icon']`
- **THEN** the first is rejected as `no-name` and the second as `unknown-icon`

### Requirement: A category can be turned off

The handle SHALL carry `setCategoryVisible(name, visible)` and `isCategoryVisible(name)`.
A category SHALL be on when the table takes it, so a host that never calls the setter sees
the map it sees today.

A marker SHALL draw and SHALL be picked when **any** category the system names is on, and
SHALL NOT draw and SHALL NOT be picked when every one of them is off. The rule reads the
whole of the record's `categories` list.

**The marker SHALL take its colour, its style and its draw range from the first category
the record names that is on.** The order SHALL be the order of the record's `categories`
list. The reading is therefore one category, and it is the first one of that list that the
user has left on.

A marker of a system that names **no** category SHALL always draw and SHALL always be
picked. No switch reaches it, and the requirement "A set holds categories or holds none"
states what it draws in.

The drawn category SHALL follow the visibility in the next frame, with no rebuild of the
scene data and no reupload of the system positions. A system whose categories are all off
draws no marker, so it has no drawn category and the colour it would have taken never
reaches the frame.

A call that names a category the table does not hold SHALL change nothing and SHALL NOT
throw. `isCategoryVisible` SHALL return `false` for such a name.

The sweep that rebuilds which markers draw SHALL run when the set, the category table, the
visibility or the filter changes, and SHALL NOT run per frame. It SHALL read each
system's categories once, and it SHALL write the drawn category in that same read. With
10,000 systems each naming 4 categories, and every category turned off in one call, the
sweep SHALL cost less than **2 milliseconds** on the main thread, and the page SHALL expose
the reading so a test can read it.

A category replaced under the same name SHALL keep the visibility it had, because the
replacement changes the table entry and not what the user chose to look at.
`clearSystemsAndCategories` SHALL clear the visibility with the table.

The change SHALL reach the next frame with no rebuild of the scene data and no reupload of
the system positions.

#### Scenario: A category that is off draws no marker

- **WHEN** the browser test adds two categories and one system in each, at a view that
  shows both, reads the marker count, calls `setCategoryVisible` with the first category
  and `false`, draws a frame and reads the count and the pixel at each marker again
- **THEN** the first count is 2 and the second is 1, the pixel of the first marker matches
  the frame drawn with the systems pass off, and the pixel of the second does not

#### Scenario: A secondary category keeps a marker on the screen

- **WHEN** the browser test adds the categories `A` and `B` and one system whose
  `categories` are `A` then `B`, turns `A` off, draws a frame and reads the marker count
  and `systemAt` at the pixel it projects to, then turns `B` off as well, draws and reads
  both again
- **THEN** the first reading is 1 and names the system, and the second reading is 0 and
  null

#### Scenario: A hidden category is not picked

- **WHEN** the browser test adds one category and one system in it alone, turns the
  category off, draws a frame, and calls `systemAt` at the pixel the system projects to
- **THEN** the reading is null

#### Scenario: The colour follows the first category that is on

- **WHEN** the browser test adds a red category `A` and a blue category `B`, one system
  whose `categories` are `B` then `A`, reads the marker's pixel, then turns `B` off so the
  marker draws through `A` alone, draws a frame and reads the pixel again
- **THEN** the first reading is the blue of `B` and the second is the red of `A`

#### Scenario: The colour goes back when the category comes back on

- **WHEN** the browser test builds the same two categories and system, turns `B` off, draws
  and reads the pixel, turns `B` on again, draws and reads the pixel
- **THEN** the second reading is the blue of `B` again

#### Scenario: The order is the record's order

- **WHEN** the browser test adds the categories `A`, `B` and `C` in three colours and one
  system whose `categories` are `A`, `C` then `B`, turns `A` off, draws and reads the
  marker's pixel, then turns `C` off as well, draws and reads it again
- **THEN** the first reading is the colour of `C` and the second is the colour of `B`,
  because the order is the record's order and not the table's

#### Scenario: The style and the range follow the drawn category

- **WHEN** the browser test adds a `glow` category `A` with a `maxDrawRange` of 200 and a
  `disc` category `B` with a `maxDrawRange` of 20,000, one system whose `categories` are
  `A` then `B`, opens a view 1,000 light years from the system, draws a frame and reads the
  marker count, then turns `A` off, draws and reads the count and the marker's pixel
- **THEN** the first count is 0, because `A` cuts the marker at 200 light years, and after
  the switch the count is 1 and the pixel reads the `disc` style of `B`

#### Scenario: The colour still follows the primary category

- **WHEN** the browser test adds a red category `A` and a blue category `B`, one system
  whose `categories` are `B` then `A`, keeps both categories on, draws a frame and reads
  the marker's pixel
- **THEN** the pixel is the blue of `B`, because the first category the record names is on

  The primary category is now the **first entry of `categories`**. The scenario keeps its
  name, because the rule it reads is unchanged: with every category on, the marker takes
  the colour of the first one the record names.

#### Scenario: The sweep holds its budget

- **WHEN** the browser test adds 10,000 systems over 8 categories, each system naming 4 of
  them, then calls `setCategoryVisible` with `false` for every category in turn and reads
  the sweep time
- **THEN** no sweep took more than 2 milliseconds

#### Scenario: A replaced category keeps its visibility

- **WHEN** a unit test adds a category, turns it off, adds a category of the same name
  and another colour, and reads `isCategoryVisible`
- **THEN** the reading is `false`

#### Scenario: An unknown name changes nothing

- **WHEN** a unit test calls `setCategoryVisible('nothing', false)` on a map whose table
  holds one other category, then reads `isCategoryVisible('nothing')` and
  `isCategoryVisible` of the category it does hold
- **THEN** the call does not throw, the first reading is `false` and the second is `true`

### Requirement: The set holds positions in float64

Every change to the set SHALL raise the set version, and every change to the category
table SHALL raise the table version. An add, a replace, a clear and a paired clear all
count as a change. The marker pass rebuilds its colour buffer from those two numbers and
the star field drops the suppressed sets it kept, so a change that did not raise them
would leave both stale.

The system set SHALL hold positions as one `Float64Array` of three game coordinates per
system, in the order the records were added, the index of each system's **drawn category**
as one `Uint16Array` in the same order, and the record fields as plain
objects and strings.

The positions stay in `float64`, because the marker pass subtracts the camera position
from them every frame and phase 4 projects them for picking. The requirement
"Scene data carries no rendering types" of `far-view-scene-data` already holds the
import direction for every module under the scene-data directory, and this set is one of
them.

#### Scenario: Positions are float64 game coordinates

- **WHEN** a unit test adds three records and reads the set's position array
- **THEN** the array is a `Float64Array` of length 9 and holds the three positions in
  the order the records were added

**The drawn category is the first of the record's `categories` that is on**, which the
requirement "A category can be turned off" states, and its index is a row of the table.

**A system that names no category points at a row that is not in the table.** An
uncategorised set, which the requirement "A set holds categories or holds none" allows,
holds one internal row carrying the library's default colour, style and draw range, and
every system of that set points at it. The row SHALL NOT be in the table: `categoryCount()`
SHALL read 0 and `getCategory(0)` SHALL read null on such a set. The array therefore holds
a readable index for every system, whether the set is categorised or not, and no reader of
it needs a branch.

#### Scenario: An uncategorised set holds no table row

- **WHEN** a unit test builds a map with no category and three systems, draws a frame, and
  reads `categoryCount()` and `getCategory(0)`
- **THEN** the readings are 0 and null, and the three markers drew

### Requirement: The demo page loads the Guardian Ruins data set

The demo page SHALL load the data sets `dataset-catalog` names, of which the Guardian
Ruins set is the one it loads at start. The library itself SHALL still bundle no data and
fetch none: the page is a host application and adds the records through `addCategories`
and `addSystems`, as any other host does.

**The library build SHALL hold no record of any set.** The demo site build SHALL carry
them, because the demo site is what GitHub Pages serves and a site with no data shows an
empty sky. This reverses the rule the change `flight-markers-and-grid` wrote, that the
production build drops the set so the browser suite reads an empty set. The suite now
serves the demo site, so a scenario that measures an empty set SHALL call
`clearSystemsAndCategories()` first, which `library-package` states.

**The source** is `Source/data/MapData-GR.js` of CanonnED3D-Map and the
`guardian_ruins.json` dump that file fetches. A build script SHALL make the committed set
from the dump, so the conversion is repeatable and the rules below are read from the
script and not from a hand edit. The script SHALL fetch the dump into a directory the
repository ignores, because the project does not commit data dumps.

**The committed set moves to `demo-data/`.** It sat in `src/app/`, which is library code,
and the library build must hold no data. `demo-data/guardian-ruins.json` is the file, and
`dataset-catalog` names the two beside it.

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
systems, and a system holds up to three site types. The record's `categories` SHALL hold
every type the system holds, the type of its first site in the dump first, so that type is
the one that gives the marker its colour. 166 of the 212 systems hold more than one type.

**The images.** A record SHALL carry one image for each site type the system holds, in
the same order as its categories. An image's `url` SHALL be the thumbnail of that type at
`https://ruins.canonn.tech/images/maps/<type>-thumbnail.png`, and its `caption` SHALL name
the type. The project therefore redistributes no picture: the browser loads each one from
Canonn, and the library never fetches an image itself.

**The browser suite SHALL still reach no network.** A browser test MAY now put the set on
the map, because the demo site it serves loads the set itself and a marker fetches nothing.
No browser test SHALL open the information panel on a record of the set, because the panel
draws the record's thumbnails and every one of them is on another host. The browser test
that reads a thumbnail from the built page SHALL keep using a record of its own that names
a picture the build serves from `public/`.

The rule the old browser test held, that a typo in a demo record's picture path ships
unseen, is now held by a unit test instead: the scenario "Every record carries an image for
each type it holds" reads every URL of the committed set.

`THIRD_PARTY_NOTICES.md` SHALL name the source of the records and of the thumbnail URLs,
and SHALL keep the Canonn MIT licence text it holds today.

#### Scenario: The committed set holds the converted records

- **WHEN** a unit test reads `demo-data/guardian-ruins.json`
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

- **WHEN** a search of `e2e/` looks for `ruins.canonn.tech` and for a browser test that
  selects a record of the Guardian Ruins set
- **THEN** it finds neither, and the browser test that reads a thumbnail from the built page
  names a picture the build serves from `public/`

#### Scenario: The production build carries no data set

- **WHEN** a test reads every file of the library build and searches it for a record of the
  Guardian Ruins set, and a browser test opens the demo site, waits for `ready`, reads
  `systemCount`, calls `clearSystemsAndCategories()` and reads it again
- **THEN** no file of the library build holds a record, the first reading is 212 and the
  second is 0

### Requirement: A marker draws for every system at every zoom distance

The renderer SHALL draw one marker per system in the set, in one draw call, at every
zoom distance from 10 to 120,000 light years, for every system the range rule below keeps,
**one of whose categories is on or that names none**, and whose name the filter keeps. There SHALL be no level of
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
the point cloud use. Two systems whose drawn category is the same SHALL draw one colour,
wherever they lie, and two systems of different categories SHALL draw the two colours the
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

### Requirement: A category carries a name, a colour and a description

The handle SHALL expose `addCategories(categories)`. A category SHALL carry a `name` that
is a string of at least one character, and a `color` of three finite numbers from 0 to
255, in the order red, green, blue. A category MAY carry a `description`, which is a
string the phase 4 HUD shows. A category MAY carry a `markerStyle` and a `maxDrawRange`,
which the two requirements below define. The reader SHALL drop every other field.

A `markerStyle` that is present SHALL be the string `glow` or the string `disc`. Any
other value SHALL reject the category with the reason `bad-style`. The reader SHALL NOT
silently drop a `markerStyle` it does not know, because a host that misspells a style
would otherwise get the default and no report of it.

A `maxDrawRange` that is present SHALL be a finite number above 0. Any other value SHALL
reject the category with the reason `bad-range`.

The identity of a category is its `name`. A category whose name is already in the table
SHALL replace the one that holds it, and every system that names it SHALL take the new
colour, the new style and the new range in the next frame. A replace SHALL replace the
whole category, so a description, a style or a range the old one carried and the new one
does not is gone and the default takes its place.

No call SHALL remove one category. `clearSystemsAndCategories` SHALL empty the table, and
it SHALL empty the system set in the same call. A system in the set can then never name a
category the table does not hold: a category leaves only with every system that could name
it. A host that loads a new data set calls `clearSystemsAndCategories` and then its two
add calls, in that order.

A replaced category SHALL keep the index it already holds in the table. The system set
holds one category index per system, so an index that moved would point every system that
names the category at another category's colour.

A `description` that is present and is not a string SHALL be dropped, as an optional
field of the wrong type is dropped from a record. `markerStyle` and `maxDrawRange` are the
exception: a wrong value rejects the category rather than being dropped, because each one
changes what the user sees and a silent drop would hide the fault in a frame that still
draws.

A replacement SHALL work on a full table, because it adds no category. The capacity bound
rejects a category that would grow the table, and never one that replaces a category
already in it.

The table SHALL hold at most 256 categories. `addCategories` SHALL return a report of
`added`, `replaced` and `rejected`. Each rejected entry SHALL carry the index of the
category in the call and one reason from this set: `no-name`, `bad-color`, `bad-style`,
`bad-range`, `over-capacity`, `set-is-uncategorised`. The last of those is what a call
takes while the set holds a system that names no category, which the requirement "A set
holds categories or holds none" states. A `color` that is not three finite numbers from 0 to 255
SHALL be rejected as `bad-color`.

The host names its categories. The map reads a name, a colour, a description, a style and
a range, and it gives no category of its own, so a host that groups its systems by
allegiance and a host that groups them by star class both fit the same call.

#### Scenario: A category is read and kept

- **WHEN** a unit test adds one category of the name `Empire`, the colour (0, 180, 255)
  and a description, and one of the name `Alliance`, the colour (0, 255, 120) and no
  description, and reads the table
- **THEN** both are accepted, each holds the name and the colour the call gave, the first
  holds its description and the second holds none

#### Scenario: Adding the same name replaces the colour

- **WHEN** a unit test adds a category of the name `Empire` and the colour (0, 180, 255),
  then adds a category of the same name and the colour (255, 40, 40), and reads the table
- **THEN** the table holds one category, `replaced` is 1, and its colour is the second one

#### Scenario: Each category fault gets its own reason

- **WHEN** a unit test adds six categories: one valid, one with an empty name, one whose
  `color` holds two numbers, one whose `color` holds a `NaN`, one whose `markerStyle` is
  `sparkle`, and one whose `maxDrawRange` is `-5`
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `bad-color` at index 2
  and at index 3, `bad-style` at index 4 and `bad-range` at index 5

#### Scenario: A style and a range are read and kept

- **WHEN** a unit test adds one category with `markerStyle` `disc` and `maxDrawRange`
  5,000, and one with neither, and reads the table
- **THEN** the first holds `disc` and 5,000, and the second holds `glow` and 120,000

#### Scenario: A replacement drops the style and the range the old one carried

- **WHEN** a unit test adds a category with `markerStyle` `disc` and `maxDrawRange` 5,000,
  then adds a category of the same name with neither field, and reads the table
- **THEN** the category holds `glow` and 120,000, because a replace replaces the whole
  category

#### Scenario: The table bound rejects the excess

- **WHEN** a unit test adds 256 categories, then adds 2 more with new names and 1 with a
  name the table already holds, then calls `clearSystemsAndCategories` and adds 256
  categories again
- **THEN** the second call reports `replaced` 1 and 2 entries of `over-capacity`, and the
  third reports `added` 256 and no rejection

#### Scenario: A replaced category keeps its index

- **WHEN** a unit test adds three categories, adds one system that names the second, then
  adds a category of the second name and a new colour, and reads the table index of that
  category and the colour the marker draws
- **THEN** the index is the one the category held before, and the marker draws the new
  colour

#### Scenario: A wrongly typed description is dropped

- **WHEN** a unit test adds one category whose `description` is the number 7
- **THEN** the category is accepted, its name and colour hold, and it carries no
  description

## ADDED Requirements

### Requirement: A set holds categories or holds none

A host SHALL choose, for one set, between grouping its systems into categories and
grouping none of them. The map SHALL hold that choice and SHALL NOT draw a set that is
half of each, because a category browser over a set where only some systems carry a row
tells the user nothing about the rest.

The rule is two rejections, one on each reader:

- `addSystems` SHALL accept a record that names no category while the category table is
  **empty**, and SHALL reject it as `no-category` while the table holds a category.
- `addCategories` SHALL reject every category of the call, with the reason
  `set-is-uncategorised`, while the set holds at least one system that names no category.
  The reason SHALL join `no-name`, `bad-color`, `bad-style`, `bad-range` and
  `over-capacity` in the set a `CategoryReport` reports.

`clearSystems` and `clearSystemsAndCategories` SHALL clear the state the second rejection
reads, so a host switches a categorised set for an uncategorised one, or the other way
round, by clearing first. A dataset load already clears both.

**A marker with no category SHALL draw in one library default**: the colour
**(150, 170, 200)**, which is the neutral blue-white of an unclassified star; the default
marker style `glow`; and the default draw range of **120,000** light years. All three are
the values a category takes when it names none, but for the colour, which no category
default states today. The default SHALL be a stated constant and SHALL NOT be a host
option: a host that wants another colour uses categories.

A marker with no category SHALL be picked, SHALL be selected, SHALL carry its name label,
its icons, its hover ring and its selection pin, and SHALL be kept or dropped by the name
filter, exactly as a marker with a category is. The only member of the map it does not
reach is the category switch.

The information panel SHALL show no category chip for such a system, which the `map-hud`
requirement "The information panel shows the selected system" states and owns.

#### Scenario: An uncategorised set loads

- **WHEN** a unit test builds a map, adds no category, then adds three records that carry
  no `categories`, and reads the report, `systemCount` and `categoryCount`
- **THEN** the report holds three added and no rejection, the count is 3 and the category
  count is 0

#### Scenario: A record with no category is rejected in a categorised set

- **WHEN** a unit test adds one category, then two records, one naming that category and
  one naming none
- **THEN** the first is added and the second is rejected as `no-category`

#### Scenario: A category is rejected on an uncategorised set

- **WHEN** a unit test adds two records that carry no `categories`, then calls
  `addCategories` with two categories, and reads the report and `categoryCount`
- **THEN** both categories are rejected as `set-is-uncategorised` and the count is 0

#### Scenario: Clearing the set lets the categories in

- **WHEN** the same test calls `clearSystems()`, then `addCategories` with the same two
  categories, and reads the report
- **THEN** both are added

#### Scenario: The default marker draws and is picked

- **WHEN** the browser test builds a map with no category and one system named `Sol`,
  opens a view that shows it, draws a frame, reads the marker count, reads the pixel at
  the marker centre and calls `systemAt` at that pixel
- **THEN** the count is 1, the pixel reads the default colour (150, 170, 200) in the
  `glow` style, and `systemAt` names `Sol`

#### Scenario: The filter reaches an uncategorised marker

- **WHEN** the browser test adds three uncategorised systems named `Sol`, `Solati` and
  `Achenar`, calls `setNameFilter('sol')`, draws a frame and reads the marker count
- **THEN** the count is 2
