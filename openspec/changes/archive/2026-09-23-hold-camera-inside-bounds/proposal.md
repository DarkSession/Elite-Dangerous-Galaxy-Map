## Why

A user who zooms in on one system of a war cycle and clicks **next dataset** loses that
view. The map moves the camera to the frame of the next cycle. The cause is condition 5 of
the rule in `dataset-catalog` that holds the camera. Condition 5 holds the camera only when
it stands at least as far out as the frame of the new set. A camera zoomed in on one system
is nearer than that frame, so every step re-frames it.

The step arrows exist so that a reader can compare one week with the next from one point of
view. A camera on one system is the most common case of that comparison, and the rule
breaks it.

## What Changes

- Delete condition 5 of the rule that holds the camera. A `loadDataset` that is not the
  start load holds the camera when the other four conditions hold. The fourth condition is
  "the cursor is inside the resolved bounds and the distance is at or under their far zoom
  limit".
- A camera that the user did not move after the last load is also held, if it is inside the
  new bounds. On the cycles page, a reader who never touches the camera keeps the frame of
  the first cycle while the war grows. The owner chose this on 2026-09-23.
- **BREAKING** (behaviour only, no API change): a host whose catalog names `bounds` and
  `view: { fit: 'systems' }` alone no longer gets a re-frame when the new set is wider than
  the view. A host that wants the frame on every load names a field beside `fit` or drops
  `bounds`. This is already the documented way.
- The cycles page and the Canonn page get the new behaviour with no change to their
  catalogs. Only their comments change.

## Non-goals

- The selection and the name filter. `loadDataset` still clears both, because both name
  records of the set that the load replaces.
- A camera that follows a system by name across sets. The rule holds the camera position.
  It does not look up the system in the new set, and it does not move the camera if that
  system is not in the new set.
- The start load, conditions 1 to 4, `fit: 'systems'` itself, and the empty-set case. None
  of them change.

## Scale

The rule reads one cursor, one distance and the bounds that the entry is about to set. It
reads no record. Its cost does not change with the set size, and it holds at the 50,000
systems of the set bound. The change removes one comparison and adds no work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dataset-catalog`: the requirement "The handle loads one dataset at a time" is replaced by
  "The handle loads one dataset at a time and holds a camera inside the new bounds". The
  text is the same except for the rule that holds the camera, which has four conditions.
  The scenario "A camera zoomed in closer than the frame is framed again" becomes "A camera
  zoomed in closer than the frame keeps its view", and "A camera on one system keeps its
  view" is new. OpenSpec cannot drop one scenario from a MODIFIED requirement, so the delta
  removes the old requirement and adds the new one.
- `map-navigation`: the requirement "The host limits the browsable space" names four
  conditions, and it no longer says that a held camera is never nearer than the frame.
- `thargoid-war-cycles-page`: the requirement "A step between cycles holds the camera" is
  replaced by "A step between cycles holds a camera inside the bounds", for the same reason.
  The scenario "A cycle wider than the view is framed again" becomes "An untouched camera is
  held over a wider cycle", and a new scenario reads a camera placed on one system. The
  requirement "The page holds one entry per cycle of the war" changes its `view` row and its
  last paragraph.

## Impact

- `packages/galaxy-map/src/app/create-map.ts`: `viewInsideBounds` loses the frame-distance
  test. `systemsFitDistance` stays, because `applyDatasetView` uses it.
- `packages/galaxy-map/src/app/datasets.ts`: the `DatasetView` and `DatasetEntry.view` doc
  comments and one comment in `runLoad` state the new rule.
- `packages/galaxy-map/src/app/create-map.test.ts`, `e2e/datasets.spec.ts` and
  `e2e/cycles-page.spec.ts`: the tests that read condition 5 read the new rule.
- `apps/demo/cycles/main.ts`, `apps/demo/canonn/main.ts` and `apps/demo/src/main.ts`:
  comments only.
- `docs/wiki/Examples/A-dataset-catalog.md`: the paragraph that lists the conditions.
