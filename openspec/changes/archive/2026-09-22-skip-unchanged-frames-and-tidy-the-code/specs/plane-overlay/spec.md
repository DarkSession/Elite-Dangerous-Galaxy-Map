## MODIFIED Requirements

### Requirement: An overlay element can lie on the galactic plane

The library SHALL place an element of the overlay on a plane of constant `y` in game
coordinates, so that the element's own rectangle maps onto a rectangle of that plane. The
element SHALL stay DOM content, so its text is a crisp vector at every device pixel ratio
and it needs no font in a shader.

A plane element SHALL be given:

- an **anchor**, a point of the plane in game coordinates;
- a **size on the plane**, a width and a height in light years;
- a **plane**, the `y` the element lies on.

The element's own rectangle SHALL map so that its width runs along the game `x` axis and
its height along the game `z` axis, with its anchor at the middle of the rectangle. An
element is therefore read the same way round as the coordinates it names.

**The transform SHALL be the exact plane-to-screen homography and SHALL NOT be an affine
approximation.** The map from a plane of constant `y` to the screen under a perspective
projection is a projective map, not an affine one: a rectangle of the plane projects to a
general quadrilateral, whose far edge is shorter than its near edge. An affine placement,
such as a scale and a shear taken from the projection's local rate at the anchor, keeps the
two edges the same length, and the element then parts company with the lines around it
across its own width.

The placement SHALL therefore:

- project the four corners of the element's plane rectangle;
- solve the 3 by 3 homography that takes the element's own corners, in its local CSS pixel
  coordinates, to those four screen points;
- write that homography as a CSS `matrix3d`, with the element's transform origin at its own
  top left corner.

A 2D homography `H` goes into `matrix3d` as the columns
`(h11, h21, 0, h31)`, `(h12, h22, 0, h32)`, `(0, 0, 1, 0)`, `(h13, h23, 0, h33)`, which is
the 4 by 4 that a browser applies to a flat element and divides through by `w`. The
perspective therefore comes from the matrix itself, and the overlay host SHALL NOT carry a
`perspective` property of its own: a host perspective would apply a second, unrelated
projection over the first.

**The corners SHALL be projected camera-relative.** The galaxy spans 100,000 light years
and the projection runs in `float32` on the GPU, so an absolute coordinate cannot place a
10 light year element. The placement SHALL subtract the camera in `float64` before it
projects, as every pass of the renderer does.

**A plane element SHALL be dropped, and SHALL NOT be placed, when:**

- any of its four corners lies at or behind the near plane. A quad with corners on both
  sides of the camera does not project to one quadrilateral, and a homography solved
  through such a corner wraps the element across the frame;
- the projected quad is turned away from the camera, which its signed area on the screen
  reports **compared against the side of the plane the camera is on**. Let `side` be the
  camera's `y` less the element's plane `y`. The element SHALL be dropped where
  `area * side` is not above 0. Seen from above the plane a face-on element reads a
  positive area, and seen from under it the same element reads a negative one, so a fixed
  sign would drop every element under the plane. A quad that reads the other way for its
  side is behind the horizon.

  **The camera no longer sits above the cursor at every pitch.** The pitch runs from -89
  to 89 degrees, which `map-navigation` states, so the camera reaches either side of the
  plane. At a `side` of exactly 0 the camera lies in the plane, every element is edge-on,
  `area * side` is 0, and every element is dropped. That is right and needs no rule of its
  own;
- the projected quad's screen bounding box lies wholly outside the viewport;
- the homography is singular, which three collinear projected corners give. The element
  then has no area on the screen and nothing to draw.

A drop SHALL leave the element out of the overlay and SHALL NOT throw.

**A plane element SHALL be turned to face the reader under the plane.** An element lies on
the plane, so a reader under it sees its face from behind and any text on it runs backwards.
Where the camera's `side` is below 0 the placement SHALL solve the homography with the
element's own corners taken to the same four plane corners with the **height axis reversed**,
which paints the element on the other face of the plane. The element still lies flat on the
plane, its screen bounding box does not change, and it reads the same way round from either
side. The turn happens as the pitch crosses 0, where every element is dropped, so no frame
shows it part way through.

**The overlap test of a plane element SHALL use its screen bounding box**, the axis-aligned
box of its four projected corners. A plane element is not an upright rectangle on the
screen, so the box test the upright overlay elements use cannot be applied to its own
rectangle.

**A plane element SHALL NOT change an upright one.** The overlay holds both: the region
labels, the marker names, the selection pin and the hover ring stand upright, and the
coordinate labels and the cursor marker lie on the plane. A transform on one element SHALL
NOT be inherited by another, so each plane element SHALL carry its own transform and the
host SHALL carry none.

**The cost of one placement is fixed.** It is four projections, one 8 by 8 solve for the
homography and one style write. It does not follow the host's data set, which may hold
50,000 systems, and it does not follow the 400 billion systems of the galaxy. A frame that
places 8 coordinate labels and 1 cursor marker therefore does 36 projections and 9 solves.

**A placement SHALL write a style property only when it differs** from the value the
library last wrote to that property of that element, because the overlay rewrites every
property of every element in each frame and a write of a value an element already carries
is a DOM change the browser records.

The compare SHALL NOT read the value back from the element. The browser gives a property
back in its own form, which is not always the string the library wrote: Chrome gives the
`font` shorthand, `box-shadow` and some `transform` and `opacity` values back in another
form. A compare against the value read back never matched for them. The review of
2026-09-22 counted 2,008 repeat `font` writes of 2,016 during a held key, and 15,525 reads
of the CSSOM, which the compare against the kept value makes 0. Every write of a property
that a placement compares SHALL pass through the same compare, or the kept value is no
longer the value of the element.

#### Scenario: A plane rectangle projects to the quad the camera sees

- **WHEN** a unit test places an element of a known size on the plane at a known anchor, at
  a pitch of 30 degrees, and compares the four screen corners its transform gives with the
  four corners the camera projection gives for the same four plane points
- **THEN** each pair agrees within **0.01** CSS pixels

#### Scenario: The far edge is shorter than the near edge

- **WHEN** a unit test places a square element on the plane at a pitch of 30 degrees and
  measures the screen length of the edge nearer the camera and the edge further from it
- **THEN** the far edge is shorter than the near edge by at least 5 per cent. An affine
  placement gives two edges of equal length, so this reading separates the two

#### Scenario: A quad crossing the near plane is dropped

- **WHEN** a unit test places an element wide enough that one corner falls behind the near
  plane, at a pitch of 5 degrees
- **THEN** the placement drops the element, it is not in the overlay, and nothing throws

#### Scenario: A singular placement is dropped

- **WHEN** a unit test places an element whose four plane corners project to three collinear
  screen points
- **THEN** the placement drops the element and nothing throws

#### Scenario: A plane element does not transform an upright one

- **WHEN** the browser test opens a view with the grid on and a system selected, so the
  overlay holds coordinate labels on the plane and a selection pin upright, and reads the
  computed transform of the pin
- **THEN** the pin carries no `matrix3d` and its box on the screen is the upright rectangle
  `system-selection` states

#### Scenario: The placement writes no style it already holds

- **WHEN** a unit test places the same element twice with an unchanged view, counting the
  style writes
- **THEN** the second placement writes no style property

#### Scenario: The placement reads no style back

- **WHEN** a unit test places the same element twice with an unchanged view, counting the
  reads of the element's style
- **THEN** neither placement reads a style property

#### Scenario: A value the browser gives back in another form is written once

- **WHEN** a unit test writes the same `font` value to an element twice, where the element
  gives the property back in another form than the one written, and counts the writes
- **THEN** the value is written once

#### Scenario: An element is kept from under the plane

- **WHEN** a unit test places the same plane element at a pitch of **-45 degrees** and at
  **+45 degrees**, at the same zoom and yaw
- **THEN** both placements are returned, and the two screen bounding boxes agree in width
  within 2 per cent

#### Scenario: An element is turned to face the reader under the plane

- **WHEN** a unit test places the same plane element at -45 degrees and at +45 degrees and
  reads which projected plane corner the element's own top left maps to
- **THEN** the two are different corners of the same rectangle, and the screen bounding
  boxes still agree in width within 2 per cent

#### Scenario: An element is dropped in the plane

- **WHEN** a unit test places a plane element at a pitch of **0 degrees**, where the camera
  lies in the element's own plane
- **THEN** the placement returns null and does not throw
