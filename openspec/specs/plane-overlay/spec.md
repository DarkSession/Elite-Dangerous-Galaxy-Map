# plane-overlay Specification

## Purpose
Places a DOM element flat on the galactic plane, so text and marks lie in the map rather
than standing upright in front of it. It owns the plane-to-screen transform, the culling and
the degenerate cases, so every overlay that draws on the plane reads one rule.

## Requirements

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
  reports. The camera sits above the cursor at every pitch the map allows, so a plane
  element is normally face-on; a quad that reads the other way is behind the horizon;
- the projected quad's screen bounding box lies wholly outside the viewport;
- the homography is singular, which three collinear projected corners give. The element
  then has no area on the screen and nothing to draw.

A drop SHALL leave the element out of the overlay and SHALL NOT throw.

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
10,000 systems, and it does not follow the 400 billion systems of the galaxy. A frame that
places 8 coordinate labels and 1 cursor marker therefore does 36 projections and 9 solves.

**A placement SHALL write a style property only when it differs** from the one the element
already holds, because the overlay rewrites every property of every element in each frame
and a write of a value an element already carries is a DOM change the browser records.

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
