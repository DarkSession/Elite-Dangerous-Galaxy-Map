## ADDED Requirements

### Requirement: The library gives the region label its whole look

The requirement "A region in view carries a label that fades with its own range" says a
label is one DOM element with one opacity, and says nothing about who gives that element
a size, a place or a look. This requirement answers that.

The library SHALL write the look of a region label **on the element itself**. A page
SHALL need no style rule of its own for a region label to draw in the place the
placement chose. This holds the region label to what every other overlay element of the
library already does: the system name label, the hover ring, the selection pin, the grid
coordinate label and the cursor marker each write their own `position` and their own
look, and none of them reads a rule from the page.

**The element SHALL carry `position: absolute`.** The placement writes `left` and `top`
on the element in CSS pixels each frame, and both are inert on a static box. Without the
rule every label lays out in normal flow from the top left corner of the overlay host,
and because the chosen set changes from frame to frame the stack re-flows and the labels
blink in that corner. A reading of the built sample pages measured 388 labels and not one
of them positioned: every one at `x = 0`, stacked at `y = 0, 22, 44, 66, 88` and 1,280
CSS pixels wide, which is the width of the page.

**The element SHALL carry this look**, which is what the demo page's rule drew, with the
outline changed as stated below:

| Property              | Value                    |
| --------------------- | ------------------------ |
| `position`            | `absolute`               |
| `pointer-events`      | `none`                   |
| `white-space`         | `nowrap`                 |
| `box-sizing`          | `border-box`             |
| `padding`             | `2px 6px`                |
| `font-size`           | `13px`                   |
| `line-height`         | `16px`                   |
| `font-family`         | `system-ui, sans-serif`  |
| `letter-spacing`      | `0.08em`                 |
| `text-transform`      | `uppercase`              |
| `color`               | `#cfe4ff`                       |
| `text-shadow`         | `0 0 6px #000, 0 0 2px #000`    |
| `z-index`             | `1`                             |

The three font properties SHALL be written as longhands and SHALL NOT be written as the
`font` shorthand. The shorthand resets `font-style`, `font-variant`, `font-weight`,
`font-stretch` and `font-size-adjust` to their initial values in the declaration that
carries it. Written inline it would therefore put `font-style: normal` on the element,
which beats a page's rule, and the scenario below would be false. The system name label
at `gm-system-label` writes the shorthand; the region label does not, because it leaves
those five longhands to the page.

The font family is named and not inherited. An inherited family makes the label's
measured box follow whatever font the page sets on `body`, and the placement reads that
box to hold the label inside the frame, so a host could move the labels by changing a
font it set for its own text.

**The outline is the blurred shadow and not a stroke.** The library draws
`text-shadow: 0 0 6px #000, 0 0 2px #000`, which is what the rule the demo page carried
drew. The library SHALL NOT draw the outline with `-webkit-text-stroke`, and SHALL NOT
write `paint-order`.

The cost is known and accepted. `browser-suite` records that Firefox rasterises a
blurred text shadow on the CPU, and that the two blurred shadows of the name label
overlay cost 4.2 ms of a frame that cost 12.1 ms while the camera moved. The region
overlay shows at most `MAX_LABELS` labels, which is 12, against the name overlay's 64,
so the cost here is smaller.

The region label is therefore the one overlay element of the library that draws its
outline with a shadow. The system name label and the grid coordinate label keep their
strokes, and this requirement does not change them.

Neither the shadow nor a stroke enters the layout box, so the measured box, the 48 CSS
pixel inset and every placement figure of the fade requirement are unchanged.

**The class name SHALL stay `region-label`.** The look is inline, so an inline value wins
over a page's rule for the properties in the table above. A rule that sets a property the
table leaves out still applies.

#### Scenario: A page with no style rule places the labels

- **WHEN** a browser test opens a page that carries no `.region-label` rule, builds a map
  on a canvas with no `labelHost`, sets a view inside the band where the labels draw, and
  reads the computed `position`, `left` and `top` of every `.region-label`
- **THEN** every label reads `position: absolute`, and no two labels share the same
  `left` and `top`

  A stack in normal flow gives every label `position: static` and the same `left` and
  `top`, which is the fault this requirement removes.

#### Scenario: The labels sit where the placement put them

- **WHEN** the same test reads each label's bounding box and the viewport
- **THEN** no label's box lies wholly inside the 48 CSS pixel square at the top left
  corner of the viewport, and every box lies inside the viewport

#### Scenario: The look does not come from the page

- **WHEN** a browser test builds a map on a page with no rule for `.region-label` and
  reads the computed style of one label element
- **THEN** the element reads every property of the table above, with those values

  The reading is a computed style in a browser and not an inline string in a fake. The
  unit tests run in Vitest's `node` environment, which has no layout and no CSS engine,
  so a fake element gives back whatever string it was handed and would pass whatever the
  values meant.

#### Scenario: The outline is the blurred shadow

- **WHEN** the same reading takes the element's `text-shadow` and its
  `-webkit-text-stroke-width`
- **THEN** `text-shadow` carries the two black shadows, at 6 pixels of blur and at 2,
  and the stroke width is `0px`

  The browser serialises a computed `text-shadow` in its own form, and puts the colour
  before the lengths. The reading asserts the string the browser gives and not the
  string the library wrote.

#### Scenario: A page rule still reaches a property the library leaves alone

- **WHEN** a browser test adds a rule that sets `font-style: italic` on `.region-label`,
  which the table does not carry, and reads the computed style of a label
- **THEN** the label reads `font-style: italic`, and its `position` is still `absolute`
