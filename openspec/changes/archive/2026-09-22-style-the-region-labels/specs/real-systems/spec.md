## ADDED Requirements

### Requirement: The overlay host the library makes follows the canvas's box

The requirement "The map is created through a library entry point that returns a handle"
says that with no `labelHost` the library creates its own overlay element in the canvas's
parent, "so a host that gives a canvas alone gets a working map". This requirement says
what that element does after it is made.

The overlay the library makes clips its children with `overflow: hidden`, it sits at the
origin of the canvas's parent, and it carries a width and a height in CSS pixels. Today
it takes the width and the height once, at the moment it is made, it never takes the
canvas's offset at all, and nothing writes any of the four again. Three readings follow,
and each one hides labels the placement meant to show.

**The overlay SHALL cover the canvas's own box, and SHALL take that box again whenever
the canvas moves or resizes.** The placement works in the canvas's viewport, because the
renderer reads the viewport from the canvas's own box, and the overlay is what turns
those coordinates into places on the page. The box is where the canvas is as well as how
big it is: a host may give the canvas a box of its own inside a larger element, which is
why the library already reads the canvas's offset to centre the loading picture. The
overlay reads no offset today, so on such a page every label is off by that offset, and
after a window resize the overlay still clips to the old size and a label near the new
edge is cut off or gone.

**The rule SHALL hold whatever the page's own layout is.** An element's offset is
measured from its `offsetParent`, while the overlay's `left` resolves against its
containing block, and those are two different frames. The overlay SHALL be placed by a
reading that does not depend on the two frames agreeing.

A reading in Chromium measured where they agree and where they part. They agree on a
canvas in a static `body`, on a static wrapper, and on a wrapper made a containing
block by `position`, `transform` or `filter`. They part on a static `td`, `th` or
`table` ancestor, which is an `offsetParent` and is **not** a containing block for an
absolutely positioned element: the canvas there reads an offset of 0 while the overlay's
`left: 0` lands at the initial containing block's origin, so an overlay placed from the
offset sits at the table's left edge and every label is off by the cell's offset.

This rule SHALL apply only to the overlay the library makes. An overlay the options name
belongs to the host, and the library SHALL NOT write a place or a size on it.

**A canvas that measures 0 SHALL NOT give an overlay that stays 0.** A page that starts
the map while the canvas is hidden, or before the layout settles, measures 0 by 0 at that
moment. An overlay of 0 by 0 with `overflow: hidden` clips every child for good, so the
map draws and no label ever shows again, whatever the canvas grows to.

#### Scenario: The overlay follows a resize

- **WHEN** a browser test builds a map on a canvas with no `labelHost`, waits for
  `ready`, reads the overlay's box, resizes the window so the canvas grows, draws a
  frame, and reads the overlay's box again
- **THEN** the second reading equals the canvas's new box

#### Scenario: The overlay covers a canvas that is not at its parent's origin

- **WHEN** a browser test builds a map on a canvas that a positioned parent offsets by
  40 CSS pixels across and 24 down, waits for `ready`, draws a frame, and reads the
  overlay's client rect against the canvas's client rect
- **THEN** the two are equal

#### Scenario: The overlay covers a canvas with no positioned ancestor

- **WHEN** a browser test builds a map on a canvas that sits directly in a `body` that
  carries the browser's default margin and no positioned ancestor, waits for `ready`,
  draws a frame, and reads the same two client rects
- **THEN** the two are equal

  This is the plainest page a host can write. It does not separate the two readings:
  Chromium answers the canvas's offset from the document origin when the `offsetParent`
  is a static `body`, so an overlay placed from the offset lands correctly here too. The
  scenario below is the one that separates them.

#### Scenario: The overlay covers a canvas in a table cell

- **WHEN** a browser test builds a map on a canvas that sits in a static `td` of a table
  the page offsets, waits for `ready`, draws a frame, and reads the overlay's client
  rect against the canvas's client rect
- **THEN** the two are equal

  A static `td` is an `offsetParent` and is not a containing block for an absolutely
  positioned element, so the canvas's offset reads 0 while the overlay's `left: 0` lands
  at the initial containing block's origin. An overlay placed from the offset therefore
  sits at the table's left edge. This is the reading that fails against that
  implementation and passes against a reading of the two client rects.

#### Scenario: A label near the new edge still shows

- **WHEN** the same test sets a view inside the band where the region labels draw, and
  reads every `.region-label` box against the overlay's box after the resize
- **THEN** every label box lies inside the overlay's box

#### Scenario: A canvas that starts at zero gets a working overlay

- **WHEN** a browser test builds a map on a canvas whose parent is `display: none`, waits
  for `ready`, then shows the parent, gives the canvas a box, draws a frame and counts
  the labels
- **THEN** the overlay reads the canvas's box and the count is above 0

#### Scenario: An overlay the options name keeps its own size

- **WHEN** a browser test builds a map with a `labelHost` of its own that carries a size
  in a style rule, resizes the window, and reads that element's inline `left`, `top`,
  `width` and `height`
- **THEN** all four are empty, because the library wrote none of them
