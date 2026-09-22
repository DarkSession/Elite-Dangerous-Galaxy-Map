## MODIFIED Requirements

### Requirement: The handle releases what it holds on dispose

`dispose` SHALL stop the frame loop, SHALL remove the event listeners the map added,
SHALL delete the GPU objects the passes hold, and SHALL terminate any scene-data worker
that is still running. A second call SHALL do nothing and SHALL NOT throw.

`dispose` SHALL remove every overlay element the map placed from the label host, the
region labels among them, whether the host is the library's own or one the options gave.
The region labels stayed in a host-given label host after `dispose`, because the overlay
had no clear. `dispose` SHALL release any pointer capture the canvas holds, so a map
disposed in the middle of a drag gives the canvas back without one.

`loadSceneData` starts three workers and terminates each one when its own promise
settles, so there is no way to stop a load that is still running. It SHALL take a cancel
signal, and SHALL terminate every worker it started when the signal fires.

#### Scenario: Dispose stops the map and repeats safely

- **WHEN** the browser test waits for `ready`, reads `debug.frameStats().frames`, calls
  `dispose`, waits 10 animation frames, reads it again, and calls `dispose` a second time
- **THEN** the two readings are equal and the second call throws nothing

#### Scenario: Dispose leaves nothing in a host-given label host

- **WHEN** the browser test opens a map with a `labelHost` of its own at a view that
  places region labels, waits for a frame, calls `dispose` and counts the elements of
  that host
- **THEN** the count is 0

#### Scenario: Dispose releases the pointer capture

- **WHEN** a unit test starts a drag on the canvas with a pointer id and calls `dispose`
  before the pointer goes up
- **THEN** the canvas releases the capture of that id

## ADDED Requirements

### Requirement: Every visibility setter takes one rule

The handle carries one setter for each thing it can hide: the regions, the shapes, the
nebulae, the system names, the system icons, the grid and the cursor marker. Every one of
them SHALL leave the state unchanged and SHALL report nothing when the value is not a
boolean. Three setters read a non-boolean their own way: the names and the grid read it
as off, and the cursor marker read it as on. The start-up options keep the default each
capability states for them; the rule here is for the setters alone.

This requirement governs the rule. `galactic-regions` and `system-icons` state the same
rule for their own switch, and an edit of one of the three SHALL keep the three the same.
Every reader SHALL be named `is<Thing>Visible` for one thing and `are<Things>Visible`
for many, so a host learns the name from the thing. The two category filters,
`setCategoryVisible(name, visible)` and `setShapeCategoryVisible(name, visible)`, take a
name and are not switches; this rule does not reach them.

#### Scenario: A non-boolean leaves every switch as it is

- **WHEN** a unit test reads each of the seven switches, calls each setter with the string
  `'yes'` and with `undefined`, and reads each switch again
- **THEN** every second reading equals the first
