## MODIFIED Requirements

### Requirement: A star is drawn as a point sprite of the disc

A star SHALL be drawn as an additive point sprite whose colour follows the population
zone of its boxel through the same ramp the point cloud uses.

The two readings below hold the close fade at 1. They pin what one star deposits and how
the field grains, which the base class of 1 at 500 light years of zoom distance shows
best: the boxel places every system it holds, so the stars are single points and not a
wash. At a zoom distance the close fade lets through, the base class is 3 or coarser, the
boxels cap, and the same two numbers would read against a softer field. Holding the fade
is what keeps the calibration of these constants where it was measured.

**The three readings below SHALL switch the region overlay off.** Each of them reads an
**absolute** pixel value of the frame: the brightest pixel, the mean of the four corner
pixels, or the grain of a block at the centre. The overlay used to draw over a zoom band
whose close end was 5,000 light years, so it drew nothing at the 500 light years these
readings open at. `galactic-regions` replaces that band with a fade on the range of each
pixel, and the pass now runs at every zoom under 30,000 light years. A boundary that
crosses the frame would enter every one of the three readings, and no subtraction in them
removes it. The overlay is not part of the star field, so it goes off with the volume, the
clouds, the glow and the points rather than the bounds going up.

#### Scenario: The field alone rises above the background

- **WHEN** the browser test holds the close fade at 1, opens `#c=0,0,0&d=500&p=35&y=0`
  with the volume, the clouds, the glow, the points and the region overlay switched off
  and the stars on
- **THEN** the brightest pixel of the frame has luminance at least 0.05 above the mean
  luminance of the four corner pixels, and with the stars also switched off that
  difference is below 0.01

#### Scenario: The field has grain

- **WHEN** the browser test holds the close fade at 1, opens `#c=0,0,0&d=500&p=35&y=0`
  with the region overlay switched off, reads the 120 x 120 pixel block at the centre of
  the frame, subtracts from the luminance of each pixel the mean of its 3 x 3
  neighbourhood, and divides the standard deviation of that residual by the mean luminance
  of the block
- **THEN** the result is above 0.04

#### Scenario: The field adds no light at the close zoom distances

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` with the volume, the clouds,
  the glow, the points and the region overlay switched off and the stars on, and does not
  hold the close fade
- **THEN** the brightest pixel of the frame is within 0.01 of the mean luminance of the
  four corner pixels
