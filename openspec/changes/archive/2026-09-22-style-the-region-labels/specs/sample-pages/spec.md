## ADDED Requirements

### Requirement: A sample page places the region labels

The requirement "Every sample draws on the GPU" reads a block of canvas pixels at the
middle of the frame and the console errors. Neither reading sees a DOM element, so the
suite stayed green while the region labels of all nine sample pages stacked in the top
left corner of the page. This requirement closes that gap.

The browser suite SHALL read where the region labels of a sample page sit, and not only
that the canvas drew. A sample page carries a canvas and the shared stylesheet, and no
rule of its own for a library element, so it is the reading that shows whether the
library places its own overlay elements without help from the page.

The reading SHALL run on `spheres-and-lines`, which opens at 900 light years with a
pitch of -25 degrees, so the frame holds the horizon and the sweep places a label on
load. A sample that opens outside the band shows no label, and a count of 0 would pass
the reading while saying nothing.

Five of the nine samples reach the band, and `spheres-and-lines` and `the-camera` are
the two that reach it with no camera move. The reading SHALL NOT use `the-camera`: its
last line is `await map.flyTo({ system: 'Achenar', distance: 200 })`, so the page moves
the camera on load and a reading taken at an unpinned moment lands somewhere in or after
that flight. `spheres-and-lines` sets a start view and makes no flight, so its frame
holds still.

#### Scenario: A sample page's labels are positioned

- **WHEN** the browser suite opens `examples/spheres-and-lines/` of the built site,
  waits for the canvas to draw, and reads the computed `position` of every
  `.region-label`
- **THEN** the count is above 0 and every one reads `absolute`

#### Scenario: A sample page's labels are not in one corner

- **WHEN** the same reading takes each label's bounding box
- **THEN** no two boxes share the same top left point, and no box lies wholly inside the
  48 CSS pixel square at the top left corner of the viewport
