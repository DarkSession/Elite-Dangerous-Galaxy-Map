## ADDED Requirements

### Requirement: The HUD lays out as two drawers below 1400 pixels

The HUD SHALL take a second layout at a viewport width of **less than 1400 CSS pixels**. The
layout SHALL be chosen by that width alone, in one `@media` rule of the HUD's own style
sheet. The HUD SHALL NOT read the user agent, SHALL NOT call `matchMedia`, SHALL NOT read a
touch capability and SHALL take no new option to choose it. A wide window that the user
narrows past 1400 pixels SHALL take the narrow layout without a reload, and a narrow window
the user widens SHALL take the wide one.

The width is the rule because the fault is a width: the wide layout spends 316 pixels on the
left column, 380 on the information panel and 44 of margin, which is 740 pixels of chrome.
A 1366-pixel laptop with both columns open keeps 626 pixels of map between them, and a
412-pixel phone has 740 pixels of chrome on a 412-pixel screen. A rule written on the pointer
type would leave a narrow desktop window broken and would break a wide touch screen that is
not: this layout is for the width, and a mouse at 1366 pixels gets it as a finger does.

**This change states two breakpoints, and this requirement holds the wider one.** Below 1400
pixels the columns become drawers, which is a space fault. Below 720 pixels the top bar
wraps, the region name goes, every control takes a 44-pixel floor and the dataset library
fills the screen, which are finger-and-width faults. The requirements below name 720 where
they mean the narrower one. Between 721 and 1399 pixels the HUD therefore has the drawers,
the one-row bar with the region name in it, and the controls at the sizes a pointer gets.

**The two panel columns become drawers.** In the narrow layout:

- The **left drawer** holds the category panel and the map options panel, which the wide
  layout puts in the left column. It SHALL be against the left edge, the full height of the
  HUD.
- The **right drawer** holds the information panel. It SHALL be against the right edge, the
  full height of the HUD.
- Each drawer SHALL be `min(88vw, 360px)` wide. The `88vw` arm binds below about 409
  pixels, which is where most phones sit: a 360-pixel screen gives a 316.8-pixel drawer and
  leaves 43.2 pixels of map beside it. At and above 409 the 360-pixel arm binds, so a
  412-pixel screen leaves 52 pixels and a 720-pixel one leaves 360.
- A drawer SHALL slide in and out over **260 ms**. Under `prefers-reduced-motion: reduce`
  it SHALL move with no transition. The sheet already drops the transition of the category
  list and the row chevron under that query, and the drawers and the edge tabs join them.

**At most one drawer is open.** The HUD root SHALL carry a `data-panel` attribute whose
value is `left` or `right` while that drawer is open. Opening one SHALL close the other.

**The narrow layout is in force when the left edge tab is drawn.** The HUD SHALL take that
reading from the document, and SHALL name no width, call no `matchMedia` and read no user
agent of its own. The media query stays the one place the width is written, and the script
asks the document what the query decided.

**Drawer state SHALL be written and read only while the narrow layout is in force.**

- A call that opens a drawer SHALL write nothing when the layout is not in force.
- The `Escape` step below SHALL read the drawer state as **closed** when the layout is not
  in force, whatever the attribute holds. That is the one reading a user can feel.
- Each tab's `aria-expanded` SHALL be written from the same reading, so a tab that the
  layout draws never states an open drawer that no rule draws. A tab the layout does not
  draw is `display: none` and out of the accessibility tree, so the attribute it still
  holds from the narrow width reaches nobody, and the next call that opens or closes a
  drawer rewrites it.
- Clearing the attribute is allowed at any width.

The second rule is what the first one alone does not give. A user who opens a drawer in a
1200-pixel window and then drags the window out to 1600 is above the breakpoint with the
attribute still on the root: no rule of the sheet draws it there, but a reading that trusted
the attribute alone would swallow the next `Escape`, and every `Escape` after it, because the
same guard stops the clear. The stale attribute is therefore harmless by construction: no
rule draws it, no step reads it, and the next call that opens or closes a drawer overwrites
it.

**An open drawer SHALL be opaque, and SHALL be one sheet.** The mockup draws the drawer at
96 percent and blurs what is behind it. With the blur banned the remaining 4 percent lets the
top bar's own text read through the drawer, so the drawer takes a flat opaque colour instead.
The drawer also carries the colour and the border for what is inside it: the wide layout
draws the category panel and the map options panel as two bordered boxes with 12 pixels of
map between them, and inside a drawer that band reads as a seam across the sheet. One rule
keeps the line that separates the two.

**A closed drawer is not there.** A closed drawer SHALL be `visibility: hidden` once it has
finished moving. It therefore takes no pointer event, holds no element the Tab key can
reach, and paints nothing. Without this a user tabbing through the page would land in a
panel that is off the screen.

**Two edge tabs open and close the drawers.** Each SHALL be a button on the vertical middle
of its own edge, 30 CSS pixels wide, holding a chevron and a vertical label. Below 720 pixels
the 44-pixel floor below grows it to 44. The tab SHALL move with its drawer, and SHALL sit
**beyond** the drawer's outer edge while the drawer is open, as
`.design/Galaxy Map HUD Mobile.dc.html` draws it, so the open drawer shows its whole width
and nothing of the drawer is under the tab. On a screen whose width is near the drawer's, the
open tab then overlaps the closed one; the open tab SHALL be the one on top, so the tap that
closes the open drawer always lands.
The left tab's label SHALL read `FILTERS`. The right tab's label SHALL read `SYSTEM` while a
system is selected and `DATA` while none is. Each tab SHALL carry `aria-expanded`, which
reads `true` while its own drawer is open.

**A scrim covers the map while a drawer is open.** It SHALL cover the whole HUD below the
drawers and their tabs, which includes the top bar. A click or a tap on it SHALL close the
open drawer. The top bar is under the scrim on purpose: the dataset field and the step
arrows are then not reachable while a drawer is open, so neither needs a rule for that case.

**Selecting a system opens the right drawer.** Any change of the selection to a system SHALL
open it, whether a tap on a marker or a click on a row of a category list made the change.
Clearing the selection SHALL NOT close it: the drawer then shows the empty state the
requirement below states. In the wide layout no selection opens or closes anything, because
there is nothing to open.

**The narrow layout adds no per-frame work.** It is style and one attribute. The HUD's tick
SHALL do the same work in either layout, and the requirement "The HUD holds the frame budget"
SHALL hold unchanged. The scrim is the one new element that covers the whole canvas while a
drawer is open, and it SHALL be a flat colour with no filter, so the compositor draws one
translucent layer over the frame and the browser does no per-frame work of its own on it.
That is the same reasoning the `backdrop-filter` ban rests on: a blurred overlay is re-blurred
every frame and a flat one is not. **The claim SHALL be read and not assumed.** The scrim's
cost SHALL be measured as the change in the animation frame interval between a closed drawer
and an open one at the same size, and the open reading SHALL be no more than **1 ms** worse.

#### Scenario: The scrim costs no measurable frame time

- **WHEN** the timed browser test adds 50,000 systems at 412 by 880, draws 120 frames with no
  drawer open and reads the mean animation frame interval, then opens the left drawer, draws
  120 frames and reads it again
- **THEN** the second mean is no more than 1 ms above the first The bounds the wide layout holds are the bounds the drawers hold: the
category panel's 256 rows and its row budget scroll inside the left drawer exactly as they
scroll inside the left column.

**No drawer, tab or scrim SHALL carry `backdrop-filter`**, by the requirement "The HUD names
its elements and carries its own style". The drawers cover the moving map as the wide
layout's panels do, so the same measurement binds them. The mockup
`.design/Galaxy Map HUD Mobile.dc.html` draws the drawers, the tabs and the top bar with the
blur, and the sheet departs from the mockup on purpose, as it already does at the wide width.

#### Scenario: A phone viewport puts the panels in drawers

- **WHEN** the browser test opens the map with the HUD at 412 by 880 and reads the bounding
  box of the category panel's drawer, of the information panel's drawer and of the canvas
- **THEN** both drawers are off the screen, the canvas is not covered by either, and the HUD
  root carries no `data-panel` attribute

#### Scenario: A tab opens its drawer and the other tab closes it

- **WHEN** the browser test at 412 by 880, in a context with `hasTouch`, taps the left tab,
  waits 400 ms and reads the drawer's box and the root's `data-panel`, then taps the right
  tab, waits 400 ms and reads both drawers
- **THEN** the first reading puts the left drawer on the screen with `data-panel` at `left`,
  and the second puts the right drawer on the screen, the left drawer off it, and
  `data-panel` at `right`

#### Scenario: The open drawer hides what is behind it

- **WHEN** the browser test at 412 by 880 opens the left drawer and reads its computed
  background colour and the gap between the panels inside it
- **THEN** the colour is fully opaque and the gap is 0

#### Scenario: Reduced motion drops the slide

- **WHEN** the browser test at 412 by 880, in a context with `reducedMotion: 'reduce'`,
  reads the computed `transition-duration` of each drawer, of each edge tab and of the
  scrim, with one drawer open and with both closed
- **THEN** every reading is `0s`

#### Scenario: The drawer width follows the viewport

- **WHEN** the browser test opens the left drawer at 360 by 800 and reads its width, then
  sets the viewport to 412 by 880 and reads it again
- **THEN** the first is 316.8 and the second is 360, each within 1 CSS pixel, so both arms of
  the `min()` are read

#### Scenario: The layout crosses the breakpoint without a reload

- **WHEN** the browser test opens the map with the HUD at 1600 by 900, reads whether the
  region name is shown and whether the left edge tab is shown, sets the viewport to 412 by
  880 and reads both again, then sets it back to 1600 by 900 and reads both a third time
- **THEN** the first and the third readings show the region name and no tab, and the second
  shows the tab and no region name

#### Scenario: A drawer open at the narrow width is inert at the wide one

- **WHEN** the browser test at 412 by 880 selects a system and opens the left drawer, sets
  the viewport to 1600 by 900, reads whether either drawer, either tab and the scrim are
  drawn, then presses `Escape` once and reads the selection
- **THEN** none of the five is drawn and the one press cleared the selection

#### Scenario: The wide layout writes no drawer state

- **WHEN** the browser test at 1600 by 900 selects a system, waits 400 ms, reads the root's
  `data-panel`, presses `Escape` once and reads the selection
- **THEN** the attribute is absent and the one press cleared the selection

#### Scenario: A closed drawer takes no focus

- **WHEN** the browser test at 412 by 880 waits 400 ms with both drawers closed and counts
  the elements inside them that the Tab key can reach
- **THEN** the count is 0

#### Scenario: The scrim closes the drawer on a tap

- **WHEN** the browser test at 412 by 880, in a context with `hasTouch`, taps the left edge
  tab, waits 400 ms, taps the scrim in the middle of the map, waits 400 ms and reads
  `data-panel` and the drawer's box
- **THEN** the tap opened the drawer, the attribute is absent after the second tap, and the
  drawer is off the screen

#### Scenario: The scrim covers the top bar

- **WHEN** the browser test at 412 by 880 opens the left drawer and reads the element at the
  centre of the reset button and the element over the bar beside the drawer
- **THEN** the first is not the button and is inside the drawer, because the button's middle
  falls in the drawer's 360 pixels, and the second is the scrim

#### Scenario: Selecting a system opens the right drawer

- **WHEN** the browser test at 412 by 880 selects a system through the map handle, waits
  400 ms and reads `data-panel`, then opens the left drawer, clicks a row of a category
  list, waits 400 ms and reads `data-panel` and the selection
- **THEN** both readings are `right` and the second names the system the row held

#### Scenario: The right tab names what the drawer holds

- **WHEN** the browser test at 412 by 880 reads the right tab's label with no selection,
  selects a system and reads it again
- **THEN** the first reads `DATA` and the second reads `SYSTEM`

#### Scenario: The wide layout is unmoved

- **WHEN** the browser test opens the map with the HUD at 1600 by 900 and reads the left
  column's box, the information panel's box, the top bar's height, whether the region name
  is shown, and whether the tabs or the scrim are shown
- **THEN** the left column is 316 pixels wide at `left: 22px`, the information panel is 380
  pixels wide, the bar is 54 pixels high, the region name is shown, and neither tab nor the
  scrim is shown

#### Scenario: No element of the narrow layout blurs its backdrop

- **WHEN** the browser test at 412 by 880 opens each drawer in turn and reads the computed
  `backdrop-filter` of every element under the HUD root
- **THEN** every one reads `none`

### Requirement: The top bar wraps into two rows below 720 pixels

At a viewport width of **720 CSS pixels or less**, the top bar SHALL wrap into two rows. The
title, the zoom readout and the reset button SHALL take the first row, in that order. The
dataset field and its step arrows SHALL take the second row and SHALL fill its width. The bar
SHALL take the height its two rows need, in place of the fixed 54 pixels the wide layout
gives it.

**The zoom readout and the reset button SHALL NOT be clipped.** The wide layout gives the
left group and the right group an even share of the bar, which on a 412-pixel row leaves each
about 190 pixels and cuts all three items: the title reads GALACTIC CAR…, the zoom reads
ZOOM 60,0… and the reset label paints past its own border. A cut number is a wrong number, so
the right group SHALL take the width it needs and the title SHALL take what is left. The
title is the one of the three that says the same thing short, and it already ends in an
ellipsis where it must. **The region name SHALL NOT be shown** at this width: a 412-pixel row cannot hold
the title, the zoom, the reset button and a region name, and the region name is the one of
the four that answers a question the user can ask again by moving the camera.

Above 720 pixels the bar is what the requirement "The top bar names the map, the region and
the zoom" states, drawers or no drawers. A 1366-pixel laptop has the room for one row and for
the region name, and it keeps both.

#### Scenario: The top bar takes two rows and drops the region name

- **WHEN** the browser test at 412 by 880 with a catalog reads the top of the title, of the
  reset button and of the dataset field, and reads whether the region name is shown
- **THEN** the title and the reset button share a top, the dataset field's top is below
  both, and the region name is not shown

#### Scenario: The zoom readout and the reset button are whole

- **WHEN** the browser test at 412 by 880 on the demo page reads the client width and the
  scroll width of the title, of the zoom readout and of the reset button
- **THEN** the zoom readout and the reset button each have a scroll width no greater than
  their client width, and the title's scroll width passes its client width, because the
  title is the one that gives way

#### Scenario: The band between the two breakpoints takes the drawers alone

- **WHEN** the browser test opens the map with the HUD and a catalog at 1024 by 768 and reads
  whether the left edge tab is shown, whether the region name is shown, the top bar's height,
  and the bounding box of a category row's dot
- **THEN** the tab is shown, the region name is shown, the bar is 54 pixels high, and the dot
  is the size it is at 1600 by 900

### Requirement: The right drawer states that nothing is selected

The information panel hides itself while nothing is selected, which the requirement "The
information panel shows the selected system" states. In the narrow layout the right drawer
SHALL therefore hold a **placeholder** beside the panel, which is shown while the panel is
hidden and hidden while the panel is shown. The placeholder SHALL read `NO SYSTEM SELECTED`
and `TAP A MARKER ON THE MAP`, and SHALL carry a heading that reads `SYSTEM DATA` and a
close button, so the drawer the user opened is never empty and always closes from inside.

The placeholder SHALL NOT be shown at 1400 pixels or more. A user of the wide
layout who has selected nothing sees the map where the information panel would be, which is
what the wide layout does today, and this change does not move it.

The wrapper that holds the panel and the placeholder SHALL NOT change the wide layout. The
information panel's box at 1600 by 900 SHALL be what it is today.

#### Scenario: The empty drawer states why it is empty

- **WHEN** the browser test at 412 by 880 opens the right drawer with no selection and reads
  the drawer
- **THEN** it holds the placeholder text and the information panel is hidden

#### Scenario: A selection replaces the placeholder

- **WHEN** the browser test selects a system, waits 400 ms and reads the right drawer, then
  clears the selection, waits 400 ms and reads it again
- **THEN** the first holds the information panel and no placeholder, and the second holds
  the placeholder and no panel

#### Scenario: The placeholder is not in the wide layout

- **WHEN** the browser test opens the map with the HUD at 1600 by 900 with no selection and
  reads whether the placeholder is shown
- **THEN** it is not

### Requirement: Every button and input is 44 pixels below 720 pixels

At 720 CSS pixels or less, **every `button` and every `input` under the HUD root that is drawn**
SHALL measure at least **44 CSS pixels** on each side. **The drawer's edge tab is the one
exemption, and it is a width alone**: the tab SHALL stay 30 CSS pixels wide and SHALL take
the 44-pixel height.

The exemption is a geometry the screen forces. A 412-pixel screen holds a 360-pixel drawer
and leaves 52 pixels beside it. Two 44-pixel tabs need 88 of those 52, so they would overlap
on their middles, and a tap meant for the closed tab would land on the open one: the user
could not move from one drawer to the other in one tap. At 30 pixels the open left tab is 360
to 390 and the closed right tab is 382 to 412, so they overlap by 8 and neither covers the
other's middle. 30 pixels is also what the mockup draws.

The tab is not a small target for it. Its vertical label and its padding make it about 80
pixels tall, so the target is 30 by 80 on the screen edge, where the thumb rests already.

"Drawn" is what `checkVisibility()` answers. The sheet hides an element that is not wanted
with `[hidden] { display: none !important }`, so the information panel's buttons read 0 by 0
while nothing is selected, the placeholder's close button reads 0 by 0 while something is,
and the dialog's controls read 0 by 0 while the dialog is shut. A rule cannot size a box that
is not laid out, and a test that read those would fail on every run. The rule is one
`min-width` and `min-height` over the two element names, plus the one `min-width: 0` the
exemption needs. It is not a list of selectors: a list leaves a control out on the day
someone adds one, and the fault then reaches a user's thumb rather than the suite.

44 pixels is the smallest target a finger hits without a second try. The wide layout draws
several of these at 20 to 30 pixels, which a mouse hits and a finger does not.

**The rule moves the hit area and not the drawing.** The small round controls draw their
mark on an element inside the button: a category row's dot holds a 12-pixel swatch with the
category's colour on it, and a copy button holds an inline icon. A 44-pixel button is
therefore a larger box around the same mark. The controls that draw their own border — the
close buttons, the dataset step arrows, the collection chips — do grow, which is what the
mockup draws for them.

The elements the rule does not reach keep their sizes: the category row's chevron is an SVG
that carries `aria-hidden` and is not a button, and the switch's track and knob are drawn
inside the switch's own button.

**The wide layout's sizes SHALL NOT move.** The rule is in the media query alone, so no
reading of the wide layout changes and its committed look baseline is unmoved.

#### Scenario: Every drawn button and input clears the floor

- **WHEN** the browser test at 412 by 880 reads the bounding box of every drawn `button` and
  `input` under the HUD root in each of four states — the left drawer open with a category
  list open, the right drawer open with a system selected, the right drawer open with nothing
  selected, and the dataset dialog and then the lightbox open
- **THEN** each one measures at least 44 CSS pixels on each side, except the two edge tabs,
  which measure 30 wide and at least 44 high, and the four states between them draw every
  button and input the HUD builds

#### Scenario: One tap moves from one drawer to the other

- **WHEN** the browser test at 412 by 880, in a context with `hasTouch`, opens the left drawer
  with a tap on its tab, reads the element at the middle of each tab, then taps the right tab
  once and reads both drawers
- **THEN** the element at each tab's middle is that tab, the one tap put the right drawer on
  the screen and the left drawer off it, and `data-panel` reads `right`

#### Scenario: The dot keeps its swatch

- **WHEN** the browser test at 412 by 880 reads the bounding box of a category row's dot and
  of the swatch inside it
- **THEN** the dot is at least 44 by 44 and the swatch is the size it is at 1600 by 900

#### Scenario: The wide layout keeps its sizes

- **WHEN** the browser test at 1600 by 900 reads the bounding box of a category row's dot, of
  a copy button of the information panel and of the information panel's close button
- **THEN** the dot and the copy button are 20 by 20 and the close button is 24 by 24

## MODIFIED Requirements

### Requirement: The top bar names the map, the region and the zoom

The top bar SHALL hold three groups: on the left the title and the name of the region under
the cursor, in the **centre** the dataset field when the catalog holds an entry, and on the
right the zoom distance and a **reset view** button.

**This requirement states the bar above 720 pixels.** Below that the bar wraps into two
rows and drops the region name, which the requirement "The top bar wraps into two rows below
720 pixels" states. Every rule in this requirement about one row, about the even share the
side groups take and about where the field sits is a rule for the wide layout, and every
scenario of it is read at 1600 by 900.

The title SHALL be the `title` of the options, and `GALACTIC CARTOGRAPHICS` when the
options name none.

**The dataset field sits at the centre of the bar.** The left group and the right group
SHALL take an even share of the space the centre group leaves, so the field is centred on
the bar's own width and not merely placed between the two groups. Where the text of the
left or the right group is too long for its share, that group SHALL clip its text with an
ellipsis rather than push the field off centre. The divider that sat beside the field is
gone with the field's old place beside the region name.

With `datasetArrows` on, the **centre group** SHALL hold that place: the arrows and the
counter sit inside it, so the group is centred on the bar and the field sits a little left
of the middle. The counter follows the next arrow and has no counterpart before the
previous arrow, which is what the mockup draws, so the field moves left by about half the
counter's width. The arrows are off by default, which `dataset-catalog` states, so the
field itself is centred on every map that asks for none.

The dataset field is what `dataset-catalog` states. It SHALL NOT replace the region name:
the region name answers where the camera is looking and the dataset field answers what the
map is showing, and the two are not the same question. With an empty catalog the bar SHALL
hold the left group and the right group and nothing between them, with no gap where the
field would sit.

The region name SHALL be `regionNameAt` of the view's cursor, which `galactic-regions`
defines. The cursor is the point the camera looks at, so the name answers "where am I
looking". A cursor the region grid does not cover SHALL show an empty name and no
placeholder text.

The zoom SHALL be the view's distance in whole light years, with a thousands separator and
the unit `LY`, for example `1,500 LY`.

The reset view button SHALL set the default view, which `map-navigation` gives as the
cursor at Sol, a distance of 60,000 light years, a pitch of 35 degrees and a yaw of 0.

The region name and the zoom follow the view, which changes every frame while the user
moves. The HUD SHALL rewrite them at most **10 times a second**, and SHALL NOT write the
DOM in a tick where the formatted text has not changed.

#### Scenario: The bar reads the view

- **WHEN** the browser test with the HUD on sets the view to the cursor Sol at a distance
  of 1,500 light years, and waits 200 ms
- **THEN** the zoom reads `1,500 LY` and the region reads `Inner Orion Spur`

#### Scenario: Reset returns the default view

- **WHEN** the browser test sets a view far from the default, clicks **reset view**, and
  reads the view
- **THEN** the view is the cursor (0, 0, 0), the distance 60,000, the pitch 35 and the yaw 0

#### Scenario: The bar does not rewrite itself every frame

- **WHEN** the browser test holds the view still with the HUD on, waits 200 ms for the
  first write to settle, and then counts the writes to the zoom element over 120 frames
- **THEN** the count is 0

#### Scenario: The bar carries the dataset field only with a catalog

- **WHEN** the browser test builds one map with a catalog of two entries and one with no
  `datasets` option, and reads each bar
- **THEN** the first bar holds the dataset field between the region name and the zoom, and
  the second holds the title, the region name, the zoom and the reset button and nothing
  else

#### Scenario: The dataset field is centred on the bar

- **WHEN** the browser test opens a map with the HUD and a catalog at 1600 by 900, and
  reads the horizontal centre of the dataset field and of the top bar
- **THEN** the two are within 2 CSS pixels of each other

#### Scenario: The centre group is centred while the arrows are on

- **WHEN** the browser test opens a map with the HUD, a catalog and `datasetArrows` true at
  1600 by 900, and reads the horizontal centre of the centre group and of the top bar
- **THEN** the two are within 2 CSS pixels of each other

#### Scenario: A long title does not push the field off centre

- **WHEN** the browser test builds a map with a catalog and a title of 60 characters, reads
  the horizontal centre of the dataset field and of the top bar, and reads whether the
  title element's scroll width passes its client width
- **THEN** the two centres are within 2 CSS pixels of each other and the title is clipped

#### Scenario: The narrow bar gives the field a row of its own

- **WHEN** the browser test at 412 by 880 with a catalog reads the width of the dataset
  field's group and the width of the bar's content box
- **THEN** the two are within 2 CSS pixels of each other, so the field fills its row and the
  centring rules of this requirement do not apply to it

### Requirement: The HUD does not take the map's input

The HUD root SHALL take no pointer events. Each panel SHALL take them. A pixel of the canvas
that no panel covers SHALL reach the map's controls unchanged.

A wheel over a panel SHALL scroll the panel and SHALL NOT zoom the map. A drag that starts
on a panel SHALL NOT orbit the map and SHALL NOT move the cursor.

**The scrim of the narrow layout is the one element that covers the map on purpose.** While
a drawer is open, no pixel of the canvas reaches the map's controls, and a tap anywhere
closes the drawer. That is the scrim's whole job: the user has a panel open and the next tap
is about the panel. While no drawer is open the scrim takes no pointer event and every pixel
reaches the map as this requirement states.

#### Scenario: A drag between the panels still orbits

- **WHEN** the browser test with the HUD on presses the left button in the middle of the
  canvas, moves 60 pixels right and 30 down, and releases
- **THEN** yaw and pitch change by the amounts `map-navigation` states

#### Scenario: A wheel over a panel does not zoom

- **WHEN** the browser test reads the zoom distance, turns the wheel 5 notches with the
  pointer over the category panel, and reads the distance again
- **THEN** the two readings are equal

#### Scenario: A drag on a panel does not orbit

- **WHEN** the browser test presses the left button on the map options panel, moves 100
  pixels, and releases
- **THEN** yaw and pitch have not changed

#### Scenario: The map takes the input with no drawer open

- **WHEN** the browser test at 412 by 880 with both drawers closed drags 60 pixels right and
  30 down in the middle of the canvas
- **THEN** yaw and pitch change by the amounts `map-navigation` states

### Requirement: Escape closes the lightbox, then the panel

The HUD SHALL listen for `Escape` on the document. The key SHALL unwind one step at a
time, in this order:

1. It SHALL close the dataset dialog when one is open, and change nothing else.
2. It SHALL close the lightbox when no dialog is open and a lightbox is open.
3. It SHALL close the open drawer when neither is open, the narrow layout is in force and a
   drawer is open, and SHALL NOT clear the selection.
4. It SHALL clear the selection when none of the three is open and a system is selected.
5. It SHALL do nothing when none of the four is there.

The dataset dialog comes first because it is the last thing the user opened and it covers
the panel under it. `dataset-catalog` states what the dialog is; this requirement states
where the key reaches it, so the order lives in one place and not in two.

The drawer comes before the selection because the drawer is what the user opened last and
what covers the map. A key that cleared the selection first would leave the user looking at
a drawer that had just emptied itself.

**Step 3 never fires at 1400 pixels or more.** The requirement "The HUD lays out as two drawers
below 1400 pixels" states that every reading of the drawer state is **closed** while the narrow
layout is not in force, whatever the `data-panel` attribute holds. The wide layout therefore
reads the same four steps it reads today, and one press still clears the selection — including
right after a window that was narrow with a drawer open becomes wide.

The key SHALL NOT be taken from a form field the host owns: the HUD SHALL act on `Escape`
only, and SHALL let every other key through.

#### Scenario: Escape unwinds one step at a time

- **WHEN** the browser test selects a system, opens a lightbox, presses `Escape`, reads the
  lightbox and the selection, presses `Escape` again and reads both again
- **THEN** the first press closes the lightbox and keeps the selection, and the second
  clears the selection

#### Scenario: Escape with nothing open does nothing

- **WHEN** the browser test presses `Escape` with no selection and no lightbox, and reads
  the view and the selection
- **THEN** neither changed

#### Scenario: Escape closes the dataset dialog first

- **WHEN** the browser test selects a system, opens the dataset dialog, presses `Escape`,
  reads the dialog and the selection, presses `Escape` again and reads both again
- **THEN** the first press closes the dialog and keeps the selection, and the second clears
  the selection

#### Scenario: Escape closes the drawer before the selection

- **WHEN** the browser test at 412 by 880 selects a system, waits 400 ms for the right
  drawer, presses `Escape`, waits 400 ms and reads `data-panel` and the selection, then
  presses `Escape` again and reads both again
- **THEN** the first press closes the drawer and keeps the selection, and the second clears
  the selection
