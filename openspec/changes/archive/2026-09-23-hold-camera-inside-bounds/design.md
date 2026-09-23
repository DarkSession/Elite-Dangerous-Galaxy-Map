## Context

The state machine in `packages/galaxy-map/src/app/datasets.ts` reads conditions 1 to 3 from
the entry. It asks `viewInsideBounds` in `packages/galaxy-map/src/app/create-map.ts` for the
rest. `viewInsideBounds` does four tests:

1. an `unrestricted` bound gives false;
2. an empty system box gives false;
3. a distance above the far zoom limit of the resolved bounds gives false;
4. a distance under `systemsFitDistance()` gives false. This is condition 5.

It then tests the cursor against the resolved shape. Test 4 is the one line that causes the
problem in `proposal.md`.

## Goals / Non-Goals

**Goals:**

- Delete condition 5, with its tests, its comments and its documentation.

**Non-Goals:**

- A new option or a new member of the handle. The rule has no setting today, and this change
  adds none.
- Any record of whether the user moved the camera. The owner chose to hold an untouched
  camera too, so the rule needs no such state.

## Decisions

**D1. Delete the one test in `viewInsideBounds`.** Delete
`if (view.distance < systemsFitDistance()) return false;` and its comment. Keep
`systemsFitDistance`, because `applyDatasetView` uses it to write the frame.

The other way is a new host option that turns condition 5 on or off. No host asks for
condition 5, and the owner asked for the camera to stay. An option would be code for a case
with no user.

**D2. Keep the empty-box test.** The comment on it today gives condition 5 as the reason: the
empty box keeps the corners of the set before it, and the frame distance would read them.
That reason goes. The test stays, because the spec keeps condition 2 as it was. A load that
wrote no system takes the entry's `view`. That view moves no camera, but it ends a flight,
and the scenario "An auto bound over an empty set applies the view" reads that. Only the
comment changes: a load that wrote no system has no set to hold the camera over.

**D3. Replace the two requirements in whole.** OpenSpec rejects a MODIFIED requirement that
drops a scenario of the current spec. The two requirements that change each lose one
scenario. The delta therefore removes each one and adds it again under a new name. The
text of `dataset-catalog` does not change except for the rule that holds the camera. The
other option is to keep the scenario name and change its body. Then the scenario name
states the opposite of the body.

**D4. Tests.** Each test that reads condition 5 changes to read the new rule. The new tests
must fail on the code of today:

| File                                         | Test today                                                   | After the change                                                                           |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/galaxy-map/src/app/create-map.test.ts` | "holds the view at the frame distance and frames it below"   | "holds the view below the frame distance": `FIT - 1` and `20` both hold the view            |
| `e2e/datasets.spec.ts`                       | "a camera zoomed in closer than the frame is framed again"   | "a camera zoomed in closer than the frame keeps its view"                                  |
| `e2e/datasets.spec.ts`                       | none                                                         | "a camera on one system keeps its view"                                                    |
| `e2e/cycles-page.spec.ts`                    | "a cycle wider than the view is framed again"                | "an untouched camera is held over a wider cycle"                                           |
| `e2e/cycles-page.spec.ts`                    | none                                                         | "stepping to the next cycle holds a camera on one system"                                  |
| `e2e/cycles-page.spec.ts`                    | "opens the camera on the box of the cycle it loads"          | Deleted. It reads the re-frame that condition 5 caused. The untouched-camera test replaces it |

The test "opens the camera on the box of the cycle it loads" can still pass after the change,
if the centre of the first cycle happens to lie in the box of the second. It then passes for
a reason the test does not state, so it goes.

The cycles-page test for one system takes the coordinates of the first record of the first
cycle from the committed file. It sets the distance to 20 light years, which is above the
near limit of 10. The `auto` bound of the second cycle grows its box by 1,000 light years,
so a cursor in the first cycle is inside it. The test asserts the view is equal before and
after, so it fails if that does not hold.

## Risks / Trade-offs

- [A reader who never touches the camera sees part of a wider cycle] → The owner accepted
  this. The first cycle frames at 52 light years and the second at 223, so the reader
  zooms out once. A host that wants the frame on every load names a field beside `fit`.
- [The Canonn page holds a camera zoomed in on one region when a map that spans the galaxy
  loads] → The same trade-off. The `auto` bound of that map holds the camera, so the map
  keeps the camera. A map in another region still frames, because its bounds do not hold
  the camera.
- [The wiki and the doc comments state five conditions] → Task 3 changes each place that
  names them. A `grep` for "five conditions" and "condition 5" in the tree finds none after
  the change.

## Migration Plan

No host code changes. The change is one release. To go back, revert the commit.
