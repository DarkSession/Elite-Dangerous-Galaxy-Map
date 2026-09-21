## ADDED Requirements

### Requirement: The set holds up to 50,000 systems

The set SHALL hold at most **50,000** systems. `addSystems` SHALL accept records up to
that bound and SHALL reject every record that would grow the set past it with the reason
`over-capacity`. `clearSystems` SHALL empty the set, and the next call SHALL then accept
50,000 records again.

`clearSystemsAndCategories`, which the requirement "A category carries a name, a colour
and a description" defines, SHALL free both bounds: after it the next calls SHALL accept
256 categories and 50,000 records.

**The bound SHALL be the number the measurements hold.** 50,000 is the number the readings
of this change landed on, from a proposal of 100,000. It is five times the bound it replaces,
and it holds the largest measured Canonn source, 71,142 systems, in two entries instead of
eight. Six budgets are read at a full set: the frame budget and the close zoom of this
spec, the pick and the selection work of `system-selection`, the switch of
`dataset-catalog`, the filter pass of `map-hud`, the star suppression index of
`close-view-stars` and the icon draw of `system-icons`. Where one of them fails at 50,000,
the implementation SHALL make that work cheaper, or SHALL lower the bound to the highest
round number that holds every reading. It SHALL NOT raise a budget to keep the number.

**The bound SHALL NOT land under 20,000.** Under that number the change buys the page it
exists for nothing that the splitting rule of `publish-the-canonn-data-page` does not
already give.

**The set SHALL NOT allocate the whole bound up front.** Every record buffer is allocated
at the bound today, when the map is built and before a record arrives. That is about 320 KB
in the set and about 320 KB in the marker pass, on the CPU and again on the card. At the new
bound it is about 2.6 MB in the set and about 1.6 MB in the marker pass, which every host would pay to draw ten records. The set
and the marker pass SHALL size their buffers to the records they hold, and SHALL grow them
as records arrive. A map that holds no record SHALL hold no record buffer.

**A reader SHALL NOT hold a buffer over a growth.** `positions`, `categoryIndices`,
`markerFlags` and `iconIndices` are members a reader takes each frame, and each one is a
getter that returns a `subarray` of the store. Growth replaces the store behind the
subarray, so the members SHALL always cut the store the set holds now, and `version` SHALL
rise where the set grows.

**The growth is read through the store, not through the member.** The members already
report the records the set holds: `positions.length` is `count * 3` today, whatever the
store behind it. The allocation is `positions.buffer.byteLength`, which is 240,000 bytes on
an empty set today and SHALL be 0 after this change. That is the number the scenarios below
read, and the number a test of this requirement can fail on.

#### Scenario: The bound rejects the excess

- **WHEN** a unit test adds 49,998 systems, then adds 5 more with new identities, then
  calls `clearSystems` and adds 50,000
- **THEN** the second call reports `added` 2 and 3 entries of `over-capacity`, and the
  third call reports `added` 50,000 and no rejection

#### Scenario: A small set holds a small store

- **WHEN** a unit test builds a set, reads `positions.buffer.byteLength`, adds 10 records
  and reads it again
- **THEN** the first reading is 0, and the second is the block the implementation grows by,
  which is under 1 percent of the whole bound

#### Scenario: A grown set reports the store it holds now

- **WHEN** a unit test adds 10 records, reads `positions.buffer.byteLength`, adds 25,000
  more and reads `positions` again
- **THEN** the store is larger than it was, `positions` holds the position of the first
  record unchanged at index 0, and `version` is higher than it was

#### Scenario: The marker pass sizes its buffers to the set

- **WHEN** a unit test builds the marker pass over a stub context with an empty set, counts
  the bytes the pass gave to `bufferData`, adds 10 records, draws a frame and counts again
- **THEN** the first count is 0, the second is the block the pass grows by, and the pass
  wrote the colours and the style ranges again after the growth

## MODIFIED Requirements

### Requirement: Frame budget with a full set

At 1920x1080 on the dev container's GPU, with **50,000** systems in the set, the mean
render time over 300 consecutive frames SHALL stay under 16.7 ms at zoom distances of 10,
500, 4,000, 20,000 and 120,000 light years, with the cursor at Sol and at the galactic
centre.

**A full set is now five times the set this budget was written for.** The readings at 10,000
stand and are not repeated here: they were taken, they passed, and a smaller set cannot
cost more than a larger one in this pass. The readings this requirement asks for are the
ones at the new bound.

**Two scenario headings below still name 10,000.** A MODIFIED block must carry every
scenario heading the spec holds today, word for word, and OpenSpec has no rename for a
scenario. The bodies name the new bound, and the headings are corrected by a direct edit
after this change archives, the way
`2026-09-20-rename-category-scenario-headings` corrected seven others.

The 10 light year view is the closest zoom. It is the most costly of the five for the
marker pass, because at that zoom a marker at the cursor is at its 40 CSS pixel glow cap
and every marker inside its category's range fills the sprite the size curve gives it, so
the pass writes the largest number of fragments it ever writes.

The pass rebases every position in the set each frame. At the new bound that is 150,000
`float64` subtractions and one buffer write of 0.6 MB, five times the work the budget was
written against. The measurement SHALL use the same function the far view's frame budget
uses, so it holds that CPU work and the GPU work together.

**The measurement decides the bound.** 10,000 forced 40 CSS pixel glow markers within 10
light years of Sol drew in a mean of 1.617 ms against this 16.7 ms budget, which is the
reading the close cap was chosen on. Five times that work sits at about 8.1 ms, which is half the
budget, so the implementation SHALL take the readings first and SHALL make the work
cheaper or lower the bound, rather than raise the budget.

#### Scenario: Eight views under budget with 10,000 systems

- **WHEN** the browser test adds 50,000 systems spread over the model bounds, sets each
  of the eight views at 500, 4,000, 20,000 and 120,000 light years, and calls the
  measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget with 10,000 systems

- **WHEN** the browser test adds 50,000 systems spread over the model bounds, sets the two
  views at 10 light years, one with the cursor at Sol and one at the galactic centre, and
  calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget with every marker in range

- **WHEN** the browser test adds 50,000 systems of one category whose `maxDrawRange` is
  300,000 light years, all within 10 light years of Sol, sets the view at 10 light years
  with the cursor at Sol, and calls the measurement function for 300 frames
- **THEN** the returned mean is under 16.7 ms. The camera sits 10 light years from the
  cursor and the set lies inside a ball of 10 light years, so a range runs from 0 to 20 and
  a sprite runs from the 40 CSS pixel cap down to 35.7. Part of the set falls outside the
  frustum at that zoom, so this scenario measures the largest sprites and not the largest
  number of them. The other half, every sprite forced to the cap together, was measured once
  at the old bound before the curve was written, to decide whether the cap of 16 could
  stand: 10,000 forced 40 CSS pixel glow markers within 10 light years of Sol at 1920 by
  1080, which writes 16 million fragments over a frame of 2 million pixels, drew in a mean
  of 1.617 ms against the 16.7 ms budget, so the close cap stayed at 16. No test holds that
  reading; this scenario is its record. This scenario now runs at five times that set, so it
  is the reading that says whether the new bound stands

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
**50,000** systems each naming 4 categories, and every category turned off in one call, the
sweep SHALL cost less than **2 milliseconds** on the main thread, and the page SHALL expose
the reading so a test can read it.

The sweep read 0.1 to 0.5 ms with 10,000 systems over 8 categories on 2026-09-21
(`e2e/systems.spec.ts`, "the sweep holds its budget"), so five times the set sits at 0.5 to
2.5 ms against this 2 ms budget. Where the reading fails, the implementation SHALL make the
sweep cheaper, or SHALL lower the set bound. It SHALL NOT raise this budget.

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

#### Scenario: A later category keeps a marker on the screen

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

#### Scenario: The colour still follows the first category

- **WHEN** the browser test adds a red category `A` and a blue category `B`, one system
  whose `categories` are `B` then `A`, keeps both categories on, draws a frame and reads
  the marker's pixel
- **THEN** the pixel is the blue of `B`, because the first category the record names is on

  The primary category is now the **first entry of `categories`**. The scenario keeps its
  name, because the rule it reads is unchanged: with every category on, the marker takes
  the colour of the first one the record names.

#### Scenario: The sweep holds its budget

- **WHEN** the browser test adds 50,000 systems over 8 categories, each system naming 4 of
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

## REMOVED Requirements

### Requirement: The set holds up to 10,000 systems

**Reason**: The bound moves to 50,000, and the requirement's name carries the number, so
it is replaced by the requirement "The set holds up to 50,000 systems" above.

**Migration**: A host that relied on `over-capacity` at 10,001 records now receives those
records. A host that wants a smaller set holds its own count: the library rejects at the
new bound alone. No call, option or type changes.
