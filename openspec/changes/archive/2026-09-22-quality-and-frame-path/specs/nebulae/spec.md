## MODIFIED Requirements

### Requirement: The host and the user turn the nebulae off and on

The map handle SHALL carry three members for the nebulae.

- `hasNebulae()` SHALL return whether the map was built with a nebula source it can read.
- `setNebulaeVisible(on)` SHALL turn the nebulae off and on. On a map that holds no
  source it SHALL do nothing and SHALL NOT throw.
- `areNebulaeVisible()` SHALL return the state the map is in. On a map that holds no
  source it SHALL return `false`.

The nebulae SHALL open visible on a map that holds a source. Turning them off SHALL leave
the records and the volume set loaded, so turning them on again draws in the next frame and
fetches nothing.

The switch SHALL change what draws and SHALL NOT change the selection, the zoom band or
the budget. With the nebulae off the pass SHALL report 0 drawn instances and 0 draw calls.

**The two switches are not the same switch.** The renderer's `nebulae` pass switch is a
probe the browser tests read, and the host switch is on the handle. The pass switch off
and the host switch off SHALL draw the same frame, and neither SHALL move the other's
reading: `areNebulaeVisible()` SHALL read what the host set, whatever the pass switch is,
and a host switch write SHALL NOT turn a pass switch back on. The regions, the shapes, the
grid and the icons hold this rule already, and the nebulae wrote one field for both.

#### Scenario: The switch removes the sprites and gives them back

- **WHEN** the browser test opens a map with the nebula source inside the zoom band,
  reads the drawn count, calls `setNebulaeVisible(false)` and reads it again, then calls
  `setNebulaeVisible(true)` and reads it a third time
- **THEN** the readings are above 0, exactly 0, and above 0, and the third frame issues
  no new request.

  The scenario keeps its name from the sprite pass so the delta drops nothing. What it
  reads is the nebula pass, whatever that pass draws with.

#### Scenario: A map with no source reports no nebulae

- **WHEN** a unit test builds a map with no `nebulae` option and calls `hasNebulae`,
  `areNebulaeVisible` and `setNebulaeVisible(true)`
- **THEN** the first two return `false`, the third throws nothing, and
  `areNebulaeVisible` still returns `false`

#### Scenario: The pass switch and the host switch stay apart

- **WHEN** the browser test opens a map with the nebula source inside the zoom band,
  calls `debug.setPasses({ nebulae: false })`, reads `areNebulaeVisible()` and the drawn
  count, then calls `setNebulaeVisible(true)` and reads the drawn count again
- **THEN** the reading is true and both counts are 0
