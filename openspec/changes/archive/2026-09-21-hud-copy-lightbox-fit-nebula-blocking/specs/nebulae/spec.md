## ADDED Requirements

### Requirement: A nebula blocks by its range

A nebula that sits far from the camera SHALL hide what is behind it more than the same
nebula close to the camera. Today it hides less, because the only quantity that follows
the range is the dust in front of the record, and that dust lifts the record's alpha
toward 1. This requirement adds a second quantity that runs the other way.

**The gain.** The pass SHALL raise the record's own transmittance along the ray to a
**gain** before it writes the alpha. Where `T` is that transmittance and `g` the gain, the
record's opacity SHALL be `1 - pow(T, g)` in place of `1 - T`. A gain above 1 blocks more,
a gain below 1 blocks less, and a gain of exactly 1 is the value the pass writes today.

**The gain follows the range.** `g` SHALL run smoothly from a **near gain** at or below a
**near range** to a **far gain** at or above a **far range**, where the range is the
distance from the camera to the record's centre, in light years. The step SHALL be smooth,
so no record's blocking steps as the camera moves.

**The four defaults.** The near range SHALL be **500** light years, the far range
**6,000**, the near gain **0.7** and the far gain **2.0**.

The four are look decisions and not measurements. 500 and 6,000 bracket the ranges a
record is read at inside the zoom band, which ends at 20,000 light years: a record the
camera is beside sits under 500, and a record on the other side of the local arm sits over
6,000. 0.7 and 2.0 are the first values either side of 1 that read as a clear softening and
a clear hardening at those two ends. All four SHALL be reachable from the debug handle, in
the manner of the occlusion constant, so a reader tries another set in the page without a
build.

**The gain changes the alpha alone.** It SHALL NOT change the emission a record adds, so
the light the pass adds to the frame at a camera is the light it adds today.

**The gain is not the dust.** The requirement "The material in front of a nebula attenuates
it" stands unchanged: the mean of the three transmittance channels still scales the alpha,
and an occluded nebula still stops attenuating what is behind it. The gain applies to the
record's own extinction, before that scaling.

**A value the reader cannot read takes the default.** That is a value that is not finite.
A gain below 0 and a range below 0 are values the reader cannot read.

**Cost.** The gain costs one power per fragment and the range costs one length per record.
The pass SHALL stay inside the three bounds this capability already states — 0.78 ms at 60
light years, 0.76 ms at 120 and 0.72 ms at 260 — read under the same rule, and the whole
frame at the near view SHALL stay inside the 16.7 ms `far-view-rendering` states. The set
holds 358 records and the covered-area budget allows 4 screen areas, at 1920 by 1080.

#### Scenario: A gain of 1 is the rule the pass writes today

- **WHEN** a unit test reads the alpha the shader's rule gives for a record transmittance
  of 0.5, a mean of 1 and a weight of 1, at a gain of 1
- **THEN** it reads 0.5, which is the value the rule without the gain gives for the same
  three inputs

  There is no frame reading beside this one. Both gains at 1 make the shader take the path
  it takes today, so a frame drawn that way can only be compared with itself. The rule is
  an identity in one number, and the unit test is what states it.

#### Scenario: A higher gain blocks more at one camera

- **WHEN** the browser test holds one camera inside the band on the sight line of a record,
  with the occlusion constant at 0 and the light gain at 0, draws a known background behind
  the record, and reads the mean luminance of a block at the record's centre with both gains
  at 1 and then with both gains at 2
- **THEN** the block at the gain of 2 is darker than the block at the gain of 1

#### Scenario: A far nebula blocks more than a near one

- **WHEN** the browser test places the camera on the sight line of one record at a range
  under the near range and again at a range over the far range, with the occlusion constant
  at 0 so the dust plays no part and the light gain at 0 so the record adds no emission,
  draws a known background behind the record, and reads the mean luminance of a block at
  the record's centre
- **THEN** the block at the far camera is darker than the block at the near camera

#### Scenario: The blocking does not step as the camera moves

- **WHEN** the browser test holds one camera on the sight line of one record, with the
  occlusion constant at 0, and reads 200 pairs of frames through the near range and the far
  range, each pair 1 percent of the range apart, by scaling both ranges by 1 over 1.01
  instead of moving the camera
- **THEN** no pair differs at any pixel by more than 12, summed over the three channels on
  a 0 to 255 scale

  `smoothstep(near / s, far / s, r)` equals `smoothstep(near, far, r * s)`, so a range
  scaled by 1 over 1.01 gives every record the gain of a camera 1 percent further out. The
  camera stays still, so the reading holds the frame's own noise out of the pair.

  **Why not move the camera.** The moved form was read and cannot answer this requirement
  at any bound a step would fail. A 1 percent move of a camera inside the band redraws the
  whole frame: the volume alone gives a worst pair of 6, the volume with the nebulae gives
  410, and **the gains held at 1 — the shader this change starts from — gives 378**. The
  same sweep at a 0.1 percent step gives 167, at 0.01 percent 22 and at 0 percent 0. The
  sprite grid and the volume's ray steps move with the camera, and they, not the gain,
  carry those numbers. The held camera is what isolates the gain.

#### Scenario: The gain leaves the emission alone

- **WHEN** a unit test reads the emission the pass sends for one record at the near gain
  and at the far gain
- **THEN** the two are equal

#### Scenario: A gain the reader cannot read takes the default

- **WHEN** a unit test sets each of the four constants to a value that is not finite, and
  then to a value below 0
- **THEN** each reads back the default the requirement states

### Requirement: A nebula attenuates the point cloud and the star field

A nebula SHALL dim the stars behind it. Today it dims nothing but the density volume and
the cloud sprites, because the point cloud and the star field draw after the nebula
composite and add their light over it.

**The transmittance reaches the two sprite passes.** The pass SHALL make the accumulated
nebula transmittance of the frame available to the point cloud and the star field. Each
sprite's colour SHALL be multiplied by that transmittance at the sprite's place on the
screen. The two passes SHALL stay additive: the multiply happens to the sprite's colour,
before the add, so the requirement "Three scene passes and a tone map compose the far view"
stands.

**The depth gate.** A sprite in front of every nebula SHALL NOT be dimmed. The pass SHALL
report two ranges over the records it drew: the **front range**, which is the least of
`range - radius` over those records and never below 0, and the **centre range**, which is
the range of that same record's centre. A sprite at or nearer than the front range SHALL
take none of the attenuation. A sprite at or beyond the centre range SHALL take all of it.
Between the two the share SHALL run smoothly, so no sprite steps as the camera moves.

**The stated ceiling.** The gate reads two ranges for the whole frame and no depth per
pixel. A sprite beyond the nearest record's centre that sits in front of a second, further
record is therefore dimmed as if it were behind that second record. This is accepted: the
case needs two records at very different ranges on one sight line with sprites between
them, and the nearer record is the one the gate is right about, which is the record a
camera flying through the set is closest to.

**No nebula, no change.** A frame in which the nebula pass drew no record SHALL draw the
point cloud and the star field exactly as it draws them today, and SHALL make no texture
fetch for this rule. That covers a frame above the zoom band, a frame with the nebula
switch off, a frame before the records or the art arrive, and a frame whose selection kept
nothing.

**A stale frame SHALL NOT leak.** The transmittance a sprite pass reads SHALL be the one
the nebula pass wrote in the same frame. A frame that drew no record SHALL NOT read the
transmittance of the frame before it.

**Cost.** The rule adds at most one texture fetch per sprite fragment, and none at all
where no nebula drew. The mean render time SHALL stay under 16.7 ms at the six views
`far-view-rendering` states and the six views `close-view-stars` states, at 1920 by 1080 on
the dev container's GPU, over 300 frames, measured with the function those two capabilities
already name. The set holds 358 records and the covered-area budget allows 4 screen areas.

#### Scenario: A star behind a nebula dims

- **WHEN** the browser test opens a view inside the band with a dense record between the
  camera and a block of the point cloud, with the volume and the cloud switches off and the
  nebula light gain at 0 so the record adds no light of its own, and reads the mean
  luminance of that block with the nebula switch on and with it off
- **THEN** the reading with the switch on is lower than the reading with it off

#### Scenario: A star in front of the nearest nebula keeps its light

- **WHEN** the browser test opens the same view and reads the mean luminance of a block of
  the point cloud whose samples all sit nearer than the front range the pass reports
- **THEN** the two readings agree to six places

#### Scenario: The star field dims with the point cloud

- **WHEN** the browser test opens a view at a zoom distance inside both the nebula band and
  the star field's range, with a dense record in front of a block the field draws, and reads
  the mean luminance of that block with the nebula switch on and with it off
- **THEN** the reading with the switch on is lower than the reading with it off

#### Scenario: A frame with no nebula is unchanged

- **WHEN** the browser test renders the default view at 60,000 light years, which is above
  the zoom band, with the nebula switch on
- **THEN** the frame matches the baseline image the capability `far-view-rendering` pins,
  and a unit test reads that the point pass and the star pass were sent no transmittance
  texture for that frame

#### Scenario: The frame before does not leak into a frame with no nebula

- **WHEN** the browser test draws a frame inside the band that blocks a block of the point
  cloud, then moves the camera above the band and draws again, and reads the same block
- **THEN** the second reading matches the reading of the same view drawn without the first
  frame, to six places

#### Scenario: The twelve budget views stay under budget

- **WHEN** the browser test sets each of the six views `far-view-rendering` states and each
  of the six views `close-view-stars` states, with the nebulae on, and calls the measurement
  function for 300 frames
- **THEN** each returned mean is under 16.7 ms
