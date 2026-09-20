## Why

Two readings of the map are wrong at the edge of their own rule.

The region boundary lines stop at **8,000** light years of range and reach full strength
at 12,000, so a user who zooms in to read a neighbourhood loses every line near the
cursor while the lines near the horizon stay. The owner wants the lines to hold nearer:
full at 8,000 and gone at 5,000.

A grid coordinate label goes off the page as soon as its **crossing** leaves the
viewport. The label lies up and left of its crossing, so the label is still wholly or
mostly on the screen when it disappears. A user who pans sees numbers blink out at the
right and the bottom edge of the frame while the text is still in front of them.

## What Changes

- The region range fade moves from `8,000 -> 12,000` to `5,000 -> 8,000`. A line draws
  nothing at 5,000 light years of range and below, rises on the same smooth step, and
  draws in full at 8,000 and above. The zoom fade (20,000 to 30,000) does not change.
- The region **labels** follow, because they read the same two constants. A name and the
  line under it keep one rule.
- The band's **half width** keeps its reference range of 12,000 light years, which is no
  longer the range at which the fade reaches full. The width rule and the fade rule
  become two figures and not one. No line changes width at any range.
- A grid coordinate label is dropped only when **no part of it is on the screen**. The
  gate moves from the crossing's own projected point to the label's projected quad, which
  the plane overlay already tests. A label whose crossing is off the frame and whose text
  is on it stays.
- A grid label reads its background at the point of its own box that is **inside** the
  frame, so a label at the edge does not jump in colour or opacity as its box centre
  leaves the viewport.

No API of the library changes. No host switch changes. Nothing is removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `galactic-regions`: the range fade figures move to 5,000 and 8,000, the band's width
  reference range is stated as its own figure of 12,000, and the scenarios that read the
  fade move with it.
- `coordinate-grid`: a candidate label is dropped on its quad lying wholly outside the
  viewport and not on its crossing projecting outside it, and the background reading
  point is held inside the frame.

## Impact

Scale: both readings are per frame and fixed in cost. The region composite is one
full-screen pass, whatever the fade figures are. The grid label sweep reads at most 25
crossings a frame, which the coordinate-grid spec fixes, so a gate that drops fewer of
them still reads 25 crossings and places at most 8 labels. The work for each crossing
grows: the sweep now solves the Jacobian, the four corner projections and the homography
for every crossing inside the reach, where it solved them only for a crossing that
projected inside the viewport. The count is fixed at 25 either way, and
`e2e/frame-budget.spec.ts` reads the cost. Neither follows the host's
data set, and neither follows the ~400 billion systems of the galaxy.

Code:

- [src/render/region-pass.ts](src/render/region-pass.ts) — `REGION_RANGE_NONE`,
  `REGION_RANGE_FULL`, and a new width reference constant.
- [src/app/labels.ts](src/app/labels.ts) — reads the two constants; the sweep gate
  `labelSweepRuns` opens at more views, so the sampling cost is read again.
- [src/app/grid-labels.ts](src/app/grid-labels.ts) — the candidate gate and the
  background reading point.
- [src/app/plane-overlay.ts](src/app/plane-overlay.ts) — no change; its box gate is what
  the grid labels lean on.
- Tests: `src/render/region-pass.test.ts`, `src/app/labels.test.ts`,
  `src/app/grid-labels.test.ts`, `tests/region-views.test.ts`,
  [e2e/region-views.ts](e2e/region-views.ts) (the recorded `NO_LINE_VIEW` is searched
  again against the new floor), `e2e/regions.spec.ts`, `e2e/labels.spec.ts`,
  `e2e/grid.spec.ts`, `e2e/frame-budget.spec.ts`.
- Baseline images: the look snapshot of any view that holds plane inside 8,000 light
  years changes, because lines now draw there.
