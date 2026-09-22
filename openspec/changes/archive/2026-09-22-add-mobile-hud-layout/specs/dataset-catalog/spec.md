## ADDED Requirements

### Requirement: The dataset library fills the screen below 720 pixels

At a viewport width of **720 CSS pixels or less**, the dataset dialog SHALL fill the
viewport. `map-hud` states the breakpoint and states that the width alone chooses the
layout; this requirement states what the dialog does at that width.

- The dialog frame SHALL be the full width and the full height of the HUD, with no margin
  and no scrim showing around it. The wide layout draws it at `min(94%, 1040px)` by
  `min(84%, 680px)`, which on a 412 by 880 screen leaves a 12-pixel border of scrim and
  takes 141 pixels of height from the cards for nothing the user reads.
- The **chip row SHALL scroll sideways** and SHALL NOT wrap. It wraps at every width today.
  A catalog of eight collections wraps to four rows on a 412-pixel screen, which pushes the
  first card off the screen before the user has read one.
- The search box, the chips, the cards and the close button SHALL each clear the 44-pixel
  floor `map-hud` states.

**The card grid needs no rule of its own.** Its columns are `repeat(auto-fill, minmax(232px,
1fr))`, so a body narrower than 473 pixels already gives one column. A 412-pixel screen
therefore draws one card per row without this change, and adding a second rule for it would
be a second source for one behaviour.

Nothing else about the dialog changes. The search rule, the chip rule, the sort order, the
card contents, the `title`, the swatch colours, the header count line and the load behaviour
are what the requirement "The HUD carries a dataset field and a dataset library" states, at
either width.

The dialog SHALL hold a catalog of 256 entries at this width as it does at the wide one. The
grid is then one column of 256 cards inside the scrolling body. The rules of this requirement
change the frame and the chip row and leave the grid and the body alone, so the bound is the
one the wide layout's 256-entry reading takes.

#### Scenario: The dialog fills a phone screen

- **WHEN** the browser test at 412 by 880 with a catalog of 6 entries opens the dialog and
  reads the frame's bounding box
- **THEN** it is 412 by 880, within 1 CSS pixel on each side

#### Scenario: The cards take one column

- **WHEN** the browser test at 412 by 880 opens the dialog on a catalog of 6 entries and
  reads the left edge and the top of every card
- **THEN** every card shares one left edge and no two cards share a top

#### Scenario: The chip row scrolls sideways

- **WHEN** the browser test at 412 by 880 opens the dialog on a catalog of 8 collections and
  reads the chip row's scroll width, its client width and the top of every chip
- **THEN** the scroll width passes the client width and every chip shares one top

#### Scenario: The wide dialog is unmoved

- **WHEN** the browser test at 1600 by 900 opens the dialog on a catalog of 6 entries and
  reads the frame's bounding box and the left edges of the cards
- **THEN** the frame is 1040 by 680 within 1 CSS pixel, the cards hold more than one column, and the chip row
  of an 8-collection catalog wraps
