## MODIFIED Requirements

### Requirement: Glow surrounds the disc
A blurred copy of the volume, cloud and nebula passes SHALL be added to the scene before
the tone map, scaled by a weight and tinted toward the haze colour. The copy SHALL be
downsampled with a box filter before the blur, so no source pixel is skipped. The
downsample SHALL hold the source luminance down to a clamp, so the brightest pixels do
not spread over the whole frame. The blur radius SHALL be a fixed fraction of the
frame height, so the halo has the same width at every viewport size. The glow SHALL stay a halo: the sky above the disc at a side
view stays near the background. The renderer SHALL expose a switch that turns the glow
off, beside the switches for the volume, the clouds and the points.

#### Scenario: Halo past the rim
- **WHEN** the browser test renders the default view and samples the pixel at
  (-48,985, 0, 25,895), which lies 49,000 light years from the galactic centre, past
  the painted rim
- **THEN** its luminance with the glow is at least 0.02 and at most 0.05 above its
  luminance with the glow switched off, and below the luminance at Sol

#### Scenario: Sky stays dark from the side
- **WHEN** the browser test opens the view `#c=15,0,25895&d=70000&p=5&y=0` and
  samples the pixels at (15, 5,965, 25,895) and (15, 11,965, 25,895), which lie
  6,000 and 12,000 light years above the galactic centre
- **THEN** the first has luminance at most 0.20 and the second at most 0.08

#### Scenario: No nebula reaches the glow at the default view
- **WHEN** the browser test renders the default view at 60,000 light years with the
  nebula pass on and then with it off
- **THEN** the two frames are the same, because the nebula fade by zoom distance gives
  every record weight 0 at and above 20,000 light years
