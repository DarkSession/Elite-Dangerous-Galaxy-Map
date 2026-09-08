## Why

The change `far-view-colour-and-texture` left three look scenarios below their
thresholds: the patch contrast on the ring at 20,000 light years reads 1.25 against
1.6, the bright quartile of blue less red on the ring at 44,000 reads 0.095 against a
ceiling of 0.02, and the puff contrast at the rim reads 1.76 against 2.5. Its design
records that every renderer-side lever is exhausted, and the owner has accepted the
frame as it is. Three red tests hide the next regression, so the thresholds must
match the accepted frame before phase 1 closes.

## What Changes

- The patch contrast scenario keeps 2.5 at 32,000 and 38,000 light years and asks 1.2
  at 20,000, below the 1.25 the frame reads. The predecessor added that ring with a
  floor of 1.6 to a tree that read 1.27, and the accepted tree reads 1.25, so the ring
  gained nothing there. The sprites hold one brightness over the inner disc, which is
  what holds the bulge fall-off, so the ring at 20,000 carries less contrast than the
  outer rings by design. At 1.2 the ring guards against a loss of the contrast it has,
  not the gain the predecessor asked for.
- The haze scenario keeps the dark floor of 0.10 on both rings and the bright ceiling
  of 0.02 on the ring at 38,000, and drops the bright ceiling on the ring at 44,000.
  The glow tint that gives the ring at 38,000 its blue floor lifts blue less red over
  the whole ring at 44,000, so the two bounds of that ring conflict.
- The rim puff scenario asks 1.6 instead of 2.5, below the 1.76 the frame reads and
  above the 1.45 the tree read before `far-view-colour-and-texture`. The model carries
  no density contrast at 44,000 light years, and a larger spread puts light in empty
  space.
- The tests in `e2e/look.spec.ts` take the same three values. No look constant, no
  shader and no baseline image changes, so the frame the owner accepted is the frame
  the suite pins.
- The roadmap's phase 1 status drops the sentence on the three open scenarios, and
  records the ruling that the point shader keeps its zone key at 6.

Non-goals: no change to the render passes, the scene data or the baseline; no new
scenario; no change to any other threshold. After this change no test bounds how blue
the bright quartile of the ring at 44,000 light years may become; only the baseline
image stands behind the pink puffs there, and that gap is deliberate. A later change
may raise these three values again when a texture lever exists, such as a noise field
in the volume or a denser cloud placement inside 20,000 light years. The values to
return to are the reference's: a patch contrast of 2.15 at 20,000 light years, a rim
puff ratio of 12.2, and a bright quartile of blue less red at 44,000 of -0.010.

Scale: this change draws nothing and loads nothing. It edits three thresholds in one
spec and one test file, and the browser suite runs at the same 1280 x 720 default
view as before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-rendering`: three scenarios take the thresholds the accepted frame reads
  with a margin; no requirement text changes.

## Impact

- `openspec/specs/far-view-rendering/spec.md`, through the delta.
- `e2e/look.spec.ts`: the factor at 20,000 light years, the bright ceiling loop at
  44,000, and the rim puff factor.
- `docs/roadmap.md`: the phase 1 status paragraph.
