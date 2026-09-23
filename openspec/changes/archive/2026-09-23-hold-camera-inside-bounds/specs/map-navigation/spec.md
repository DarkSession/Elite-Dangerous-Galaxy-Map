## MODIFIED Requirements

### Requirement: The host limits the browsable space

The map SHALL take a **browsable bounds** setting in one of three modes, and SHALL clamp
both the cursor and the far zoom limit to it. A host names it in the options as `bounds`
and changes it with `setBounds`. `getBounds` SHALL read back the setting as the host gave
it, and not the shape the map worked out from it.

**A dataset load is a third writer.** An entry of the catalog may carry a `bounds` of its
own, which `dataset-catalog` states, and the load writes it by the same route `setBounds`
takes. An entry that names none restores the setting the options named. `getBounds` SHALL
read back whichever of the three wrote last, so a host reads what is in force and not what
it asked for.

**`unrestricted`** is the default and is what the map did before: the cursor clamps to the
model bounds on each axis and the far zoom limit is 120,000 light years.

**`auto`** takes the smallest axis-aligned box that holds every system of the set, grown
by a margin on every axis. The margin SHALL be `marginLy`, and **1,000** light years where
the host names none. The map SHALL keep the box as records arrive and SHALL NOT sweep the
set: `addSystems` widens it and `clearSystems`, `clearSystemsAndCategories` and a dataset
load reset it. With **no system in the set** the mode SHALL act as `unrestricted`, because
an empty box would pin the camera to a point.

**`sphere`** takes a `centre` in game coordinates and a `radiusLy`. A cursor outside the
sphere SHALL be moved to the nearest point on its surface, so a drag along the edge slides
rather than stops.

**The far zoom limit** SHALL be `min(120000, max(10, R / sin(30 degrees)))`, which is
`2 * R`, where `R` is the radius of the sphere, or half the diagonal of the box for
`auto`. At that distance the bound just fills the height of the frame, so the user can see
the whole of the space they may browse and no more. The floor of 10 light years holds the
limit at or above the close limit for a very small space.

**`2 * R` is the exact value and not the value in doubles.** `sin(30 degrees)` reads
0.49999999999999994 in a double, so `R / sin(30 degrees)` lands a few parts in 10^16 above
`2 * R`: a radius of 1,000 gives 2000.0000000000002 and a radius of 3,000 gives
6000.000000000001. A test SHALL read the limit with a tolerance, or against a value it
worked out the same way. An exclusive bound on the round number fails on a value the limit
is meant to reach.

**`fit: 'systems'` of a dataset view reads the same rule.** It sets the distance to `2 * R`
over half the diagonal of the set's own box, before the margin an `auto` bound adds. An
entry that names both therefore opens on the systems **where it opens at all**, and can pull
back to the margin: the zoom the bound allows is wider than the frame `fit` opens at, because
the margin is room to fly and not room to look at.

**A load that holds the camera writes no distance at all.** `dataset-catalog` states four
conditions under which a `loadDataset` that is not the start load leaves the camera where it
is. Where they hold, the entry's `view` does not apply, so this rule does not run and the
camera keeps its distance. A held camera can be nearer than the frame of the new set.

**A change of the bounds SHALL re-clamp the view in the frame it happens**, so a host that
narrows the space while the camera is outside it does not leave the camera there. The view
change listeners SHALL be raised where the clamp moves the view.

**A change of the bounds SHALL also end a running wheel zoom glide whose target is outside
the new far limit.** The glide holds a target the wheel clamped against the space of its
own moment, and it writes the distance with no clamp of its own, so a space that narrows
under it must drop it. The live distance is often still inside the new limit when the call
lands, so the re-clamp above does not catch this on its own.

A bounds setting the map cannot read SHALL leave the setting as it was. A `radiusLy` of 0
or less, a `centre` that is not three finite numbers, and a `marginLy` below 0 are all
unreadable.

The bounds SHALL NOT change what the map draws. A system, a shape or a region line outside
the bounds still draws where the frame holds it.

#### Scenario: Auto bounds follow the systems

- **WHEN** the browser test sets `auto` bounds with no margin named, adds systems spanning
  (-500, 0, -500) to (500, 0, 500), and moves the cursor to (5,000, 0, 0)
- **THEN** the cursor's `x` is 1,500, which is the box edge plus the 1,000 light year
  default margin

#### Scenario: Auto bounds widen as records arrive

- **WHEN** the browser test sets `auto` bounds, adds one system at the origin, reads the
  far zoom limit, adds a second system at (10,000, 0, 0) and reads it again
- **THEN** the second reading is larger than the first

#### Scenario: Auto bounds with an empty set do not restrict

- **WHEN** the browser test sets `auto` bounds with no system in the set and moves the
  cursor to (40,000, 0, 0)
- **THEN** the cursor is (40,000, 0, 0) and the far zoom limit is 120,000

#### Scenario: Clearing the systems resets auto bounds

- **WHEN** the browser test sets `auto` bounds, adds systems spanning 1,000 light years,
  calls `clearSystems` and moves the cursor to (40,000, 0, 0)
- **THEN** the cursor is (40,000, 0, 0)

#### Scenario: A dataset load writes the bounds and getBounds reads it

- **WHEN** the browser test builds a map naming `bounds: { mode: 'unrestricted' }` and two
  entries, the first naming `bounds: { mode: 'auto' }` and the second naming none, loads
  the first, reads `getBounds`, loads the second and reads it again
- **THEN** the first reading is the `auto` mode and the second is `unrestricted`

#### Scenario: A sphere bound caps the zoom

- **WHEN** the browser test sets a sphere bound of radius 3,000 light years, sends 100
  backward wheel notches and reads the view
- **THEN** the distance is 6,000 light years

#### Scenario: Narrowing the bounds moves the camera in

- **WHEN** the browser test opens a view at (40,000, 0, 0) at a distance of 100,000 light
  years, then sets a sphere bound of radius 1,000 light years at the origin, and reads the
  view in the next frame
- **THEN** the cursor is on the sphere's surface, the distance is 2,000, and the view
  change listener fired

#### Scenario: Narrowing the bounds drops a running zoom glide

- **WHEN** the browser test opens a view at 1,000 light years, sends ten backward wheel
  notches, lets one frame of the glide run, and then reads the live distance and the glide
  target and sets a sphere bound whose far zoom limit falls between the two, all in one
  task
- **THEN** the distance in that task is still the one the test read, because the re-clamp
  had nothing to do, the glide target reads null, and one second later the distance is
  still that one

  The bound is worked out from the two readings rather than fixed, so the re-clamp cannot
  be the rule that holds the camera. A test that fixed the bound would race the glide: on
  a run where the glide passed the new limit first, the clamp pulls the camera back and
  the reading says nothing about the target.

#### Scenario: An unreadable bound changes nothing

- **WHEN** the browser test sets a sphere bound of radius 3,000, then calls `setBounds`
  with a radius of 0, and reads `getBounds`
- **THEN** the reading is still the sphere of radius 3,000

#### Scenario: The bounds do not hide anything

- **WHEN** the browser test sets a sphere bound of radius 100 light years at the origin,
  adds a system at (5,000, 0, 0), opens a view that holds both on the screen and reads the
  marker count
- **THEN** the count holds the far system
