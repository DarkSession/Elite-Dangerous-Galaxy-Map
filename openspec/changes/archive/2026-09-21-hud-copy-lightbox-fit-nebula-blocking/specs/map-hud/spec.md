## ADDED Requirements

### Requirement: The information panel's readouts are selectable

The HUD root SHALL keep `user-select: none`. The **readouts of the information panel**
SHALL take `user-select: text`, so the reader can drag over one and copy it with the
keyboard.

A readout is a value the panel states about the selected system. These SHALL be
selectable:

- the system name in the panel header,
- the value of every field of the grid, which holds the position, the worked-out fields,
  the fields the record carries and the host's grid values,
- the description the panel draws, and the text of every section the host adds, including
  every element the Markdown draw builds inside them,
- the name of every category chip.

Everything else SHALL stay unselectable. That is every field label, every section title,
every button, the panel's close control, the loading line, the thumbnails and their
captions, and every other panel of the HUD: the top bar, the category browser, the map
options panel, the dataset dialog and the lightbox.

The copy buttons SHALL stay and SHALL keep working. A button is the one-click route for
the fields that carry one, which are the system name and the position, and any value the
host marks copyable; a selection is the route for a value that carries none.

A selection SHALL NOT reach the map. A drag that starts on the panel selects text and
SHALL NOT turn, move or zoom the camera, which the requirement "The HUD does not take
the map's input" already fixes for the pointer.

#### Scenario: A field value can be selected

- **WHEN** the browser test selects a system, selects the text of the `POSITION` field's
  value through the document's selection, and reads what the selection holds
- **THEN** the selection text is the value the field shows

#### Scenario: The labels and the controls stay unselectable

- **WHEN** the browser test selects a system and reads the computed `user-select` of the
  panel's field labels, its section titles, its close button, its copy buttons, its
  footer buttons and its thumbnails
- **THEN** every one reads `none`

#### Scenario: The readouts read as text

- **WHEN** the browser test selects a system that carries a description, a category and a
  host section, and reads the computed `user-select` of the system name, every field
  value, the description, the section text and every category chip
- **THEN** every one reads `text`

#### Scenario: The other panels stay unselectable

- **WHEN** the browser test opens the category browser, the map options panel and the
  dataset dialog, and reads the computed `user-select` of the text inside each
- **THEN** every one reads `none`

#### Scenario: A drag on the panel does not move the camera

- **WHEN** the browser test selects a system, reads the view, drags the pointer 120 pixels
  across the panel's description, and reads the view again
- **THEN** the cursor, the distance, the yaw and the pitch are unchanged

## MODIFIED Requirements

### Requirement: The images open in a lightbox

The panel SHALL show each image of the record as a thumbnail in a grid of two columns,
with its caption over it. The record holds at most 8 images, which `real-systems` caps.

An image SHALL load lazily and SHALL send no referrer, so the host's page does not leak
its address to the server the image comes from. An image that fails to load SHALL leave the
thumbnail's placeholder in view with the caption still readable, and SHALL NOT leave a
broken image icon.

A click on a thumbnail SHALL open a lightbox over the whole map, which shows the image
with its caption and the system's name. A click anywhere in the lightbox, and the
`Escape` key, SHALL close it.

**The lightbox SHALL draw the image at a stated size**, which it writes on the image
element as a `width` and a `height` in CSS pixels. Two caps give that size and the lesser
wins.

**The pixel cap holds the image to its own pixels times the device pixel ratio.** A 400 by
300 image therefore draws at 400 by 300 CSS pixels on a 1x screen and at 800 by 600 on a 2x
one, where the second is the same picture at the same size on the glass. The cap SHALL
follow the device pixel ratio the page reads at the time it is applied, and SHALL be
applied again when the ratio changes.

**The room cap keeps the image inside the map.** The drawn size SHALL also stay inside
86 percent of the HUD's width, inside 1180 CSS pixels of width and inside 82 percent of the
HUD's height, which are the caps the frame carries today. The lesser of the two caps wins,
so a 4,000 pixel image still fits the map and a 400 pixel one draws at its own pixels.

**An image with a natural size of 0 SHALL be given no size at all**, because there is no
aspect ratio to hold it to. The frame then stays at its smallest size.

**The size SHALL be written when the lightbox opens and when the image loads.** An image
the box already holds raises no `load`, so an open that wrote the size only on `load` would
leave the size of an earlier image on it, or no size at all.

**The image SHALL keep its aspect ratio** under both caps.

**The frame SHALL size to the drawn image**, plus its own border, and SHALL NOT hold a
fixed aspect ratio. The caption and the close control sit outside the frame's box and add
nothing to its size. The frame SHALL carry
a smallest size, so a frame with no image in it still reads as a frame: an image that has
not loaded and an image that failed to load both leave the frame at or above that size with
the caption in the middle of it.

#### Scenario: A thumbnail opens the lightbox

- **WHEN** the browser test selects a record with two images, clicks the first thumbnail,
  and reads the lightbox
- **THEN** the lightbox is shown and holds the first image's URL, its caption and the
  system's name

#### Scenario: A small image is not enlarged

- **WHEN** the browser test runs at a device pixel ratio of 1, opens the lightbox on a
  400 by 300 image in a viewport large enough for it, and reads the drawn size of the
  image element
- **THEN** the drawn size is 400 by 300 CSS pixels, within one pixel

#### Scenario: The frame does not run past the image

- **WHEN** the browser test reads the drawn size of the lightbox frame in the reading above
- **THEN** the frame is no more than 48 CSS pixels wider and no more than 48 CSS pixels
  taller than the image it holds

#### Scenario: The cap follows the device pixel ratio

- **WHEN** the browser test runs the same reading at a device pixel ratio of 2
- **THEN** the drawn size is 800 by 600 CSS pixels, within one pixel

#### Scenario: The same image keeps its size when the lightbox opens again

- **WHEN** the browser test opens the lightbox on a 400 by 300 image, closes it, opens it
  again on the same thumbnail, and reads the drawn size
- **THEN** the drawn size is 400 by 300 CSS pixels, within one pixel, and equals the size
  of the first open

#### Scenario: A large image still fits the map

- **WHEN** the browser test opens the lightbox on an image of 4,000 by 3,000 pixels in a
  viewport of 1280 by 720 CSS pixels
- **THEN** the drawn width is at or below both 1180 CSS pixels and 86 percent of the HUD's
  width, the drawn height is at or below 82 percent of the HUD's height, and the ratio of
  the drawn width to the drawn height is 4 to 3 within one hundredth

#### Scenario: A broken image keeps its caption

- **WHEN** the browser test selects a record whose image URL cannot be loaded and reads the
  thumbnail
- **THEN** the thumbnail is present, the caption is readable, and no broken image icon is
  in the panel

#### Scenario: A lightbox with no image still reads

- **WHEN** the browser test opens the lightbox on an image URL that cannot be loaded and
  reads the frame and the placeholder
- **THEN** the frame is at least 260 by 160 CSS pixels and the placeholder holds the
  caption

#### Scenario: The images are lazy and send no referrer

- **WHEN** the browser test selects a record with images and reads the image elements
- **THEN** each carries `loading="lazy"` and `referrerpolicy="no-referrer"`
