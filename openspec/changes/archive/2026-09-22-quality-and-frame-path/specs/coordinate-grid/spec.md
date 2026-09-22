## MODIFIED Requirements

### Requirement: The frame carries a background reading

The renderer SHALL build a **background reading**: the local brightness of the finished
picture of the galaxy, as a small texture, so an overlay can follow what it draws over.

- The reading SHALL be built from the scene target, which holds the volume, the clouds,
  the points, the stars and the glow, and not from the frame the user sees. The region
  overlay and the markers draw after the tone map and SHALL NOT be in it: the grid merges
  with the galaxy, not with the other overlays.
- The scene SHALL be **tone-mapped once at the full resolution of the frame**, with the
  same curve and the same exposure the frame uses, and the tone-mapped values SHALL then be
  averaged down. The reading is the mean of the picture a person sees, which is what an
  overlay merges with.

  The order matters, and the measurements chose it. Averaging in linear light first gives
  the mean scene radiance of the block, which one bright star dominates whole: a star sprite
  carries a linear luminance far above its background, so a 16 by 16 block reads 0.56 where
  the same block of the tone-mapped frame means 0.33. The reading then **steps** when the
  sprite crosses a texel edge. Over the disc at a zoom of 4,000 light years, with the camera
  moving 4.67 CSS pixels a frame, the linear order moves the texel under a fixed point by
  **0.2417** between two frames and this order by **0.0232**, and the share of all texel
  steps above 0.02 falls from **5.53 per cent** to **0.12 per cent**. A step of that size in
  the reading is a step in the merge weight, which is a grid line that flickers.
- The reading SHALL be **a sixteenth** of the drawing buffer on each axis, `ceil(w / 16)`
  by `ceil(h / 16)`, and at least one texel on each axis. At 1920x1080 that is 120 by 68
  texels. The size is what takes the point cloud's grain out: a grid line must not flicker
  because one bright star sits under it.
- The chain SHALL be a run of reductions to a sixteenth on each axis, and **each step SHALL
  round its size up**. Four halvings is what the change takes; the design's fallback for the
  frame budget replaces the first halving with a sparse bilinear sample at a quarter size,
  which is three steps to the same size. Rounding up at every step gives `ceil(n / 16)`
  exactly, because `ceil(ceil(n / 2) / 2)` is `ceil(n / 4)`: by halves 1080 goes 540, 270, 135,
  68 and not 67, and 300 goes 150, 75, 38, 19. Rounding down would drop the last row of an odd
  level and the reading would then miss the bottom of the frame.
  The last row or column of an odd level averages a part block, which costs that one row a
  little of its span and nothing anywhere else.
- The reading SHALL be built only in a frame in which the coordinate grid draws, which the
  camera distance band already decides: full at 4,000 light years and nearer, nothing at
  12,000 and further. Every other view SHALL pay nothing for it, and the reading SHALL hold
  no storage until the first frame that builds it.

Every scenario that reads the reading therefore names a zoom inside that band, and a
scenario that needs both a bright background and a dark one takes **two views**. One frame
at 4,000 light years does not hold the galactic core and the dark space between the arms
together.

The map SHALL read the reading back to the processor, and that read SHALL NOT wait for
the card. The read-back of a frame SHALL be taken at the **start** of the next frame,
before that frame's first draw command. A read-back taken after the frame's draw commands
is a round trip to the GPU process that drains every command queued before it. Under a
drag over the default view it measured 0.40 ms a frame in the animation loop against
0.19 ms at the start of the frame; in the scenario below, a held key over the galactic
core with the grid on, it measured 1.37 ms against 0.39 ms.
A tight draw loop with no gap between frames cannot see the difference, so the bound
below is measured in the animation loop and not with `measureFrames`. The labels of a
frame MAY therefore read the reading of an earlier frame. The picture does not change
between two frames of one view, because no shader reads a clock, and a change wakes a
draw whose labels read the reading of the frame that changed.

A read-back is a cost only a coordinate label spends. Once a first reading has landed,
the frame SHALL NOT read the reading back while no coordinate label is placed, which is
a frame with the grid on at a view where the placement keeps no label: a pitch of 0 degrees, where the plane is
edge-on, or the far end of the band, where the labels fade before the grid does. The
reading SHALL still be built in such a frame, so `backgroundReading()` and the first
label that returns read the last reading that landed. `debug` SHALL carry
`readbackStats()`, which returns the count and the mean time in milliseconds of the
read-backs since the last `resetReadbackStats()`, measured around the read-back call.

`debug` SHALL carry `backgroundSize()`, which returns the width and the height of the
reading's own target, and `[0, 0]` before the first frame that builds it. It reports the
storage and not the last reading, so a test can hold the rule that a frame without the grid
takes none.

`debug` SHALL carry `backgroundReading()`, which returns the width, the height, the red,
the green and the blue of every texel of the last reading, each from 0 to 1, and the
luminance of each texel by `0.2126 r + 0.7152 g + 0.0722 b`. It SHALL return null in a frame
that built none. The colour is part of the reading and not only the luminance, because the
labels tint themselves with it and a probe that gave the luminance alone could not check
that.

#### Scenario: The reading follows the picture

- **WHEN** the browser test turns the grid on at 1920x1080 at a zoom of 4,000 light years in
  two views, one over the galactic core and one over the dark space between the arms, and
  reads `backgroundReading()` in each
- **THEN** each reading holds 120 by 68 texels, the **mean** luminance of the first is at
  least 0.55 and the mean luminance of the second is at most 0.10, every channel of every
  texel is between 0 and 1, and the luminance of each texel matches its own three channels.

  The mean is the one reading the two views are chosen by, so every scenario that uses the
  pair states its premise in the same terms

#### Scenario: The reading rounds its size up

- **WHEN** a unit test asks for the reading size of 1920 by 1080, of 1280 by 720, of 300 by
  300 and of 8 by 8
- **THEN** the sizes are 120 by 68, 80 by 45, 19 by 19 and 1 by 1, and each one is the size
  four halvings that round up give

#### Scenario: The reading is absent with the grid off

- **WHEN** the browser test draws a frame with the grid off and reads `backgroundReading()`
  and `backgroundSize()`
- **THEN** the reading is null and the size is `[0, 0]`, so no frame built one and no storage
  was taken

#### Scenario: The reading holds still under the grain

- **WHEN** the browser test turns the grid on at **1920x1080** over the disc at a zoom of
  4,000 light years, moves the cursor by 20 light years in each of 30 frames, which is 4.67
  CSS pixels, about three tenths of a 16 pixel reading texel, and reads the texel under a
  fixed screen point in every frame
- **THEN** the luminance changes by less than **0.05** between any two neighbouring frames.

  0.05 and not 0.02. The bound is what the order above holds with margin: the worst reading
  over the four views measured is 0.0232, over the disc. No order of the chain reaches 0.02,
  because a box average has a hard edge and a sprite's whole contribution leaves a block in
  one step. What the bound holds is that the reading cannot cross the merge band, from 0.08
  to 0.55, in a few frames.

  The camera has to move. No shader of this map takes a time uniform and the tone map's
  dither is a fixed hash of the pixel, so 30 frames with the camera still are byte-identical
  and a still test could not fail. What the requirement claims is that the reading does not
  jump as the point cloud's grain slides under it, and only a moving camera shows that

#### Scenario: The read-back costs under half a millisecond in the loop

- **WHEN** the browser test turns the grid on at 1920x1080 at a zoom of 4,000 light years
  and a pitch of 5 degrees, calls `resetReadbackStats()`, holds a movement key for 120
  animation frames, and reads `readbackStats()`
- **THEN** the count is above 100 and the mean is 0.50 ms or less. Five readings of the
  scenario gave 0.35 to 0.44 ms, and the old position gave 1.37 ms

#### Scenario: No label, no read-back

- **WHEN** the browser test turns the grid on at a zoom of 4,000 light years and a pitch
  of 0 degrees, where the grid draws and the label readings hold no label, calls
  `resetReadbackStats()`, holds a movement key for 120 animation frames, and reads
  `readbackStats()` and `backgroundSize()`
- **THEN** the count is 0 and the size is 120 by 68, so the reading was built and never
  read back

#### Scenario: The label reads a reading that landed

- **WHEN** the browser test turns the grid on at a zoom of 4,000 light years and a pitch
  of 5 degrees, draws three frames and reads `backgroundReading()`
- **THEN** the reading holds 120 by 68 texels
